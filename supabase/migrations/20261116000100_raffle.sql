-- =====================================================================
-- Sorteo exclusivo: solo participan clientes con boleto.
--
-- Boletos: los da el personal desde el panel (buscando al cliente o
-- escaneando el código que el cliente ve en su pestaña «Sorteo»), o el
-- cliente registra un código de un solo uso impreso en su ticket de compra.
-- El ganador lo elige el servidor con aleatoriedad segura: con un botón del
-- administrador o automáticamente a la fecha y hora fijadas.
--
-- Igual que el resto del sistema: los clientes no escriben en ninguna tabla;
-- todo pasa por funciones SECURITY DEFINER que validan rol y reglas.
-- =====================================================================

create table public.raffles (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(btrim(title)) between 1 and 60),
  prize             text not null check (char_length(btrim(prize)) between 1 and 60),
  prize_headline    text not null check (char_length(btrim(prize_headline)) between 1 and 60),
  prize_detail      text check (prize_detail is null or char_length(prize_detail) <= 160),
  prize_image_url   text check (prize_image_url is null or prize_image_url ~ '^https://[^\s"''()<>]+$'),
  unlock_at         timestamptz not null,
  draw_at           timestamptz not null,
  draw_mode         text not null default 'manual' check (draw_mode in ('manual', 'auto')),
  max_per_customer  integer not null default 5 check (max_per_customer between 1 and 50),
  claim_days        integer not null default 30 check (claim_days between 1 and 365),
  -- draft: solo lo ve el panel · published: lo ven los clientes · archived: oculto
  status            text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  next_ticket       integer not null default 1 check (next_ticket >= 1),
  winner_ticket_id  uuid,
  drawn_at          timestamptz,
  drawn_by          uuid references public.profiles (id),
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint raffles_dates check (draw_at > unlock_at)
);
-- Un solo sorteo visible para los clientes a la vez.
create unique index raffles_single_published on public.raffles ((true)) where status = 'published';

create table public.raffle_codes (
  id          uuid primary key default gen_random_uuid(),
  raffle_id   uuid not null references public.raffles (id),
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8,12}$'),
  active      boolean not null default true,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  used_by     uuid references public.profiles (id),
  used_at     timestamptz
);
create index raffle_codes_raffle_idx on public.raffle_codes (raffle_id, created_at desc);

create table public.raffle_tickets (
  id           uuid primary key default gen_random_uuid(),
  raffle_id    uuid not null references public.raffles (id),
  number       integer not null check (number >= 1),
  user_id      uuid not null references public.profiles (id),
  source       text not null check (source in ('panel', 'code')),
  code_id      uuid references public.raffle_codes (id),
  reason       text check (reason is null or char_length(reason) <= 120),
  granted_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  void_reason  text check (void_reason is null or char_length(void_reason) <= 160),
  voided_by    uuid references public.profiles (id),
  unique (raffle_id, number)
);
create index raffle_tickets_user_idx on public.raffle_tickets (raffle_id, user_id);

alter table public.raffles
  add constraint raffles_winner_fk foreign key (winner_ticket_id) references public.raffle_tickets (id);

-- «Avísame cuando abra»: quién lo pidió (el aviso en sí se decide aparte).
create table public.raffle_reminders (
  raffle_id   uuid not null references public.raffles (id),
  user_id     uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  primary key (raffle_id, user_id)
);

create trigger raffles_touch before update on public.raffles
  for each row execute function private.touch_updated_at();

-- Los boletos no se borran ni se reescriben: solo pueden anularse (con motivo).
create function private.raffle_tickets_guard()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los boletos no se pueden borrar; anúlalos con un motivo.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['voided_at', 'void_reason', 'voided_by']) is distinct from
     (to_jsonb(old) - array['voided_at', 'void_reason', 'voided_by'])
     or old.voided_at is not null then
    raise exception 'Un boleto solo puede anularse una vez.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger raffle_tickets_guard before update or delete on public.raffle_tickets
  for each row execute function private.raffle_tickets_guard();

