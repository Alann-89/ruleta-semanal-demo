-- =====================================================================
-- Ruleta semanal — 4/5: API de personal de tienda y administración.
-- Cada función valida el rol EN EL SERVIDOR (private.require_*).
-- Errores de autorización => 42501 (HTTP 403). Errores de validación =>
-- P0001 'validation_failed' con la lista de mensajes en `details`.
-- =====================================================================

create function private.raise_validation(p_errors text[])
returns void language plpgsql
as $$
begin
  raise exception 'validation_failed' using errcode = 'P0001', detail = to_jsonb(p_errors)::text;
end $$;

-- Un cupón anulado es final; uno canjeado solo puede anularse (corrección
-- de un error) y conserva sus datos de canje. Se refina el guard anterior.
create or replace function private.coupons_guard()
returns trigger language plpgsql
as $$
declare
  c_mutable constant text[] := array['status', 'redeemed_at', 'redeemed_by', 'void_at', 'void_by', 'void_reason'];
begin
  if (to_jsonb(new) - c_mutable) is distinct from (to_jsonb(old) - c_mutable) then
    raise exception 'Solo el estado del cupón puede cambiar.' using errcode = '42501';
  end if;
  if old.status = 'void' and new.status is distinct from old.status then
    raise exception 'Un cupón anulado no puede cambiar.' using errcode = '42501';
  end if;
  if old.status = 'redeemed' and new.status not in ('redeemed', 'void') then
    raise exception 'Un cupón canjeado solo puede anularse.' using errcode = '42501';
  end if;
  if old.status = 'redeemed' and new.status = 'redeemed'
     and (new.redeemed_at is distinct from old.redeemed_at or new.redeemed_by is distinct from old.redeemed_by) then
    raise exception 'El canje no puede modificarse.' using errcode = '42501';
  end if;
  return new;
end $$;

-- =====================================================================
-- CANJES (personal y administración)
-- =====================================================================

create function private.coupon_json(p_id uuid, p_full boolean)
returns jsonb language sql volatile security definer set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'status', c.status,
    'effective_status', case when c.status = 'pending' and c.expires_at <= private.now() then 'expired' else c.status end,
    'prize_id', c.prize_id,
    'prize_name', c.prize_name,
    'prize_kind', c.prize_kind,
    'prize_value', c.prize_value,
    'prize_description', c.prize_description,
    'prize_image_url', c.prize_image_url,
    'prize_conditions', c.prize_conditions,
    'expires_at', c.expires_at,
    'created_at', c.created_at,
    'week_start', s.week_start,
    'spin_origin', s.origin,
    'redeemed_at', c.redeemed_at,
    'redeemed_by_name', coalesce(rb.display_name, rb.email),
    'void_at', c.void_at,
    'void_reason', c.void_reason,
    'est_cost', case when p_full then c.est_cost else null end,
    'owner', jsonb_build_object(
      'id', o.id,
      'name', o.display_name,
      'email', case when p_full then o.email else private.mask_email(o.email) end)
  )
  from public.coupons c
  join public.spins s on s.id = c.spin_id
  join public.profiles o on o.id = c.user_id
  left join public.profiles rb on rb.id = c.redeemed_by
  where c.id = p_id
$$;

-- Buscar un cupón por código (lo que contiene el QR). NO lo canjea.
-- Intentos fallidos limitados por cuenta de personal: anti fuerza bruta.
create function public.staff_lookup_coupon(p_code text)
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
  select id into v_id from public.coupons where code = private.norm_code(p_code);
  if not found then
    perform private.rate_hit('lookup:' || v_uid::text, 15, 600);
    return private.err('not_found');
  end if;
  return jsonb_build_object('ok', true, 'coupon', private.coupon_json(v_id, private.is_admin()));
end $$;

