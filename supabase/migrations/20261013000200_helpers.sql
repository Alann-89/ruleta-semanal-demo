-- =====================================================================
-- Ruleta semanal — 2/5: funciones internas (schema private, no expuesto
-- por la API), triggers de inmutabilidad y de alta de usuarios.
-- =====================================================================

-- Hora del servidor. TODA la lógica de negocio usa esta función: el
-- dispositivo del cliente nunca aporta una hora. (Las pruebas locales la
-- sustituyen; en producción es clock_timestamp()).
create function private.now()
returns timestamptz language sql volatile
as $$ select clock_timestamp() $$;

-- Número uniforme en [0,1) con 48 bits de un CSPRNG (gen_random_uuid usa
-- pg_strong_random). Los 12 primeros dígitos hex de un UUID v4 son aleatorios.
create function private.rand_unit()
returns double precision language sql volatile
as $$
  select (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint)::double precision
         / 281474976710656.0
$$;

-- Código aleatorio legible (sin 0/O/1/I). 32 símbolos => 5 bits por carácter.
-- Longitud máx. 12 (60 bits de entropía).
create function private.rand_code(p_len integer default 12)
returns text language plpgsql volatile
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_res text := '';
  i integer;
begin
  if p_len < 1 or p_len > 12 then
    raise exception 'rand_code: longitud inválida %', p_len;
  end if;
  v_bytes := decode(
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'hex');
  for i in 0 .. p_len - 1 loop
    v_res := v_res || substr(c_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;
  return v_res;
end $$;

create function private.norm_code(p_code text)
returns text language sql immutable
as $$ select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create function private.like_escape(p text)
returns text language sql immutable
as $$ select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_') $$;

create function private.mask_email(p text)
returns text language sql immutable
as $$
  select case
    when p is null or position('@' in p) < 2 then null
    else left(p, 1) || '***' || substr(p, position('@' in p))
  end
$$;

-- ---------------------------------------------------------------------
-- Semanas: lunes 00:00 -> domingo 23:59:59.999 en la zona de la campaña.
-- date_trunc('week') es ISO (lunes). No existe "espera de 7 días".
-- ---------------------------------------------------------------------
create function private.week_start(p_ts timestamptz, p_tz text)
returns date language sql stable
as $$ select date_trunc('week', p_ts at time zone p_tz)::date $$;

-- Instante exacto (timestamptz) en que empieza el lunes p_week en la zona.
create function private.week_start_ts(p_week date, p_tz text)
returns timestamptz language sql stable
as $$ select p_week::timestamp at time zone p_tz $$;

-- ---------------------------------------------------------------------
-- Respuestas JSON de error "esperado" (no revierten la transacción, así los
-- contadores de intentos fallidos sí se conservan).
-- ---------------------------------------------------------------------
create function private.err(p_code text, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql immutable
as $$ select jsonb_build_object('ok', false, 'error', p_code) || coalesce(p_extra, '{}'::jsonb) $$;

-- ---------------------------------------------------------------------
-- Roles. SECURITY DEFINER para poder leer profiles sin recursión de RLS.
-- ---------------------------------------------------------------------
create function private.app_role()
returns text language sql stable security definer set search_path = public, pg_temp
as $$ select role from public.profiles where id = auth.uid() and not is_blocked $$;

create function private.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and not is_blocked), false) $$;

create function private.is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select role in ('staff', 'admin') from public.profiles where id = auth.uid() and not is_blocked), false) $$;

create function private.require_admin()
returns void language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create function private.require_staff()
returns void language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------
create function private.audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
begin
  insert into public.audit_log (at, actor_id, actor_email, action, entity, entity_id, details)
  values (
    private.now(),
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb)
  );
end $$;

-- Diferencias {campo: {from, to}} entre dos jsonb (para la auditoría).
create function private.jsonb_diff(p_old jsonb, p_new jsonb)
returns jsonb language sql immutable
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', p_old -> k, 'to', p_new -> k)), '{}'::jsonb)
  from (
    select key as k from jsonb_each(p_new)
    where key not in ('updated_at', 'created_at') and (p_old -> key) is distinct from (p_new -> key)
  ) d
$$;

-- ---------------------------------------------------------------------
-- Límite de solicitudes (ventana fija). Los fallos se cuentan con rate_hit
-- y se consultan con rate_blocked.
-- ---------------------------------------------------------------------
create function private.rate_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := private.now();
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    count = case when r.window_start < v_now - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < v_now - make_interval(secs => p_window_seconds) then v_now else r.window_start end
  returning count into v_count;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < v_now - interval '1 day';
  end if;
  return v_count <= p_max;