alter table public.raffles enable row level security;
alter table public.raffle_codes enable row level security;
alter table public.raffle_tickets enable row level security;
alter table public.raffle_reminders enable row level security;
revoke all on public.raffles, public.raffle_codes, public.raffle_tickets, public.raffle_reminders
  from public, anon, authenticated;

-- =====================================================================
-- Auxiliares
-- =====================================================================

-- Nombre público abreviado: «Mariana López» → «Mariana L.» (privacidad).
create function private.raffle_short_name(p_user_id uuid)
returns text language sql stable security definer set search_path = public, private, pg_temp
as $$
  select coalesce(
    (select case
       when cardinality(w) >= 2 and substring(w[2] from '[[:alpha:]]') is not null
         then w[1] || ' ' || upper(substring(w[2] from '[[:alpha:]]')) || '.'
       else w[1]
     end
     from (select regexp_split_to_array(btrim(display_name), '\s+') as w
             from public.profiles where id = p_user_id and nullif(btrim(display_name), '') is not null) x),
    (select private.mask_email(email) from public.profiles where id = p_user_id),
    'Cliente')
$$;

create function private.raffle_phase(r public.raffles, p_now timestamptz)
returns text language sql stable set search_path = public, pg_temp
as $$
  select case
    when r.winner_ticket_id is not null then 'drawn'
    when p_now < r.unlock_at then 'locked'
    else 'open'
  end
$$;

-- Elige el boleto ganador entre los boletos vigentes (no anulados).
create function private.draw_raffle(p_raffle_id uuid, p_actor uuid)
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
  update public.raffles set winner_ticket_id = v_ticket.id, drawn_at = v_now, drawn_by = p_actor where id = r.id;
  perform private.audit('raffle.draw', 'raffle', r.id::text, jsonb_build_object(
    'winner_ticket', v_ticket.number, 'winner_user', v_ticket.user_id, 'total_tickets', v_total,
    'mode', case when p_actor is null then 'auto' else 'manual' end));
  return jsonb_build_object('ok', true, 'number', v_ticket.number, 'total', v_total,
    'name', private.raffle_short_name(v_ticket.user_id));
end $$;

-- Sorteos automáticos vencidos. La llama la tarea programada (pg_cron) cada
-- minuto y también get_raffle_state, por si la tarea no estuviera disponible.
create function private.run_due_raffle_draws()
returns void language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.raffles
     where status = 'published' and draw_mode = 'auto' and winner_ticket_id is null and draw_at <= private.now()
     for update skip locked
  loop
    perform private.draw_raffle(v_id, null);
  end loop;
end $$;

create function private.raffle_errors(p jsonb)
returns text[] language plpgsql stable set search_path = public, private, pg_temp
as $$
declare
  e text[] := '{}';
  v_unlock timestamptz;
  v_draw timestamptz;
  v text;
  n integer;
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
  return e;
end $$;

-- =====================================================================
-- Clientes
-- =====================================================================

-- Estado del sorteo visible (o null si no hay ninguno publicado) y, con sesión, los boletos propios.
create function public.get_raffle_state()
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
      'phase', private.raffle_phase(r, v_now),
      'total_tickets', (select count(*) from public.raffle_tickets where raffle_id = r.id and voided_at is null),
      'winner', v_winner),
    'me', case when v_uid is null then null else jsonb_build_object(
      'tickets', coalesce((select jsonb_agg(jsonb_build_object('number', x.number, 'source', x.source, 'created_at', x.created_at) order by x.number)
                             from public.raffle_tickets x where x.raffle_id = r.id and x.user_id = v_uid and x.voided_at is null), '[]'::jsonb),
      'reminder', exists (select 1 from public.raffle_reminders m where m.raffle_id = r.id and m.user_id = v_uid))
    end);
end $$;

