-- =====================================================================
-- Premio del sorteo: código secreto para reclamarlo y entrega desde el
-- panel («Canjes»), igual que los cupones de la ruleta.
--
-- - Al elegir al ganador se genera un código de 11 caracteres (los cupones
--   tienen 12, así el panel distingue uno de otro al escribirlo).
-- - Solo la persona ganadora ve su código (con QR) en la pestaña «Sorteo».
-- - El personal lo busca o lo escanea y confirma la entrega; queda en la
--   auditoría. Plazo: los días para reclamar contados desde el sorteo.
-- =====================================================================

alter table public.raffles
  add column claim_code text unique check (claim_code is null or claim_code ~ '^[A-HJ-NP-Z2-9]{11}$'),
  add column claimed_at timestamptz,
  add column claimed_by uuid references public.profiles (id);

create or replace function private.draw_raffle(p_raffle_id uuid, p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  r public.raffles%rowtype;
  v_total integer;
  v_ticket public.raffle_tickets%rowtype;
  v_now timestamptz := private.now();
begin
  select * into r from public.raffles where id = p_raffle_id for update;
  if not found then
    return private.err('no_raffle');
  end if;
  if r.winner_ticket_id is not null then
    return private.err('raffle_drawn');
  end if;
  select count(*) into v_total from public.raffle_tickets where raffle_id = r.id and voided_at is null;
  if v_total = 0 then
    return private.err('no_tickets');
  end if;
  select * into v_ticket from public.raffle_tickets
   where raffle_id = r.id and voided_at is null
   order by number
   offset least(floor(private.rand_unit() * v_total)::integer, v_total - 1) limit 1;
  update public.raffles
     set winner_ticket_id = v_ticket.id, drawn_at = v_now, drawn_by = p_actor, claim_code = private.rand_code(11)
   where id = r.id;
  perform private.audit('raffle.draw', 'raffle', r.id::text, jsonb_build_object(
    'winner_ticket', v_ticket.number, 'winner_user', v_ticket.user_id, 'total_tickets', v_total,
    'mode', case when p_actor is null then 'auto' else 'manual' end));
  return jsonb_build_object('ok', true, 'number', v_ticket.number, 'total', v_total,
    'name', private.raffle_short_name(v_ticket.user_id));
end $$;

-- Sorteos ya realizados antes de este cambio.
update public.raffles set claim_code = private.rand_code(11) where winner_ticket_id is not null and claim_code is null;

-- Estado del premio para el panel. p_full: correo completo (solo administración).
create function private.raffle_claim_json(p_raffle_id uuid, p_full boolean)
returns jsonb language sql stable security definer set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'raffle_id', r.id, 'title', r.title, 'prize', r.prize, 'prize_detail', r.prize_detail,
    'prize_image_url', r.prize_image_url, 'claim_code', r.claim_code,
    'number', t.number, 'name', p.display_name,
    'email', case when p_full then p.email else private.mask_email(p.email) end,
    'drawn_at', r.drawn_at, 'claim_until', r.drawn_at + make_interval(days => r.claim_days),
    'claimed_at', r.claimed_at,
    'claimed_by_name', (select coalesce(s.display_name, s.email) from public.profiles s where s.id = r.claimed_by),
    'status', case
      when r.claimed_at is not null then 'claimed'
      when p.anonymized_at is not null then 'void'
      when private.now() >= r.drawn_at + make_interval(days => r.claim_days) then 'expired'
      else 'pending' end)
  from public.raffles r
  join public.raffle_tickets t on t.id = r.winner_ticket_id
  join public.profiles p on p.id = t.user_id
  where r.id = p_raffle_id
$$;