-- Canje atómico: un único UPDATE condicionado. Si dos empleados confirman a
-- la vez, el segundo espera el bloqueo de la fila, reevalúa la condición y no
-- actualiza nada.
create function public.staff_redeem_coupon(p_coupon_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
  v_row public.coupons%rowtype;
begin
  perform private.require_staff();

  update public.coupons
     set status = 'redeemed', redeemed_at = v_now, redeemed_by = v_uid
   where id = p_coupon_id and status = 'pending' and expires_at > v_now
   returning * into v_row;

  if found then
    perform private.audit('coupon.redeem', 'coupon', v_row.id::text,
      jsonb_build_object('code_suffix', right(v_row.code, 4), 'prize', v_row.prize_name, 'owner_id', v_row.user_id));
    return jsonb_build_object('ok', true, 'coupon', private.coupon_json(v_row.id, private.is_admin()));
  end if;

  select * into v_row from public.coupons where id = p_coupon_id;
  if not found then
    return private.err('not_found');
  elsif v_row.status = 'redeemed' then
    return private.err('already_redeemed', jsonb_build_object(
      'redeemed_at', v_row.redeemed_at,
      'redeemed_by_name', (select coalesce(display_name, email) from public.profiles where id = v_row.redeemed_by)));
  elsif v_row.status = 'void' then
    return private.err('void', jsonb_build_object('reason', v_row.void_reason));
  else
    return private.err('expired', jsonb_build_object('expired_at', v_row.expires_at));
  end if;
end $$;

-- Tabla de ganadores / canjes con filtros y paginación.
-- El personal no puede buscar por correo y ve el correo enmascarado.
create function public.staff_list_coupons(
  p_status   text default null,          -- pending | redeemed | expired | void
  p_search   text default null,          -- código, nombre (y correo si es admin)
  p_prize_id uuid default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_week     date default null,
  p_limit    integer default 25,
  p_offset   integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_admin boolean := private.is_admin();
  v_now timestamptz := private.now();
  v_search text := nullif(btrim(p_search), '');
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  perform private.require_staff();
  v_like := '%' || private.like_escape(v_search) || '%';

  with f as (
    select c.id, c.created_at
    from public.coupons c
    join public.spins s on s.id = c.spin_id
    join public.profiles o on o.id = c.user_id
    where (p_status is null or (case when c.status = 'pending' and c.expires_at <= v_now then 'expired' else c.status end) = p_status)
      and (p_prize_id is null or c.prize_id = p_prize_id)
      and (p_from is null or c.created_at >= p_from)
      and (p_to is null or c.created_at < p_to)
      and (p_week is null or s.week_start = p_week)
      and (v_search is null
           or c.code = private.norm_code(v_search)
           or o.display_name ilike v_like
           or (v_admin and o.email ilike v_like))
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(private.coupon_json(x.id, v_admin) order by x.created_at desc, x.id)
                   from (select id, created_at from f order by created_at desc, id limit v_limit offset v_offset) x),
                  '[]'::jsonb)
    into v_total, v_rows;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-- Anulación con motivo (no se borra nada). Opcionalmente devuelve la unidad
-- al inventario.
create function public.admin_void_coupon(p_coupon_id uuid, p_reason text, p_restock boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz := private.now();
  v_row public.coupons%rowtype;
begin
  perform private.require_admin();
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    return private.err('reason_required');
  end if;

  -- Orden de bloqueo igual que spin(): primero la campaña.
  perform 1 from public.campaigns where id = (select campaign_id from public.coupons where id = p_coupon_id) for update;

  update public.coupons
     set status = 'void', void_at = v_now, void_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_coupon_id and status in ('pending', 'redeemed')
   returning * into v_row;
  if not found then
    return private.err('not_voidable');
  end if;

  if p_restock then
    update public.prizes set stock = stock + 1 where id = v_row.prize_id and stock is not null;
    update public.campaigns set budget_committed = greatest(budget_committed - v_row.est_cost, 0)
     where id = v_row.campaign_id;
  end if;

  perform private.audit('coupon.void', 'coupon', v_row.id::text,
    jsonb_build_object('code_suffix', right(v_row.code, 4), 'prize', v_row.prize_name,
                       'reason', btrim(p_reason), 'restock', p_restock));
  return jsonb_build_object('ok', true, 'coupon', private.coupon_json(v_row.id, true));
end $$;

-- =====================================================================
-- ESTADÍSTICAS
-- =====================================================================
create function public.admin_dashboard(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  c public.campaigns%rowtype;
  v_now timestamptz := private.now();
  v_part integer; v_base integer; v_extra integer;
  v_awarded integer; v_redeemed integer; v_pending integer; v_expired integer; v_void integer;
  v_cost_awarded numeric; v_cost_redeemed numeric;
  v_dist jsonb; v_stock jsonb; v_weekly jsonb;
begin
  perform private.require_admin();
  select * into c from public.campaigns where id = private.current_campaign_id();
  if not found then
    return jsonb_build_object('campaign', null);
  end if;

  select count(distinct user_id), count(*) filter (where origin = 'base'), count(*) filter (where origin = 'extra')
    into v_part, v_base, v_extra
  from public.spins
  where campaign_id = c.id and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to);

  select count(*) filter (where status <> 'void'),
         count(*) filter (where status = 'redeemed'),
         count(*) filter (where status = 'pending' and expires_at > v_now),
         count(*) filter (where status = 'pending' and expires_at <= v_now),
         count(*) filter (where status = 'void'),
         coalesce(sum(est_cost) filter (where status <> 'void'), 0),
         coalesce(sum(est_cost) filter (where status = 'redeemed'), 0)
    into v_awarded, v_redeemed, v_pending, v_expired, v_void, v_cost_awarded, v_cost_redeemed
  from public.coupons
  where campaign_id = c.id and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to);

  select coalesce(jsonb_agg(jsonb_build_object(
           'prize_id', d.prize_id, 'name', d.name, 'kind', d.kind, 'count', d.n,
           'pct', round(100.0 * d.n / nullif(v_base + v_extra, 0), 1)) order by d.n desc), '[]'::jsonb)
    into v_dist
  from (select prize_id, max(prize_name) as name, max(prize_kind) as kind, count(*) as n
          from public.spins
         where campaign_id = c.id and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to)
         group by prize_id) d;

  select coalesce(jsonb_agg(jsonb_build_object(
           'prize_id', p.id, 'name', p.name, 'kind', p.kind, 'stock', p.stock,
           'is_active', p.is_active, 'probability', p.probability) order by p.sort_order), '[]'::jsonb)
    into v_stock
  from public.prizes p where p.campaign_id = c.id and p.archived_at is null;

  select coalesce(jsonb_agg(w order by w.week_start), '[]'::jsonb)
    into v_weekly
  from (select week_start, count(*) filter (where origin = 'base') as base,
               count(*) filter (where origin = 'extra') as extra, count(distinct user_id) as participants
          from public.spins where campaign_id = c.id
         group by week_start order by week_start desc limit 12) w;

  return jsonb_build_object(
    'campaign', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status,
                                    'budget_max', c.budget_max, 'budget_committed', c.budget_committed),
    'unique_participants', v_part,
    'base_spins', v_base,
    'extra_spins', v_extra,
    'prizes_awarded', v_awarded,
    'prizes_redeemed', v_redeemed,
    'prizes_pending', v_pending,
    'prizes_expired', v_expired,
    'prizes_void', v_void,
    'cost_awarded', v_cost_awarded,
    'cost_redeemed', v_cost_redeemed,
    'distribution', v_dist,
    'stock', v_stock,
    'weekly', v_weekly
  );