-- El cliente registra el código de su ticket de compra (vale un boleto).
create function public.redeem_raffle_code(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles%rowtype;
  r public.raffles%rowtype;
  v_code public.raffle_codes%rowtype;
  v_now timestamptz;
  v_have integer;
  v_number integer;
begin
  if v_uid is null then
    return private.err('not_authenticated');
  end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found or v_prof.is_blocked or v_prof.anonymized_at is not null then
    return private.err('account_blocked');
  end if;
  if private.rate_blocked('rcode:' || v_uid::text, 8, 600) then
    return private.err('too_many_attempts');
  end if;
  select * into r from public.raffles where status = 'published' for update;
  if not found then
    return private.err('no_raffle');
  end if;
  v_now := private.now();
  if r.winner_ticket_id is not null then
    return private.err('raffle_closed');
  end if;
  if v_now < r.unlock_at then
    return private.err('raffle_not_open');
  end if;
  select * into v_code from public.raffle_codes
   where code = private.norm_code(p_code) and raffle_id = r.id and active and used_at is null
   for update;
  if not found then
    perform private.rate_hit('rcode:' || v_uid::text, 8, 600);
    return private.err('invalid_code');
  end if;
  select count(*) into v_have from public.raffle_tickets where raffle_id = r.id and user_id = v_uid and voided_at is null;
  if v_have >= r.max_per_customer then
    return private.err('max_tickets', jsonb_build_object('max', r.max_per_customer));
  end if;
  v_number := r.next_ticket;
  update public.raffles set next_ticket = next_ticket + 1 where id = r.id;
  insert into public.raffle_tickets (raffle_id, number, user_id, source, code_id, created_at)
  values (r.id, v_number, v_uid, 'code', v_code.id, v_now);
  update public.raffle_codes set used_by = v_uid, used_at = v_now, active = false where id = v_code.id;
  return jsonb_build_object('ok', true, 'number', v_number);
end $$;

-- «Avísame cuando abra»: activa o desactiva el recordatorio (solo antes de que abra).
create function public.toggle_raffle_reminder()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  r public.raffles%rowtype;
begin
  if v_uid is null then
    return private.err('not_authenticated');
  end if;
  select * into r from public.raffles where status = 'published';
  if not found then
    return private.err('no_raffle');
  end if;
  if private.raffle_phase(r, private.now()) <> 'locked' then
    return private.err('raffle_open');
  end if;
  if exists (select 1 from public.raffle_reminders where raffle_id = r.id and user_id = v_uid) then
    delete from public.raffle_reminders where raffle_id = r.id and user_id = v_uid;
    return jsonb_build_object('ok', true, 'reminder', false);
  end if;
  insert into public.raffle_reminders (raffle_id, user_id, created_at) values (r.id, v_uid, private.now());
  return jsonb_build_object('ok', true, 'reminder', true);
end $$;

-- =====================================================================
-- Personal de tienda: dar boletos
-- =====================================================================

-- Busca clientes por nombre o correo, o por el código QR de su pestaña «Sorteo» (LUKY-CLIENTE:<id>).
create function public.staff_find_customer(p_query text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_admin boolean;
  v_raffle uuid;
  v_like text;
  v_id uuid;
begin
  perform private.require_staff();
  v_admin := private.is_admin();
  select id into v_raffle from public.raffles where status = 'published';
  if v_q ~* '^LUKY-CLIENTE:' then
    v_q := btrim(substr(v_q, 14));
  end if;
  if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := v_q::uuid;
  elsif char_length(v_q) < 2 then
    return '[]'::jsonb;
  else
    v_like := '%' || private.like_escape(v_q) || '%';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'name', u.display_name,
      'email', case when v_admin then u.email else private.mask_email(u.email) end,
      'tickets', (select count(*) from public.raffle_tickets t where t.raffle_id = v_raffle and t.user_id = u.id and t.voided_at is null)
    ) order by u.display_name nulls last, u.email)
    from (select * from public.profiles p
           where not p.is_blocked and p.anonymized_at is null
             and ((v_id is not null and p.id = v_id)
                  or (v_id is null and (p.email ilike v_like or p.display_name ilike v_like)))
           order by p.display_name nulls last, p.email limit 8) u), '[]'::jsonb);
end $$;