end $$;

create function private.rate_blocked(p_key text, p_max integer, p_window_seconds integer)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((
    select count >= p_max and window_start >= private.now() - make_interval(secs => p_window_seconds)
    from public.rate_limits where key = p_key
  ), false)
$$;

-- ---------------------------------------------------------------------
-- Campaña vigente: la activa, si no la pausada, si no la borrador más
-- reciente, y por último la cerrada más reciente.
-- ---------------------------------------------------------------------
create function private.current_campaign_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $$
  select id from public.campaigns
  order by case status when 'active' then 0 when 'paused' then 1 when 'draft' then 2 else 3 end, created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------
-- Disponibilidad de cada resultado activo en este instante.
-- p_cap_reached: la cuenta ya alcanzó su tope semanal de "vuelve a girar".
-- Una vez agotado el stock / límite / presupuesto, el resultado deja de ser
-- elegible (nunca se entrega una unidad inexistente).
-- ---------------------------------------------------------------------
create function private.prize_availability(p_campaign_id uuid, p_now timestamptz, p_cap_reached boolean)
returns table (prize_id uuid, sort_order integer, kind text, probability numeric, available boolean)
language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  c public.campaigns%rowtype;
  v_day timestamptz;
  v_week timestamptz;
  v_n_day integer;
  v_n_week integer;
  v_n_total integer;
  v_global_limit boolean;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then return; end if;

  v_day  := date_trunc('day', p_now at time zone c.timezone) at time zone c.timezone;
  v_week := private.week_start_ts(private.week_start(p_now, c.timezone), c.timezone);

  select count(*) filter (where created_at >= v_day),
         count(*) filter (where created_at >= v_week),
         count(*)
    into v_n_day, v_n_week, v_n_total
  from public.coupons
  where campaign_id = c.id and status <> 'void';

  v_global_limit :=
       (c.max_prizes_per_day  is not null and v_n_day   >= c.max_prizes_per_day)
    or (c.max_prizes_per_week is not null and v_n_week  >= c.max_prizes_per_week)
    or (c.max_prizes_total    is not null and v_n_total >= c.max_prizes_total);

  return query
  select p.id, p.sort_order, p.kind, p.probability,
    case
      when p.kind = 'no_prize' then true
      when p.stock is not null and p.stock <= 0 then false
      when p.kind = 'extra_spin' and p_cap_reached then false
      when p.kind <> 'extra_spin' and v_global_limit then false
      when c.budget_max is not null and c.budget_committed + p.est_cost > c.budget_max then false
      when p.daily_limit  is not null and (select count(*) from public.spins s where s.prize_id = p.id and s.created_at >= v_day)  >= p.daily_limit  then false
      when p.weekly_limit is not null and (select count(*) from public.spins s where s.prize_id = p.id and s.created_at >= v_week) >= p.weekly_limit then false
      when p.total_limit  is not null and (select count(*) from public.spins s where s.prize_id = p.id) >= p.total_limit then false
      else true
    end
  from public.prizes p
  where p.campaign_id = c.id and p.is_active and p.archived_at is null
  order by p.sort_order, p.id;
end $$;

-- ---------------------------------------------------------------------
-- Pesos efectivos tras aplicar la política de agotamiento.
--  to_no_prize : lo agotado se suma a "sin premio" (proporcional a sus pesos).
--  redistribute: lo agotado pesa 0 y el sorteo se normaliza entre el resto.
-- ---------------------------------------------------------------------
create function private.effective_weights(p_campaign_id uuid, p_now timestamptz, p_cap_reached boolean)
returns table (prize_id uuid, sort_order integer, kind text, base_probability numeric, available boolean, weight numeric)
language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_policy text;
  v_lost numeric;
  v_np_total numeric;
  v_np_n integer;
begin
  select depletion_policy into v_policy from public.campaigns where id = p_campaign_id;

  select coalesce(sum(a.probability) filter (where not a.available), 0),
         coalesce(sum(a.probability) filter (where a.kind = 'no_prize'), 0),
         count(*) filter (where a.kind = 'no_prize')
    into v_lost, v_np_total, v_np_n
  from private.prize_availability(p_campaign_id, p_now, p_cap_reached) a;

  if v_policy = 'to_no_prize' and v_lost > 0 and v_np_n = 0 then
    raise exception 'config_error: no hay resultado "sin premio" activo para absorber lo agotado';
  end if;

  return query
  select a.prize_id, a.sort_order, a.kind, a.probability, a.available,
    case
      when not a.available then 0::numeric
      when v_policy = 'redistribute' then a.probability
      when a.kind = 'no_prize' then
        a.probability + case when v_np_total > 0 then v_lost * a.probability / v_np_total
                             else v_lost / v_np_n end
      else a.probability
    end
  from private.prize_availability(p_campaign_id, p_now, p_cap_reached) a
  order by a.sort_order, a.prize_id;