end $$;

-- =====================================================================
-- CAMPAÑA Y RESULTADOS
-- =====================================================================

-- Errores que impiden activar / publicar la campaña.
create function private.campaign_errors(p_campaign_id uuid)
returns text[] language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  c public.campaigns%rowtype;
  v_errors text[] := '{}';
  v_n integer; v_sum numeric; v_np integer;
  v_cfg_errors text[];
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then
    return array['Campaña inexistente.'];
  end if;

  select count(*), coalesce(sum(probability), 0), count(*) filter (where kind = 'no_prize')
    into v_n, v_sum, v_np
  from public.prizes where campaign_id = c.id and is_active and archived_at is null;

  if v_n < 2 or v_n > 16 then
    v_errors := v_errors || format('Se necesitan entre 2 y 16 resultados activos (hay %s).', v_n);
  end if;
  if v_sum <> 100 then
    v_errors := v_errors || format('Las probabilidades de los resultados activos suman %s %% y deben sumar exactamente 100 %%.', v_sum);
  end if;
  if c.depletion_policy = 'to_no_prize' and v_np = 0 then
    v_errors := array_append(v_errors, 'Con la política "pasar a Sin premio" debe existir al menos un resultado activo de tipo "Sin premio".');
  end if;
  if not exists (select 1 from pg_timezone_names where name = c.timezone) then
    v_errors := v_errors || format('Zona horaria inválida: %s.', c.timezone);
  end if;
  v_cfg_errors := private.site_config_errors((select published from public.site_config));
  if array_length(v_cfg_errors, 1) > 0 then
    v_errors := v_errors || ('Apariencia publicada incompleta: ' || array_to_string(v_cfg_errors, ' '));
  end if;
  return v_errors;
end $$;