create function public.staff_grant_raffle_tickets(p_user_id uuid, p_qty integer, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  r public.raffles%rowtype;
  v_prof public.profiles%rowtype;
  v_have integer;
  v_now timestamptz := private.now();
  v_numbers integer[];
begin
  perform private.require_staff();
  if char_length(btrim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 120 then
    return private.err('reason_short');
  end if;
  if p_qty is null or p_qty not between 1 and 50 then
    return private.err('invalid_quantity');
  end if;
  select * into r from public.raffles where status = 'published' for update;
  if not found then
    return private.err('no_raffle');
  end if;
  if r.winner_ticket_id is not null then
    return private.err('raffle_closed');
  end if;
  select * into v_prof from public.profiles where id = p_user_id;
  if not found or v_prof.anonymized_at is not null then
    return private.err('user_not_found');
  end if;
  if v_prof.is_blocked then
    return private.err('account_blocked');
  end if;
  select count(*) into v_have from public.raffle_tickets where raffle_id = r.id and user_id = p_user_id and voided_at is null;
  if v_have + p_qty > r.max_per_customer then
    return private.err('max_tickets', jsonb_build_object('have', v_have, 'max', r.max_per_customer));
  end if;
  select array_agg(n order by n) into v_numbers from generate_series(r.next_ticket, r.next_ticket + p_qty - 1) n;
  update public.raffles set next_ticket = next_ticket + p_qty where id = r.id;
  insert into public.raffle_tickets (raffle_id, number, user_id, source, reason, granted_by, created_at)
  select r.id, n, p_user_id, 'panel', btrim(p_reason), auth.uid(), v_now from unnest(v_numbers) n;
  perform private.audit('raffle.grant', 'raffle', r.id::text, jsonb_build_object(
    'user_id', p_user_id, 'email', v_prof.email, 'qty', p_qty, 'numbers', to_jsonb(v_numbers), 'reason', btrim(p_reason)));
  return jsonb_build_object('ok', true, 'numbers', to_jsonb(v_numbers), 'have', v_have + p_qty);
end $$;

-- =====================================================================
-- Administración
-- =====================================================================

create function public.admin_list_raffles()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz;
begin
  perform private.require_admin();
  perform private.run_due_raffle_draws();
  v_now := private.now();
  return coalesce((
    select jsonb_agg(to_jsonb(r) || jsonb_build_object(
      'phase', private.raffle_phase(r, v_now),
      'tickets', (select count(*) from public.raffle_tickets t where t.raffle_id = r.id and t.voided_at is null),
      'participants', (select count(distinct t.user_id) from public.raffle_tickets t where t.raffle_id = r.id and t.voided_at is null),
      'codes_total', (select count(*) from public.raffle_codes c where c.raffle_id = r.id),
      'codes_free', (select count(*) from public.raffle_codes c where c.raffle_id = r.id and c.active and c.used_at is null),
      'reminders', (select count(*) from public.raffle_reminders m where m.raffle_id = r.id),
      'winner', (select jsonb_build_object('number', t.number, 'name', p.display_name, 'email', p.email, 'user_id', p.id)
                   from public.raffle_tickets t join public.profiles p on p.id = t.user_id where t.id = r.winner_ticket_id)
    ) order by (r.status = 'published') desc, (r.status = 'archived'), r.created_at desc)
    from public.raffles r), '[]'::jsonb);
end $$;

create function public.admin_raffle_detail(p_raffle_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.raffles where id = p_raffle_id) then
    return private.err('no_raffle');
  end if;
  return jsonb_build_object(
    'ok', true,
    'participants', coalesce((
      select jsonb_agg(x order by x ->> 'last_at' desc)
      from (
        select jsonb_build_object(
          'user_id', p.id, 'name', p.display_name, 'email', p.email,
          'last_at', max(t.created_at),
          'tickets', jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'source', t.source, 'reason', t.reason,
                                                  'created_at', t.created_at, 'voided', t.voided_at is not null) order by t.number)
        ) as x
        from public.raffle_tickets t join public.profiles p on p.id = t.user_id
        where t.raffle_id = p_raffle_id
        group by p.id, p.display_name, p.email) s), '[]'::jsonb),
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'used_at', c.used_at, 'active', c.active,
                                          'used_by', (select coalesce(display_name, email) from public.profiles where id = c.used_by))
                       order by c.created_at desc, c.code)
      from (select * from public.raffle_codes where raffle_id = p_raffle_id order by created_at desc, code limit 1000) c), '[]'::jsonb),
    'reminders', (select count(*) from public.raffle_reminders where raffle_id = p_raffle_id));
