-- =====================================================================
-- Sorteo: se quita el número de permiso. Para publicar basta con explicar
-- cómo se consigue un boleto y tener bases completas (sin [COMPLETAR …]).
-- =====================================================================

create or replace function private.raffle_errors(p jsonb)
returns text[] language plpgsql stable set search_path = public, private, pg_temp
as $$
declare
  e text[] := '{}';
  v_unlock timestamptz;
  v_draw timestamptz;
  v text;
  n integer;
  x numeric;
begin
  if char_length(btrim(coalesce(p ->> 'title', ''))) not between 1 and 60 then e := array_append(e, 'Nombre del sorteo: 1 a 60 caracteres.'); end if;
  if char_length(btrim(coalesce(p ->> 'prize', ''))) not between 1 and 60 then e := array_append(e, 'Premio: 1 a 60 caracteres.'); end if;
  if char_length(btrim(coalesce(p ->> 'prize_headline', ''))) not between 1 and 60 then e := array_append(e, 'Frase de la tarjeta: 1 a 60 caracteres.'); end if;
  if char_length(coalesce(p ->> 'prize_detail', '')) > 160 then e := array_append(e, 'Detalle del premio: máximo 160 caracteres.'); end if;
  v := coalesce(p ->> 'prize_image_url', '');
  if v <> '' and v !~ '^https://[^\s"''()<>]+$' then e := array_append(e, 'La imagen del premio debe ser una URL https válida.'); end if;
  begin v_unlock := (p ->> 'unlock_at')::timestamptz; exception when others then v_unlock := null; end;
  begin v_draw := (p ->> 'draw_at')::timestamptz; exception when others then v_draw := null; end;
  if v_unlock is null then e := array_append(e, 'Indica cuándo se abre el sorteo.'); end if;
  if v_draw is null then e := array_append(e, 'Indica la fecha y hora del sorteo.'); end if;
  if v_unlock is not null and v_draw is not null and v_draw <= v_unlock then
    e := array_append(e, 'La fecha del sorteo debe ser posterior a la apertura.');
  end if;
  if coalesce(p ->> 'draw_mode', '') not in ('manual', 'auto') then e := array_append(e, 'Elige cómo se elige al ganador.'); end if;
  begin n := (p ->> 'max_per_customer')::integer; exception when others then n := null; end;
  if n is null or n not between 1 and 50 then e := array_append(e, 'Máximo de boletos por cliente: de 1 a 50.'); end if;
  begin n := (p ->> 'claim_days')::integer; exception when others then n := null; end;
  if n is null or n not between 1 and 365 then e := array_append(e, 'Días para reclamar el premio: de 1 a 365.'); end if;
  if char_length(coalesce(p ->> 'how_to_get', '')) > 240 then e := array_append(e, 'Cómo se consigue un boleto: máximo 240 caracteres.'); end if;
  if char_length(coalesce(p ->> 'rules_text', '')) > 12000 then e := array_append(e, 'Bases del sorteo: máximo 12 000 caracteres.'); end if;
  if nullif(p ->> 'prize_value', '') is not null then
    begin x := (p ->> 'prize_value')::numeric; exception when others then x := -1; end;
    if x < 0 then e := array_append(e, 'Valor del premio: un número en pesos (o déjalo vacío).'); end if;
  end if;
  return e;
end $$;

-- Lo que falta para poder publicar.
create or replace function private.raffle_publish_errors(r public.raffles)
returns text[] language plpgsql stable set search_path = public, private, pg_temp
as $$
declare
  e text[] := '{}';
begin
  if nullif(btrim(coalesce(r.how_to_get, '')), '') is null then
    e := array_append(e, 'Explica cómo se consigue un boleto.');
  end if;
  if char_length(btrim(coalesce(r.rules_text, ''))) < 300 then
    e := array_append(e, 'Agrega las bases del sorteo (puedes generarlas con los datos del sorteo).');
  elsif position('[COMPLETAR' in r.rules_text) > 0 then
    e := array_append(e, 'Completa en las bases los datos marcados como [COMPLETAR …].');
  end if;
  return e;