create function public.admin_update_campaign(p_campaign_id uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  old_c public.campaigns%rowtype;
  new_c public.campaigns%rowtype;
  v_status text;
  v_errors text[];
  c_allowed constant text[] := array[
    'name', 'status', 'timezone', 'starts_at', 'ends_at', 'require_participation_code',
    'max_extra_spins_per_week', 'extra_spin_valid_days', 'depletion_policy', 'budget_max',
    'max_prizes_per_day', 'max_prizes_per_week', 'max_prizes_total'];
  k text;
begin
  perform private.require_admin();
  for k in select jsonb_object_keys(p) loop
    if not (k = any (c_allowed)) then
      raise exception 'Campo no permitido: %', k using errcode = 'P0001';
    end if;
  end loop;

  select * into old_c from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;

  v_status := coalesce(p ->> 'status', old_c.status);
  if v_status <> old_c.status and not (
       (old_c.status = 'draft'  and v_status = 'active') or
       (old_c.status = 'active' and v_status in ('paused', 'closed')) or
       (old_c.status = 'paused' and v_status in ('active', 'closed')) or
       (old_c.status = 'closed' and v_status = 'active')) then
    perform private.raise_validation(array[format('Transición de estado no permitida: %s → %s.', old_c.status, v_status)]);
  end if;
  if p ? 'timezone' and (p ->> 'timezone') <> old_c.timezone and old_c.status = 'active' then
    perform private.raise_validation(array['Pausa la campaña antes de cambiar la zona horaria (las semanas dependen de ella).']);
  end if;

  update public.campaigns set
    name = case when p ? 'name' then p ->> 'name' else name end,
    status = v_status,
    timezone = case when p ? 'timezone' then p ->> 'timezone' else timezone end,
    starts_at = case when p ? 'starts_at' then nullif(p ->> 'starts_at', '')::timestamptz else starts_at end,
    ends_at = case when p ? 'ends_at' then nullif(p ->> 'ends_at', '')::timestamptz else ends_at end,
    require_participation_code = case when p ? 'require_participation_code' then (p ->> 'require_participation_code')::boolean else require_participation_code end,
    max_extra_spins_per_week = case when p ? 'max_extra_spins_per_week' then (p ->> 'max_extra_spins_per_week')::integer else max_extra_spins_per_week end,
    extra_spin_valid_days = case when p ? 'extra_spin_valid_days' then (p ->> 'extra_spin_valid_days')::integer else extra_spin_valid_days end,
    depletion_policy = case when p ? 'depletion_policy' then p ->> 'depletion_policy' else depletion_policy end,
    budget_max = case when p ? 'budget_max' then nullif(p ->> 'budget_max', '')::numeric else budget_max end,
    max_prizes_per_day = case when p ? 'max_prizes_per_day' then nullif(p ->> 'max_prizes_per_day', '')::integer else max_prizes_per_day end,
    max_prizes_per_week = case when p ? 'max_prizes_per_week' then nullif(p ->> 'max_prizes_per_week', '')::integer else max_prizes_per_week end,
    max_prizes_total = case when p ? 'max_prizes_total' then nullif(p ->> 'max_prizes_total', '')::integer else max_prizes_total end
  where id = p_campaign_id
  returning * into new_c;

  if new_c.status = 'active' then
    v_errors := private.campaign_errors(p_campaign_id);
    if array_length(v_errors, 1) > 0 then
      perform private.raise_validation(v_errors);       -- revierte todo
    end if;
  end if;

  perform private.audit('campaign.update', 'campaign', p_campaign_id::text,
    private.jsonb_diff(to_jsonb(old_c), to_jsonb(new_c)));
  return jsonb_build_object('ok', true, 'campaign', to_jsonb(new_c));
end $$;

-- Guarda TODA la lista de resultados de la campaña de forma atómica.
-- Cada elemento es un objeto completo; `id` ausente => se crea.
-- Si la campaña está activa, una configuración inválida se rechaza y se
-- revierte (no se puede publicar una ruleta que no suma 100 %).
create function public.admin_save_outcomes(p_campaign_id uuid, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  c public.campaigns%rowtype;
  v_item jsonb;
  v_id uuid;
  old_p public.prizes%rowtype;
  new_p public.prizes%rowtype;
  v_now timestamptz := private.now();
  v_archived boolean;
  v_errors text[];
begin
  perform private.require_admin();
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items debe ser un arreglo' using errcode = 'P0001';
  end if;

  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := nullif(v_item ->> 'id', '')::uuid;
    v_archived := coalesce((v_item ->> 'archived')::boolean, false);

    if v_id is null then
      insert into public.prizes (
        campaign_id, name, description, image_url, kind, value, sector_label, color, sort_order,
        probability, stock, est_cost, conditions, coupon_valid_days,
        daily_limit, weekly_limit, total_limit, is_active, archived_at)
      values (
        p_campaign_id, v_item ->> 'name', nullif(v_item ->> 'description', ''), nullif(v_item ->> 'image_url', ''),
        v_item ->> 'kind', coalesce(nullif(v_item ->> 'value', '')::numeric, 0), v_item ->> 'sector_label',
        coalesce(v_item ->> 'color', '#ff7a1a'), coalesce((v_item ->> 'sort_order')::integer, 0),
        coalesce(nullif(v_item ->> 'probability', '')::numeric, 0), nullif(v_item ->> 'stock', '')::integer,
        coalesce(nullif(v_item ->> 'est_cost', '')::numeric, 0), nullif(v_item ->> 'conditions', ''),
        coalesce(nullif(v_item ->> 'coupon_valid_days', '')::integer, 30),
        nullif(v_item ->> 'daily_limit', '')::integer, nullif(v_item ->> 'weekly_limit', '')::integer,
        nullif(v_item ->> 'total_limit', '')::integer,
        coalesce((v_item ->> 'is_active')::boolean, false) and not v_archived,
        case when v_archived then v_now end)
      returning * into new_p;
      perform private.audit('prize.create', 'prize', new_p.id::text, to_jsonb(new_p));
    else
      select * into old_p from public.prizes where id = v_id and campaign_id = p_campaign_id;
      if not found then
        raise exception 'prize_not_found' using errcode = 'P0002';
      end if;
      update public.prizes set
        name = v_item ->> 'name',
        description = nullif(v_item ->> 'description', ''),
        image_url = nullif(v_item ->> 'image_url', ''),
        kind = v_item ->> 'kind',
        value = coalesce(nullif(v_item ->> 'value', '')::numeric, 0),
        sector_label = v_item ->> 'sector_label',
        color = coalesce(v_item ->> 'color', color),
        sort_order = coalesce((v_item ->> 'sort_order')::integer, sort_order),
        probability = coalesce(nullif(v_item ->> 'probability', '')::numeric, 0),
        stock = nullif(v_item ->> 'stock', '')::integer,
        est_cost = coalesce(nullif(v_item ->> 'est_cost', '')::numeric, 0),
        conditions = nullif(v_item ->> 'conditions', ''),
        coupon_valid_days = coalesce(nullif(v_item ->> 'coupon_valid_days', '')::integer, 30),
        daily_limit = nullif(v_item ->> 'daily_limit', '')::integer,
        weekly_limit = nullif(v_item ->> 'weekly_limit', '')::integer,
        total_limit = nullif(v_item ->> 'total_limit', '')::integer,
        is_active = coalesce((v_item ->> 'is_active')::boolean, false) and not v_archived,
        archived_at = case when v_archived then coalesce(old_p.archived_at, v_now) else null end
      where id = v_id
      returning * into new_p;
      if to_jsonb(old_p) - 'updated_at' is distinct from to_jsonb(new_p) - 'updated_at' then
        perform private.audit('prize.update', 'prize', v_id::text,
          private.jsonb_diff(to_jsonb(old_p), to_jsonb(new_p)));
      end if;
    end if;
  end loop;

  if c.status = 'active' then
    v_errors := private.campaign_errors(p_campaign_id);
    if array_length(v_errors, 1) > 0 then
      perform private.raise_validation(v_errors);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'prizes', coalesce((
    select jsonb_agg(to_jsonb(p) order by p.sort_order, p.id)
      from public.prizes p where p.campaign_id = p_campaign_id), '[]'::jsonb));
end $$;

-- Validación sin guardar (para mostrar el estado en el panel).
create function public.admin_check_campaign(p_campaign_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_errors text[];
begin
  perform private.require_admin();
  v_errors := private.campaign_errors(p_campaign_id);
  return jsonb_build_object('ok', coalesce(array_length(v_errors, 1), 0) = 0, 'errors', to_jsonb(v_errors));
end $$;

-- PRUEBA: elige un resultado con la misma lógica que el giro real pero NO
-- escribe nada: no consume giros, inventario ni presupuesto y no aparece en
-- las estadísticas. Se marca con test = true.
create function public.admin_simulate_spin(p_campaign_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_cid uuid := coalesce(p_campaign_id, private.current_campaign_id());
  v_now timestamptz := private.now();
  v_ids uuid[]; v_weights numeric[];
  v_total numeric; v_roll numeric; v_cum numeric := 0; v_pick uuid;
  v_prize public.prizes%rowtype;
  i integer;
begin
  perform private.require_admin();
  select array_agg(w.prize_id order by w.sort_order, w.prize_id), array_agg(w.weight order by w.sort_order, w.prize_id)
    into v_ids, v_weights
  from private.effective_weights(v_cid, v_now, false) w;
  select coalesce(sum(x), 0) into v_total from unnest(v_weights) x;
  if v_ids is null or v_total <= 0 then
    return private.err('nothing_available');
  end if;
  v_roll := private.rand_unit()::numeric * v_total;
  for i in 1 .. array_length(v_ids, 1) loop
    if v_weights[i] > 0 then
      v_pick := v_ids[i];
      v_cum := v_cum + v_weights[i];
      exit when v_roll < v_cum;
    end if;
  end loop;
  select * into v_prize from public.prizes where id = v_pick;
  return jsonb_build_object(
    'ok', true, 'test', true,
    'prize', jsonb_build_object('id', v_prize.id, 'name', v_prize.name, 'label', v_prize.sector_label,
      'kind', v_prize.kind, 'value', v_prize.value, 'description', v_prize.description,
      'color', v_prize.color, 'image_url', v_prize.image_url, 'conditions', v_prize.conditions),
    'effective', (select jsonb_agg(jsonb_build_object(
        'prize_id', w.prize_id, 'name', p.name, 'configured', w.base_probability,
        'available', w.available, 'effective', round(100 * w.weight / v_total, 3)) order by w.sort_order)
      from private.effective_weights(v_cid, v_now, false) w join public.prizes p on p.id = w.prize_id)
  );
end $$;

-- =====================================================================
-- GIROS EXTRA y CÓDIGOS
-- =====================================================================
create function public.admin_grant_extra_spin(p_user_id uuid, p_reason text, p_valid_days integer default null)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  c public.campaigns%rowtype;
  v_now timestamptz := private.now();
  v_id uuid;
begin
  perform private.require_admin();
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    return private.err('reason_required');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and anonymized_at is null) then
    return private.err('user_not_found');
  end if;
  select * into c from public.campaigns where id = private.current_campaign_id();
  if not found or c.status = 'closed' then
    return private.err('campaign_inactive');
  end if;
  insert into public.extra_spins (user_id, campaign_id, origin, week_start, granted_by, reason, expires_at, created_at)
  values (p_user_id, c.id, 'admin', private.week_start(v_now, c.timezone), auth.uid(), btrim(p_reason),
          v_now + make_interval(days => coalesce(p_valid_days, c.extra_spin_valid_days)), v_now)
  returning id into v_id;
  perform private.audit('extra_spin.grant', 'extra_spin', v_id::text,
    jsonb_build_object('user_id', p_user_id, 'reason', btrim(p_reason)));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create function public.admin_revoke_extra_spin(p_id uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_row public.extra_spins%rowtype;
begin
  perform private.require_admin();
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    return private.err('reason_required');
  end if;
  update public.extra_spins
     set status = 'revoked', revoked_at = private.now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
   where id = p_id and status = 'available'
   returning * into v_row;
  if not found then
    return private.err('not_revocable');
  end if;
  perform private.audit('extra_spin.revoke', 'extra_spin', p_id::text,
    jsonb_build_object('user_id', v_row.user_id, 'reason', btrim(p_reason)));
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_list_extra_spins(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_now timestamptz := private.now();
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.extra_spins e
               where p_status is null or (case when e.status = 'available' and e.expires_at <= v_now then 'expired' else e.status end) = p_status),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'origin', e.origin,
        'status', case when e.status = 'available' and e.expires_at <= v_now then 'expired' else e.status end,
        'user_name', coalesce(u.display_name, u.email), 'user_email', u.email,
        'reason', e.reason, 'granted_by_name', coalesce(g.display_name, g.email),
        'created_at', e.created_at, 'expires_at', e.expires_at, 'used_at', e.used_at,
        'revoke_reason', e.revoke_reason) order by e.created_at desc)
      from (select * from public.extra_spins x
             where p_status is null or (case when x.status = 'available' and x.expires_at <= v_now then 'expired' else x.status end) = p_status
             order by x.created_at desc limit v_limit offset v_offset) e
      join public.profiles u on u.id = e.user_id
      left join public.profiles g on g.id = e.granted_by), '[]'::jsonb));