end $$;

-- Crea (p_raffle_id null) o actualiza un sorteo. Uno ya sorteado no se edita.
create function public.admin_save_raffle(p_raffle_id uuid, p jsonb)
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
                                draw_mode, max_per_customer, claim_days, created_by, created_at, updated_at)
    values (btrim(p ->> 'title'), btrim(p ->> 'prize'), btrim(p ->> 'prize_headline'), nullif(btrim(p ->> 'prize_detail'), ''),
            nullif(p ->> 'prize_image_url', ''), (p ->> 'unlock_at')::timestamptz, (p ->> 'draw_at')::timestamptz,
            p ->> 'draw_mode', (p ->> 'max_per_customer')::integer, (p ->> 'claim_days')::integer,
            auth.uid(), private.now(), private.now())
    returning * into new_r;
    perform private.audit('raffle.create', 'raffle', new_r.id::text, to_jsonb(new_r));
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
    claim_days = (p ->> 'claim_days')::integer
  where id = p_raffle_id
  returning * into new_r;
  if to_jsonb(old_r) - 'updated_at' is distinct from to_jsonb(new_r) - 'updated_at' then
    perform private.audit('raffle.update', 'raffle', p_raffle_id::text, private.jsonb_diff(to_jsonb(old_r), to_jsonb(new_r)));
  end if;
  return jsonb_build_object('ok', true, 'id', p_raffle_id);
end $$;