-- Buscar el premio por su código (no lo entrega).
create function public.staff_lookup_raffle_claim(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform private.require_staff();
  if private.rate_blocked('lookup:' || v_uid::text, 15, 600) then
    return private.err('too_many_attempts');
  end if;
  select id into v_id from public.raffles where claim_code = private.norm_code(p_code) and winner_ticket_id is not null;
  if not found then
    perform private.rate_hit('lookup:' || v_uid::text, 15, 600);
    return private.err('not_found');
  end if;
  return jsonb_build_object('ok', true, 'claim', private.raffle_claim_json(v_id, private.is_admin()));
end $$;

-- Entrega atómica: si dos personas confirman a la vez, solo una la registra.
create function public.staff_claim_raffle_prize(p_raffle_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
  r public.raffles%rowtype;
  v_j jsonb;
begin
  perform private.require_staff();
  update public.raffles x
     set claimed_at = v_now, claimed_by = v_uid
   where x.id = p_raffle_id and x.winner_ticket_id is not null and x.claimed_at is null
     and v_now < x.drawn_at + make_interval(days => x.claim_days)
     and not exists (select 1 from public.raffle_tickets t join public.profiles p on p.id = t.user_id
                      where t.id = x.winner_ticket_id and p.anonymized_at is not null)
   returning * into r;
  if found then
    perform private.audit('raffle.claim', 'raffle', r.id::text, (
      select jsonb_build_object('prize', r.prize, 'winner_ticket', t.number, 'owner_id', t.user_id)
        from public.raffle_tickets t where t.id = r.winner_ticket_id));
    return jsonb_build_object('ok', true, 'claim', private.raffle_claim_json(r.id, private.is_admin()));
  end if;

  v_j := private.raffle_claim_json(p_raffle_id, false);
  if v_j is null then
    return private.err('not_found');
  elsif v_j ->> 'status' = 'claimed' then
    return private.err('already_claimed', jsonb_build_object('claimed_at', v_j -> 'claimed_at', 'claimed_by_name', v_j -> 'claimed_by_name'));
  elsif v_j ->> 'status' = 'void' then
    return private.err('void');
  else
    return private.err('claim_expired', jsonb_build_object('claim_until', v_j -> 'claim_until'));
  end if;
end $$;

-- Estado público: la persona ganadora ve su código mientras no se entregue.
create or replace function public.get_raffle_state()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz;
  r public.raffles%rowtype;
  v_winner jsonb := null;
  t public.raffle_tickets%rowtype;
begin
  perform private.run_due_raffle_draws();
  v_now := private.now();
  select * into r from public.raffles where status = 'published' limit 1;
  if not found then
    return jsonb_build_object('server_time', v_now, 'raffle', null, 'me', null);
  end if;
  if r.winner_ticket_id is not null then
    select * into t from public.raffle_tickets where id = r.winner_ticket_id;
    v_winner := jsonb_build_object('number', t.number, 'name', private.raffle_short_name(t.user_id),
      'mine', v_uid is not null and t.user_id = v_uid, 'at', r.drawn_at,
      'claimed_at', r.claimed_at, 'claim_until', r.drawn_at + make_interval(days => r.claim_days),
      'claim_code', case when v_uid is not null and t.user_id = v_uid and r.claimed_at is null then r.claim_code end);
  end if;
  return jsonb_build_object(
    'server_time', v_now,
    'raffle', jsonb_build_object(
      'id', r.id, 'title', r.title, 'prize', r.prize, 'prize_headline', r.prize_headline,
      'prize_detail', r.prize_detail, 'prize_image_url', r.prize_image_url,
      'unlock_at', r.unlock_at, 'draw_at', r.draw_at, 'draw_mode', r.draw_mode,
      'max_per_customer', r.max_per_customer, 'claim_days', r.claim_days,
      'how_to_get', r.how_to_get, 'prize_value', r.prize_value,
      'rules_text', r.rules_text, 'published_at', r.published_at,
      'phase', private.raffle_phase(r, v_now),
      'total_tickets', (select count(*) from public.raffle_tickets where raffle_id = r.id and voided_at is null),
      'winner', v_winner),
    'me', case when v_uid is null then null else jsonb_build_object(
      'tickets', coalesce((select jsonb_agg(jsonb_build_object('number', x.number, 'source', x.source, 'created_at', x.created_at) order by x.number)
                             from public.raffle_tickets x where x.raffle_id = r.id and x.user_id = v_uid and x.voided_at is null), '[]'::jsonb),
      'reminder', exists (select 1 from public.raffle_reminders m where m.raffle_id = r.id and m.user_id = v_uid))
    end);
end $$;

-- Lista del panel: sin el código secreto; con el estado de la entrega.
create or replace function public.admin_list_raffles()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz;
begin
  perform private.require_admin();
  perform private.run_due_raffle_draws();
  v_now := private.now();
  return coalesce((
    select jsonb_agg((to_jsonb(r) - 'claim_code') || jsonb_build_object(
      'phase', private.raffle_phase(r, v_now),
      'tickets', (select count(*) from public.raffle_tickets t where t.raffle_id = r.id and t.voided_at is null),
      'participants', (select count(distinct t.user_id) from public.raffle_tickets t where t.raffle_id = r.id and t.voided_at is null),
      'codes_total', (select count(*) from public.raffle_codes c where c.raffle_id = r.id),
      'codes_free', (select count(*) from public.raffle_codes c where c.raffle_id = r.id and c.active and c.used_at is null),
      'reminders', (select count(*) from public.raffle_reminders m where m.raffle_id = r.id),
      'winner', (select jsonb_build_object('number', t.number, 'name', p.display_name, 'email', p.email, 'user_id', p.id)
                   from public.raffle_tickets t join public.profiles p on p.id = t.user_id where t.id = r.winner_ticket_id),
      'claim_until', case when r.drawn_at is not null then r.drawn_at + make_interval(days => r.claim_days) end,
      'claimed_by_name', (select coalesce(s.display_name, s.email) from public.profiles s where s.id = r.claimed_by)
    ) order by (r.status = 'published') desc, (r.status = 'archived'), r.created_at desc)
    from public.raffles r), '[]'::jsonb);
end $$;

revoke all on function private.raffle_claim_json(uuid, boolean) from public, anon, authenticated;
revoke all on function public.staff_lookup_raffle_claim(text), public.staff_claim_raffle_prize(uuid) from public, anon, authenticated;
grant execute on function public.staff_lookup_raffle_claim(text), public.staff_claim_raffle_prize(uuid) to authenticated;