end $$;

-- Lote de códigos de un solo uso.
create function public.admin_create_codes(p_kind text, p_count integer, p_expires_at timestamptz default null, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_cid uuid := private.current_campaign_id();
  v_codes text[] := '{}';
  v_code text;
  v_n integer := 0;
  v_guard integer := 0;
begin
  perform private.require_admin();
  if p_kind not in ('extra_spin', 'participation') then
    return private.err('bad_kind');
  end if;
  if p_count is null or p_count < 1 or p_count > 200 then
    return private.err('bad_count');
  end if;
  while v_n < p_count and v_guard < p_count * 5 loop
    v_guard := v_guard + 1;
    v_code := private.rand_code(10);
    begin
      insert into public.codes (campaign_id, kind, code, note, expires_at, created_by)
      values (v_cid, p_kind, v_code, nullif(btrim(p_note), ''), p_expires_at, auth.uid());
      v_codes := v_codes || v_code;
      v_n := v_n + 1;
    exception when unique_violation then
      null;
    end;
  end loop;
  perform private.audit('codes.create', 'code', null,
    jsonb_build_object('kind', p_kind, 'count', v_n, 'expires_at', p_expires_at, 'note', p_note));
  return jsonb_build_object('ok', true, 'codes', to_jsonb(v_codes));
end $$;

create function public.admin_list_codes(p_kind text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.codes where p_kind is null or kind = p_kind),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'code', c.code, 'note', c.note, 'active', c.active,
        'expires_at', c.expires_at, 'created_at', c.created_at, 'used_at', c.used_at,
        'used_by_name', coalesce(u.display_name, u.email)) order by c.created_at desc, c.id)
      from (select * from public.codes x where p_kind is null or x.kind = p_kind
             order by x.created_at desc, x.id limit v_limit offset v_offset) c
      left join public.profiles u on u.id = c.used_by), '[]'::jsonb));