-- Publicar (lo ven los clientes), volver a borrador u ocultar (archivar).
create function public.admin_set_raffle_status(p_raffle_id uuid, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  r public.raffles%rowtype;
begin
  perform private.require_admin();
  if p_status not in ('draft', 'published', 'archived') then
    return private.err('invalid_status');
  end if;
  select * into r from public.raffles where id = p_raffle_id for update;
  if not found then
    return private.err('no_raffle');
  end if;
  if r.status = p_status then
    return jsonb_build_object('ok', true);
  end if;
  if p_status = 'published' and exists (select 1 from public.raffles where status = 'published' and id <> r.id) then
    return private.err('another_published');
  end if;
  if p_status = 'draft' and r.winner_ticket_id is not null then
    return private.err('raffle_drawn');
  end if;
  update public.raffles set status = p_status where id = r.id;
  perform private.audit('raffle.status', 'raffle', r.id::text, jsonb_build_object('from', r.status, 'to', p_status));
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_create_raffle_codes(p_raffle_id uuid, p_count integer)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  r public.raffles%rowtype;
  v_codes text[] := '{}';
  v_code text;
  v_tries integer := 0;
begin
  perform private.require_admin();
  if p_count is null or p_count not between 1 and 500 then
    return private.err('invalid_quantity');
  end if;
  select * into r from public.raffles where id = p_raffle_id;
  if not found then
    return private.err('no_raffle');
  end if;
  if r.winner_ticket_id is not null or r.status = 'archived' then
    return private.err('raffle_closed');
  end if;
  while coalesce(array_length(v_codes, 1), 0) < p_count and v_tries < p_count * 5 loop
    v_tries := v_tries + 1;
    v_code := private.rand_code(10);
    insert into public.raffle_codes (raffle_id, code, created_by, created_at)
    values (r.id, v_code, auth.uid(), private.now())
    on conflict (code) do nothing;
    if found then
      v_codes := array_append(v_codes, v_code);
    end if;
  end loop;
  perform private.audit('raffle.codes', 'raffle', r.id::text, jsonb_build_object('count', coalesce(array_length(v_codes, 1), 0)));
  return jsonb_build_object('ok', true, 'codes', to_jsonb(v_codes));
end $$;

-- Sorteo con botón (modo «lo realizo yo»). Disponible desde que el sorteo abre.
create function public.admin_draw_raffle(p_raffle_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  r public.raffles%rowtype;
begin
  perform private.require_admin();
  select * into r from public.raffles where id = p_raffle_id for update;
  if not found then
    return private.err('no_raffle');
  end if;
  if r.status <> 'published' then
    return private.err('raffle_not_published');
  end if;
  if r.draw_mode <> 'manual' then
    return private.err('auto_mode');
  end if;
  if private.now() < r.unlock_at then
    return private.err('raffle_not_open');
  end if;
  return private.draw_raffle(r.id, auth.uid());
end $$;

-- Anula un boleto dado por error (antes de sortear). Queda registrado con su motivo.
create function public.admin_void_raffle_ticket(p_ticket_id uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  t public.raffle_tickets%rowtype;
begin
  perform private.require_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 160 then
    return private.err('reason_short');
  end if;
  select * into t from public.raffle_tickets where id = p_ticket_id for update;
  if not found then
    return private.err('not_found');
  end if;
  if exists (select 1 from public.raffles where id = t.raffle_id and winner_ticket_id is not null) then
    return private.err('raffle_drawn');
  end if;
  if t.voided_at is not null then
    return private.err('already_voided');
  end if;
  update public.raffle_tickets set voided_at = private.now(), void_reason = btrim(p_reason), voided_by = auth.uid()
   where id = t.id;
  perform private.audit('raffle.void_ticket', 'raffle', t.raffle_id::text, jsonb_build_object(
    'ticket', t.number, 'user_id', t.user_id, 'reason', btrim(p_reason)));
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- Permisos: todo cerrado salvo las RPC listadas (el rol se valida dentro).
-- =====================================================================
revoke all on function
  private.raffle_tickets_guard(), private.raffle_short_name(uuid), private.raffle_phase(public.raffles, timestamptz),
  private.draw_raffle(uuid, uuid), private.run_due_raffle_draws(), private.raffle_errors(jsonb)
from public, anon, authenticated;

revoke all on function
  public.get_raffle_state(), public.redeem_raffle_code(text), public.toggle_raffle_reminder(),
  public.staff_find_customer(text), public.staff_grant_raffle_tickets(uuid, integer, text),
  public.admin_list_raffles(), public.admin_raffle_detail(uuid), public.admin_save_raffle(uuid, jsonb),
  public.admin_set_raffle_status(uuid, text), public.admin_create_raffle_codes(uuid, integer),
  public.admin_draw_raffle(uuid), public.admin_void_raffle_ticket(uuid, text)
from public, anon, authenticated;

grant execute on function public.get_raffle_state() to anon, authenticated;
grant execute on function
  public.redeem_raffle_code(text), public.toggle_raffle_reminder(),
  public.staff_find_customer(text), public.staff_grant_raffle_tickets(uuid, integer, text),
  public.admin_list_raffles(), public.admin_raffle_detail(uuid), public.admin_save_raffle(uuid, jsonb),
  public.admin_set_raffle_status(uuid, text), public.admin_create_raffle_codes(uuid, integer),
  public.admin_draw_raffle(uuid), public.admin_void_raffle_ticket(uuid, text)
to authenticated;

-- =====================================================================
-- Sorteos automáticos: tarea cada minuto (pg_cron). Si la extensión no
-- existe (pruebas locales, demostración), get_raffle_state los resuelve.
-- =====================================================================
do $cron$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  if exists (select 1 from cron.job where jobname = 'ruleta-sorteos') then
    perform cron.unschedule('ruleta-sorteos');
  end if;
  perform cron.schedule('ruleta-sorteos', '* * * * *', 'select private.run_due_raffle_draws()');
exception when others then
  raise notice 'pg_cron no disponible (%): los sorteos automáticos se resuelven al consultar el estado.', sqlerrm;
end $cron$;