end $$;

-- ---------------------------------------------------------------------
-- Payload de un giro (siempre se construye desde la copia histórica).
-- ---------------------------------------------------------------------
create function private.spin_payload(p_spin_id uuid, p_replay boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  s public.spins%rowtype;
  c public.campaigns%rowtype;
  cp public.coupons%rowtype;
  v_extras integer;
begin
  select * into s from public.spins where id = p_spin_id;
  if not found then return null; end if;
  select * into c from public.campaigns where id = s.campaign_id;
  select * into cp from public.coupons where spin_id = s.id;
  select count(*) into v_extras from public.extra_spins
   where user_id = s.user_id and campaign_id = s.campaign_id and status = 'available' and expires_at > private.now();

  return jsonb_build_object(
    'ok', true,
    'replay', p_replay,
    'spin', jsonb_build_object(
      'id', s.id, 'created_at', s.created_at, 'origin', s.origin,
      'week_start', s.week_start, 'seen', s.seen_at is not null
    ),
    'prize', jsonb_build_object(
      'id', s.prize_id, 'name', s.prize_name, 'label', s.prize_label, 'kind', s.prize_kind,
      'value', s.prize_value, 'description', s.prize_description, 'color', s.prize_color,
      'image_url', s.prize_image_url, 'conditions', s.prize_conditions
    ),
    'coupon', case when cp.id is null then null else jsonb_build_object(
      'id', cp.id, 'code', cp.code, 'expires_at', cp.expires_at, 'status', cp.status
    ) end,
    'extra_spin_granted', exists (select 1 from public.extra_spins e where e.source_spin_id = s.id),
    'extras_available', v_extras,
    'next_base_at', private.week_start_ts(s.week_start + 7, c.timezone)
  );
end $$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger campaigns_touch before update on public.campaigns
  for each row execute function private.touch_updated_at();
create trigger prizes_touch before update on public.prizes
  for each row execute function private.touch_updated_at();

-- El historial no se borra ni se reescribe.
create function private.forbid_mutation()
returns trigger language plpgsql
as $$
begin
  raise exception 'Los registros de % son inmutables (%).', tg_table_name, tg_op using errcode = '42501';
end $$;

create trigger spins_no_delete before delete on public.spins
  for each row execute function private.forbid_mutation();
create trigger coupons_no_delete before delete on public.coupons
  for each row execute function private.forbid_mutation();
create trigger extra_spins_no_delete before delete on public.extra_spins
  for each row execute function private.forbid_mutation();
create trigger audit_no_update before update or delete on public.audit_log
  for each row execute function private.forbid_mutation();

-- spins: únicamente seen_at puede cambiar.
create function private.spins_guard()
returns trigger language plpgsql
as $$
begin
  if (to_jsonb(new) - 'seen_at') is distinct from (to_jsonb(old) - 'seen_at') then
    raise exception 'Los giros solo permiten actualizar seen_at.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger spins_guard before update on public.spins
  for each row execute function private.spins_guard();

-- coupons: la copia histórica y la identidad no cambian jamás.
create function private.coupons_guard()
returns trigger language plpgsql
as $$
declare
  c_mutable constant text[] := array['status', 'redeemed_at', 'redeemed_by', 'void_at', 'void_by', 'void_reason'];
begin
  if (to_jsonb(new) - c_mutable) is distinct from (to_jsonb(old) - c_mutable) then
    raise exception 'Solo el estado del cupón puede cambiar.' using errcode = '42501';
  end if;
  -- Estados finales: un cupón canjeado o anulado no cambia de nuevo.
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'El cupón ya está en un estado final (%).', old.status using errcode = '42501';
  end if;
  return new;
end $$;
create trigger coupons_guard before update on public.coupons
  for each row execute function private.coupons_guard();

-- Alta de perfil al crear un usuario en auth.users (Google OAuth, etc.).
-- Debe ser a prueba de fallos: si esto lanza, el usuario no puede entrar.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120),
    left(new.raw_user_meta_data ->> 'avatar_url', 500)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