end $$;

create function public.admin_deactivate_code(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  update public.codes set active = false where id = p_id and used_at is null and active;
  if not found then
    return private.err('not_deactivable');
  end if;
  perform private.audit('codes.deactivate', 'code', p_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- USUARIOS Y ROLES
-- =====================================================================
create function public.admin_list_users(p_search text default null, p_role text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_search text := nullif(btrim(p_search), '');
  v_like text := '%' || private.like_escape(nullif(btrim(p_search), '')) || '%';
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.profiles u
               where (p_role is null or u.role = p_role)
                 and (v_search is null or u.email ilike v_like or u.display_name ilike v_like)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'name', u.display_name, 'role', u.role,
        'is_blocked', u.is_blocked, 'blocked_reason', u.blocked_reason, 'created_at', u.created_at,
        'spins', (select count(*) from public.spins s where s.user_id = u.id),
        'last_spin_at', (select max(created_at) from public.spins s where s.user_id = u.id),
        'extras_available', (select count(*) from public.extra_spins e
                              where e.user_id = u.id and e.status = 'available' and e.expires_at > private.now())
      ) order by u.created_at desc, u.id)
      from (select * from public.profiles x
             where (p_role is null or x.role = p_role)
               and (v_search is null or x.email ilike v_like or x.display_name ilike v_like)
             order by x.created_at desc, x.id limit v_limit offset v_offset) u), '[]'::jsonb));
end $$;