end $$;

create or replace function public.admin_save_raffle(p_raffle_id uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_errors text[];
  old_r public.raffles%rowtype;
  new_r public.raffles%rowtype;
begin
  perform private.require_admin();
  if p is null or jsonb_typeof(p) <> 'object' then
    perform private.raise_validation(array['Datos del sorteo inválidos.']);
  end if;
  v_errors := private.raffle_errors(p);
  if array_length(v_errors, 1) > 0 then
    perform private.raise_validation(v_errors);
  end if;

  if p_raffle_id is null then
    insert into public.raffles (title, prize, prize_headline, prize_detail, prize_image_url, unlock_at, draw_at,
                                draw_mode, max_per_customer, claim_days, how_to_get, prize_value, rules_text,
                                created_by, created_at, updated_at)
    values (btrim(p ->> 'title'), btrim(p ->> 'prize'), btrim(p ->> 'prize_headline'), nullif(btrim(p ->> 'prize_detail'), ''),
            nullif(p ->> 'prize_image_url', ''), (p ->> 'unlock_at')::timestamptz, (p ->> 'draw_at')::timestamptz,
            p ->> 'draw_mode', (p ->> 'max_per_customer')::integer, (p ->> 'claim_days')::integer,
            nullif(btrim(p ->> 'how_to_get'), ''), nullif(p ->> 'prize_value', '')::numeric,
            nullif(btrim(p ->> 'rules_text'), ''),
            auth.uid(), private.now(), private.now())
    returning * into new_r;
    perform private.audit('raffle.create', 'raffle', new_r.id::text, to_jsonb(new_r) - 'rules_text');
    return jsonb_build_object('ok', true, 'id', new_r.id);
  end if;

  select * into old_r from public.raffles where id = p_raffle_id for update;
  if not found then
    return private.err('no_raffle');
  end if;
  if old_r.winner_ticket_id is not null then
    return private.err('raffle_drawn');
  end if;
  update public.raffles set
    title = btrim(p ->> 'title'), prize = btrim(p ->> 'prize'), prize_headline = btrim(p ->> 'prize_headline'),
    prize_detail = nullif(btrim(p ->> 'prize_detail'), ''), prize_image_url = nullif(p ->> 'prize_image_url', ''),
    unlock_at = (p ->> 'unlock_at')::timestamptz, draw_at = (p ->> 'draw_at')::timestamptz,
    draw_mode = p ->> 'draw_mode', max_per_customer = (p ->> 'max_per_customer')::integer,
    claim_days = (p ->> 'claim_days')::integer,
    how_to_get = nullif(btrim(p ->> 'how_to_get'), ''), prize_value = nullif(p ->> 'prize_value', '')::numeric,
    rules_text = nullif(btrim(p ->> 'rules_text'), '')
  where id = p_raffle_id
  returning * into new_r;
  -- Publicado, no puede quedar sin los datos obligatorios.
  if new_r.status = 'published' then
    v_errors := private.raffle_publish_errors(new_r);
    if array_length(v_errors, 1) > 0 then
      perform private.raise_validation(v_errors);
    end if;
  end if;
  if to_jsonb(old_r) - 'updated_at' is distinct from to_jsonb(new_r) - 'updated_at' then
    perform private.audit('raffle.update', 'raffle', p_raffle_id::text,
      private.jsonb_diff(to_jsonb(old_r) - 'rules_text', to_jsonb(new_r) - 'rules_text')
      || case when old_r.rules_text is distinct from new_r.rules_text then jsonb_build_object('rules_text', 'modificadas') else '{}'::jsonb end);
  end if;
  return jsonb_build_object('ok', true, 'id', p_raffle_id);
end $$;

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
      'mine', v_uid is not null and t.user_id = v_uid, 'at', r.drawn_at);
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

alter table public.raffles drop column permit_number;