create function public.admin_set_role(p_user_id uuid, p_role text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_old text;
begin
  perform private.require_admin();
  if p_role not in ('customer', 'staff', 'admin') then
    return private.err('bad_role');
  end if;
  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then
    return private.err('user_not_found');
  end if;
  if v_old = 'admin' and p_role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> p_user_id and not is_blocked) then
    return private.err('last_admin');
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  perform private.audit('user.set_role', 'user', p_user_id::text, jsonb_build_object('from', v_old, 'to', p_role));
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_set_blocked(p_user_id uuid, p_blocked boolean, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  if p_blocked and (p_reason is null or char_length(btrim(p_reason)) < 5) then
    return private.err('reason_required');
  end if;
  if p_user_id = auth.uid() then
    return private.err('cannot_block_self');
  end if;
  update public.profiles
     set is_blocked = p_blocked, blocked_reason = case when p_blocked then btrim(p_reason) end
   where id = p_user_id;
  if not found then
    return private.err('user_not_found');
  end if;
  perform private.audit(case when p_blocked then 'user.block' else 'user.unblock' end, 'user', p_user_id::text,
    jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- Derecho de supresión: borra datos personales, conserva el historial
-- (giros/cupones quedan sin identificar) y bloquea la cuenta.
create function public.admin_anonymize_user(p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  if p_user_id = auth.uid() or exists (select 1 from public.profiles where id = p_user_id and role <> 'customer') then
    return private.err('not_allowed');
  end if;
  update public.profiles
     set email = 'anonimo-' || left(id::text, 8) || '@eliminado.invalid', display_name = null, avatar_url = null,
         is_blocked = true, blocked_reason = 'Cuenta anonimizada', anonymized_at = private.now()
   where id = p_user_id and anonymized_at is null;
  if not found then
    return private.err('user_not_found');
  end if;
  perform private.audit('user.anonymize', 'user', p_user_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- HISTORIAL DE GIROS y AUDITORÍA
-- =====================================================================
create function public.admin_list_spins(p_origin text default null, p_search text default null, p_week date default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_search text := nullif(btrim(p_search), '');
  v_like text := '%' || private.like_escape(nullif(btrim(p_search), '')) || '%';
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.spins s join public.profiles u on u.id = s.user_id
               where (p_origin is null or s.origin = p_origin) and (p_week is null or s.week_start = p_week)
                 and (v_search is null or u.email ilike v_like or u.display_name ilike v_like)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'created_at', s.created_at, 'origin', s.origin, 'week_start', s.week_start,
        'prize_name', s.prize_name, 'prize_kind', s.prize_kind,
        'user_name', coalesce(u.display_name, u.email), 'user_email', u.email) order by s.created_at desc, s.id)
      from (select x.* from public.spins x join public.profiles y on y.id = x.user_id
             where (p_origin is null or x.origin = p_origin) and (p_week is null or x.week_start = p_week)
               and (v_search is null or y.email ilike v_like or y.display_name ilike v_like)
             order by x.created_at desc, x.id limit v_limit offset v_offset) s
      join public.profiles u on u.id = s.user_id), '[]'::jsonb));
end $$;

create function public.admin_list_audit(p_action text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.audit_log where p_action is null or action like p_action || '%'),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.id desc)
      from (select * from public.audit_log where p_action is null or action like p_action || '%'
             order by id desc limit v_limit offset v_offset) a), '[]'::jsonb));
end $$;

-- =====================================================================
-- APARIENCIA (borrador / publicado)
-- =====================================================================
create function private.site_config_errors(j jsonb)
returns text[] language plpgsql immutable
as $$
declare
  e text[] := '{}';
  c_url constant text := '^https://[^\s"''()<>]+$';
  c_hex constant text := '^#[0-9a-fA-F]{6}$';
  v text;
  k text;
  v_hours jsonb;
begin
  if j is null or jsonb_typeof(j) <> 'object' then
    return array['La configuración no existe.'];
  end if;

  v := coalesce(j #>> '{store,name}', '');
  if char_length(btrim(v)) not between 1 and 60 then e := array_append(e, 'Nombre de la tienda: 1 a 60 caracteres.'); end if;
  if char_length(coalesce(j #>> '{store,tagline}', '')) > 120 then e := array_append(e, 'Eslogan: máximo 120 caracteres.'); end if;
  v := coalesce(j #>> '{store,logo_url}', '');
  if v <> '' and v !~ c_url then e := array_append(e, 'El logo debe ser una URL https válida.'); end if;

  foreach k in array array['primary', 'secondary', 'accent', 'background'] loop
    if coalesce(j #>> array['theme', k], '') !~ c_hex then
      e := e || format('Color "%s" inválido (usa formato #RRGGBB).', k);
    end if;
  end loop;
  v := coalesce(j #>> '{theme,background_image_url}', '');
  if v <> '' and v !~ c_url then e := array_append(e, 'La imagen de fondo debe ser una URL https válida.'); end if;
  foreach k in array array['glow', 'motion'] loop
    if not (case when jsonb_typeof(j #> array['theme', k]) = 'number'
                 then (j #>> array['theme', k])::numeric between 0 and 100 else false end) then
      e := e || format('"%s" debe ser un número de 0 a 100.', k);
    end if;
  end loop;

  if char_length(btrim(coalesce(j #>> '{copy,welcome_title}', ''))) not between 1 and 90 then e := array_append(e, 'Título de bienvenida: 1 a 90 caracteres.'); end if;
  if char_length(coalesce(j #>> '{copy,welcome_text}', '')) > 400 then e := array_append(e, 'Texto de bienvenida: máximo 400 caracteres.'); end if;
  if char_length(btrim(coalesce(j #>> '{copy,button_text}', ''))) not between 1 and 30 then e := array_append(e, 'Texto del botón: 1 a 30 caracteres.'); end if;
  foreach k in array array['celebration_message', 'no_prize_message', 'extra_spin_message'] loop
    if char_length(coalesce(j #>> array['copy', k], '')) not between 1 and 160 then
      e := e || format('Mensaje "%s": 1 a 160 caracteres.', k);
    end if;
  end loop;

  if coalesce(jsonb_typeof(j #> '{sound,enabled_by_default}'), '') <> 'boolean' then e := array_append(e, 'Sonido: indica si está activo por omisión.'); end if;
  if not (case when jsonb_typeof(j #> '{sound,volume}') = 'number'
               then (j #>> '{sound,volume}')::numeric between 0 and 100 else false end) then
    e := array_append(e, 'Volumen: número de 0 a 100.');
  end if;

  if char_length(coalesce(j #>> '{contact,address}', '')) > 200 then e := array_append(e, 'Dirección: máximo 200 caracteres.'); end if;
  v := coalesce(j #>> '{contact,maps_url}', '');
  if v <> '' and v !~ c_url then e := array_append(e, 'El enlace del mapa debe ser una URL https válida.'); end if;
  v := coalesce(j #>> '{contact,email}', '');
  if v <> '' and v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then e := array_append(e, 'Correo de contacto inválido.'); end if;
  if char_length(coalesce(j #>> '{contact,phone}', '')) > 30 then e := array_append(e, 'Teléfono: máximo 30 caracteres.'); end if;
  v_hours := j #> '{contact,hours}';
  if v_hours is not null and (jsonb_typeof(v_hours) <> 'array' or jsonb_array_length(v_hours) > 10) then
    e := array_append(e, 'Horarios: lista de hasta 10 renglones.');
  end if;

  if char_length(btrim(coalesce(j ->> 'rules_text', ''))) < 20 or char_length(coalesce(j ->> 'rules_text', '')) > 8000 then
    e := array_append(e, 'Reglas: entre 20 y 8000 caracteres.');
  end if;
  if char_length(btrim(coalesce(j ->> 'privacy_text', ''))) < 20 or char_length(coalesce(j ->> 'privacy_text', '')) > 8000 then
    e := array_append(e, 'Aviso de privacidad: entre 20 y 8000 caracteres.');
  end if;
  if char_length(coalesce(j ->> 'redeem_text', '')) > 2000 then e := array_append(e, 'Instrucciones de canje: máximo 2000 caracteres.'); end if;
  return e;
end $$;

create function public.admin_save_draft(p_draft jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or pg_column_size(p_draft) > 100000 then
    return private.err('bad_draft');
  end if;
  update public.site_config set draft = p_draft, updated_at = private.now(), updated_by = auth.uid() where id;
  perform private.audit('config.save_draft', 'site_config', null, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'errors', to_jsonb(private.site_config_errors(p_draft)));
end $$;

create function public.admin_publish_config()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_draft jsonb;
  v_pub jsonb;
  v_errors text[];
begin
  perform private.require_admin();
  select draft, published into v_draft, v_pub from public.site_config where id for update;
  v_errors := private.site_config_errors(v_draft);
  if array_length(v_errors, 1) > 0 then
    perform private.raise_validation(v_errors);
  end if;
  update public.site_config
     set published = draft, published_at = private.now(), published_by = auth.uid()
   where id;
  perform private.audit('config.publish', 'site_config', null,
    jsonb_build_object('changed_keys', (select coalesce(jsonb_agg(key), '[]'::jsonb)
      from jsonb_each(v_draft) where (v_pub -> key) is distinct from (v_draft -> key))));
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_discard_draft()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  update public.site_config set draft = published, updated_at = private.now(), updated_by = auth.uid() where id;
  perform private.audit('config.discard_draft', 'site_config', null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- Todo lo necesario para las pantallas de configuración, en una llamada.
create function public.admin_get_config()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  c public.campaigns%rowtype;
begin
  perform private.require_admin();
  select * into c from public.campaigns where id = private.current_campaign_id();
  return jsonb_build_object(
    'campaign', to_jsonb(c),
    'prizes', coalesce((select jsonb_agg(to_jsonb(p) order by p.archived_at nulls first, p.sort_order, p.id)
                          from public.prizes p where p.campaign_id = c.id), '[]'::jsonb),
    'site', (select jsonb_build_object('draft', draft, 'published', published,
                                         'published_at', published_at, 'updated_at', updated_at)
               from public.site_config),
    'errors', to_jsonb(private.campaign_errors(c.id))
  );
end $$;
