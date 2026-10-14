-- =====================================================================
-- Ruleta semanal — 3/5: API de cliente (RPC expuestas por PostgREST)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Estado público: campaña, configuración publicada y sectores visibles.
-- No expone probabilidades, existencias ni costos. Solo muestra los
-- resultados que hoy se pueden obtener (no se anuncia lo agotado).
-- ---------------------------------------------------------------------
create function public.get_public_state()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  c public.campaigns%rowtype;
  v_now timestamptz := private.now();
begin
  select * into c from public.campaigns where id = private.current_campaign_id();
  if not found then
    return jsonb_build_object('server_time', v_now, 'campaign', null,
      'config', (select published from public.site_config), 'outcomes', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'server_time', v_now,
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status, 'timezone', c.timezone,
      'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'require_participation_code', c.require_participation_code
    ),
    'config', (select published from public.site_config),
    'outcomes', case when c.status = 'draft' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'label', p.sector_label, 'color', p.color,
               'image_url', p.image_url, 'kind', p.kind) order by p.sort_order, p.id)
      from public.prizes p
      join private.prize_availability(c.id, v_now, false) a on a.prize_id = p.id
      where a.available
    ), '[]'::jsonb) end
  );
end $$;

-- ---------------------------------------------------------------------
-- Estado de participación de la cuenta actual.
-- ---------------------------------------------------------------------
create function public.get_my_status()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles%rowtype;
  c public.campaigns%rowtype;
  v_now timestamptz := private.now();
  v_week date;
  v_base_used boolean;
  v_extras jsonb;
  v_unseen uuid;
  v_reason text := null;
  v_can boolean := false;
  v_pending integer;
begin
  if v_uid is null then
    return private.err('not_authenticated');
  end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found then
    return private.err('no_profile');
  end if;

  select * into c from public.campaigns where id = private.current_campaign_id();
  if not found then
    return jsonb_build_object('ok', true, 'can_spin', false, 'reason', 'no_campaign',
      'user', jsonb_build_object('id', v_prof.id, 'email', v_prof.email, 'name', v_prof.display_name,
                                  'avatar_url', v_prof.avatar_url, 'role', v_prof.role));
  end if;

  v_week := private.week_start(v_now, c.timezone);
  select exists (select 1 from public.spins
                  where user_id = v_uid and campaign_id = c.id and week_start = v_week and origin = 'base')
    into v_base_used;

  update public.extra_spins set status = 'expired'
   where user_id = v_uid and status = 'available' and expires_at <= v_now;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'origin', e.origin, 'expires_at', e.expires_at)
                            order by e.expires_at), '[]'::jsonb)
    into v_extras
  from public.extra_spins e
  where e.user_id = v_uid and e.campaign_id = c.id and e.status = 'available' and e.expires_at > v_now;

  select id into v_unseen from public.spins
   where user_id = v_uid and seen_at is null
   order by created_at desc limit 1;

  select count(*) into v_pending from public.coupons
   where user_id = v_uid and status = 'pending' and expires_at > v_now;

  if v_prof.is_blocked or v_prof.anonymized_at is not null then
    v_reason := 'account_blocked';
  elsif c.status <> 'active' then
    v_reason := 'campaign_' || c.status;
  elsif c.starts_at is not null and v_now < c.starts_at then
    v_reason := 'campaign_not_started';
  elsif c.ends_at is not null and v_now >= c.ends_at then
    v_reason := 'campaign_ended';
  elsif v_base_used and jsonb_array_length(v_extras) = 0 then
    v_reason := 'already_spun';
  else
    v_can := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'server_time', v_now,
    'user', jsonb_build_object('id', v_prof.id, 'email', v_prof.email, 'name', v_prof.display_name,
                                'avatar_url', v_prof.avatar_url, 'role', v_prof.role),
    'campaign_status', c.status,
    'timezone', c.timezone,
    'week_start', v_week,
    'week_ends_at', private.week_start_ts(v_week + 7, c.timezone),
    'base_available', not v_base_used,
    'next_base_at', case when v_base_used then private.week_start_ts(v_week + 7, c.timezone) else null end,
    'extras', v_extras,
    'can_spin', v_can,
    'reason', v_reason,
    'require_participation_code', c.require_participation_code and not v_base_used,
    'pending_coupons', v_pending,
    'unseen_spin', case when v_unseen is null then null else private.spin_payload(v_unseen, true) end
  );
end $$;

-- ---------------------------------------------------------------------
-- EL GIRO. Transaccional, idempotente y serializado por campaña.
-- El servidor decide el resultado; el navegador solo lo anima.
-- ---------------------------------------------------------------------
create function public.spin(p_request_id uuid, p_participation_code text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles%rowtype;
  c public.campaigns%rowtype;
  v_now timestamptz;
  v_week date;
  v_existing uuid;
  v_origin text;
  v_extra public.extra_spins%rowtype;
  v_code public.codes%rowtype;
  v_cap boolean;
  v_ids uuid[];
  v_weights numeric[];
  v_total numeric;
  v_roll numeric;
  v_cum numeric := 0;
  v_pick uuid;
  v_prize public.prizes%rowtype;
  v_spin_id uuid;
  v_coupon_id uuid;
  v_attempt integer;
  i integer;
begin
  -- 1. Sesión
  if v_uid is null then
    return private.err('not_authenticated');
  end if;
  if p_request_id is null then
    return private.err('bad_request');
  end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found or v_prof.is_blocked or v_prof.anonymized_at is not null then
    return private.err('account_blocked');
  end if;
  if not private.rate_hit('spin:' || v_uid::text, 20, 60) then
    return private.err('rate_limited');
  end if;

  -- 2. Reintento (idempotencia): misma solicitud => mismo resultado.
  select id into v_existing from public.spins where user_id = v_uid and request_id = p_request_id;
  if found then
    return private.spin_payload(v_existing, true);
  end if;

  -- 3. Campaña vigente. El bloqueo de la fila serializa todos los giros:
  --    inventario, presupuesto y el "giro base semanal" son consistentes.
  select * into c from public.campaigns where id = private.current_campaign_id() for update;
  if not found then
    return private.err('no_campaign');
  end if;
  v_now := private.now();

  select id into v_existing from public.spins where user_id = v_uid and request_id = p_request_id;
  if found then
    return private.spin_payload(v_existing, true);
  end if;

  if c.status <> 'active' then
    return private.err('campaign_inactive', jsonb_build_object('status', c.status));
  end if;
  if c.starts_at is not null and v_now < c.starts_at then
    return private.err('campaign_inactive', jsonb_build_object('status', 'not_started'));
  end if;
  if c.ends_at is not null and v_now >= c.ends_at then
    return private.err('campaign_inactive', jsonb_build_object('status', 'ended'));
  end if;

  -- 4. Semana y giro disponible (base o extra)
  v_week := private.week_start(v_now, c.timezone);
  update public.extra_spins set status = 'expired'
   where user_id = v_uid and status = 'available' and expires_at <= v_now;

  if not exists (select 1 from public.spins
                  where user_id = v_uid and campaign_id = c.id and week_start = v_week and origin = 'base') then
    v_origin := 'base';
  else
    select * into v_extra from public.extra_spins
     where user_id = v_uid and campaign_id = c.id and status = 'available' and expires_at > v_now
     order by expires_at, created_at
     limit 1
     for update;
    if not found then
      return private.err('no_spin_available',
        jsonb_build_object('next_base_at', private.week_start_ts(v_week + 7, c.timezone)));
    end if;
    v_origin := 'extra';
  end if;

  -- 4b. Modalidad opcional: código de participación entregado en tienda.
  if v_origin = 'base' and c.require_participation_code then
    if p_participation_code is null or btrim(p_participation_code) = '' then
      return private.err('code_required');
    end if;
    if private.rate_blocked('code:' || v_uid::text, 8, 600) then
      return private.err('too_many_attempts');
    end if;
    select * into v_code from public.codes
     where code = private.norm_code(p_participation_code)
       and kind = 'participation' and campaign_id = c.id
       and active and used_at is null
       and (expires_at is null or expires_at > v_now)
     for update;
    if not found then
      perform private.rate_hit('code:' || v_uid::text, 8, 600);
      return private.err('invalid_code');
    end if;
  end if;

  -- 5. Tope semanal de "vuelve a girar" por cuenta
  select count(*) >= c.max_extra_spins_per_week into v_cap
    from public.extra_spins
   where user_id = v_uid and campaign_id = c.id and origin = 'prize'
     and week_start = v_week and status <> 'revoked';

  -- 6. Sorteo con aleatoriedad segura y pesos efectivos
  select array_agg(w.prize_id order by w.sort_order, w.prize_id),
         array_agg(w.weight order by w.sort_order, w.prize_id)
    into v_ids, v_weights
  from private.effective_weights(c.id, v_now, v_cap) w;

  select coalesce(sum(x), 0) into v_total from unnest(v_weights) x;
  if v_ids is null or v_total <= 0 then
    return private.err('nothing_available');
  end if;

  v_roll := (private.rand_unit()::numeric) * v_total;
  for i in 1 .. array_length(v_ids, 1) loop
    if v_weights[i] > 0 then
      v_pick := v_ids[i];                       -- último con peso > 0 por redondeo
      v_cum := v_cum + v_weights[i];
      exit when v_roll < v_cum;
    end if;
  end loop;

  -- 7. Reservar inventario y presupuesto
  select * into v_prize from public.prizes where id = v_pick for update;
  if v_prize.stock is not null then
    update public.prizes set stock = stock - 1 where id = v_prize.id;   -- CHECK stock >= 0
  end if;
  if v_prize.kind <> 'no_prize' and v_prize.est_cost > 0 then
    update public.campaigns set budget_committed = budget_committed + v_prize.est_cost
     where id = c.id;                                                   -- CHECK <= budget_max
  end if;

  -- 8. Registrar el giro (con copia histórica del resultado)
  insert into public.spins (
    user_id, campaign_id, week_start, origin, extra_spin_id, participation_code_id, request_id,
    prize_id, prize_name, prize_label, prize_kind, prize_value, prize_description,
    prize_color, prize_image_url, prize_conditions, created_at)
  values (
    v_uid, c.id, v_week, v_origin, v_extra.id, v_code.id, p_request_id,
    v_prize.id, v_prize.name, v_prize.sector_label, v_prize.kind, v_prize.value, v_prize.description,
    v_prize.color, v_prize.image_url, v_prize.conditions, v_now)
  returning id into v_spin_id;

  if v_origin = 'extra' then
    update public.extra_spins set status = 'used', used_at = v_now where id = v_extra.id;
  end if;
  if v_code.id is not null then
    update public.codes set used_by = v_uid, used_at = v_now, spin_id = v_spin_id, active = false
     where id = v_code.id;
  end if;

  -- 9. Cupón con código único (servidor) o giro extra concedido
  if v_prize.kind in ('product', 'percent_discount', 'fixed_discount', 'conditional_promo') then
    for v_attempt in 1 .. 6 loop
      begin
        insert into public.coupons (
          campaign_id, user_id, spin_id, prize_id, code,
          prize_name, prize_kind, prize_value, prize_description, prize_image_url, prize_conditions,
          est_cost, expires_at, created_at)
        values (
          c.id, v_uid, v_spin_id, v_prize.id, private.rand_code(12),
          v_prize.name, v_prize.kind, v_prize.value, v_prize.description, v_prize.image_url, v_prize.conditions,
          v_prize.est_cost,
          -- vigente durante todo el último día
          ((((v_now at time zone c.timezone)::date + v_prize.coupon_valid_days + 1)::timestamp) at time zone c.timezone),
          v_now)
        returning id into v_coupon_id;
        exit;
      exception when unique_violation then
        if v_attempt = 6 then raise; end if;     -- colisión de código improbable: reintentar
      end;
    end loop;
  elsif v_prize.kind = 'extra_spin' then
    insert into public.extra_spins (user_id, campaign_id, origin, week_start, source_spin_id, expires_at, created_at)
    values (v_uid, c.id, 'prize', v_week, v_spin_id,
            v_now + make_interval(days => c.extra_spin_valid_days), v_now);
  end if;

  return private.spin_payload(v_spin_id, false);
end $$;

-- Recuperar el resultado de una solicitud de giro sin crear nada.
create function public.get_spin_result(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    return private.err('not_authenticated');
  end if;
  select id into v_id from public.spins where user_id = auth.uid() and request_id = p_request_id;
  if not found then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  return private.spin_payload(v_id, true) || jsonb_build_object('found', true);
end $$;

-- El cliente ya vio el resultado (fin de la animación / cierre del aviso).
create function public.ack_spin(p_spin_id uuid)
returns void language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.spins set seen_at = private.now()
   where user_id = auth.uid() and seen_at is null
     and created_at <= (select created_at from public.spins where id = p_spin_id and user_id = auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- Código promocional de un solo uso => giro extra
-- ---------------------------------------------------------------------
create function public.redeem_promo_code(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles%rowtype;
  c public.campaigns%rowtype;
  v_code public.codes%rowtype;
  v_now timestamptz;
  v_week date;
  v_extra_id uuid;
begin
  if v_uid is null then
    return private.err('not_authenticated');
  end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found or v_prof.is_blocked or v_prof.anonymized_at is not null then
    return private.err('account_blocked');
  end if;
  if private.rate_blocked('code:' || v_uid::text, 8, 600) then
    return private.err('too_many_attempts');
  end if;

  select * into c from public.campaigns where id = private.current_campaign_id() for update;
  if not found or c.status <> 'active' then
    return private.err('campaign_inactive');
  end if;
  v_now := private.now();
  v_week := private.week_start(v_now, c.timezone);

  select * into v_code from public.codes
   where code = private.norm_code(p_code) and kind = 'extra_spin' and campaign_id = c.id
     and active and used_at is null and (expires_at is null or expires_at > v_now)
   for update;
  if not found then
    perform private.rate_hit('code:' || v_uid::text, 8, 600);
    return private.err('invalid_code');
  end if;

  update public.codes set used_by = v_uid, used_at = v_now, active = false where id = v_code.id;
  insert into public.extra_spins (user_id, campaign_id, origin, week_start, code_id, expires_at, created_at)
  values (v_uid, c.id, 'promo_code', v_week, v_code.id,
          v_now + make_interval(days => c.extra_spin_valid_days), v_now)
  returning id into v_extra_id;

  return jsonb_build_object('ok', true, 'extra_spin_id', v_extra_id);
end $$;

-- ---------------------------------------------------------------------
-- Lecturas de la cuenta actual (el frontend solo usa RPC; RLS además
-- protege las tablas por si alguien las consulta directamente).
-- ---------------------------------------------------------------------
create function public.get_my_coupons()
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz := private.now();
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'status', c.status,
      'effective_status', case when c.status = 'pending' and c.expires_at <= v_now then 'expired' else c.status end,
      'prize_name', c.prize_name, 'prize_kind', c.prize_kind, 'prize_value', c.prize_value,
      'prize_description', c.prize_description, 'prize_image_url', c.prize_image_url,
      'prize_conditions', c.prize_conditions, 'expires_at', c.expires_at, 'created_at', c.created_at,
      'redeemed_at', c.redeemed_at, 'void_reason', c.void_reason) order by c.created_at desc)
    from (select * from public.coupons where user_id = auth.uid() order by created_at desc limit 200) c
  ), '[]'::jsonb);
end $$;

create function public.get_my_history(p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_now timestamptz := private.now();
begin
  if auth.uid() is null then
    return jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.spins where user_id = auth.uid()),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'created_at', s.created_at, 'origin', s.origin, 'week_start', s.week_start,
        'prize_name', s.prize_name, 'prize_kind', s.prize_kind, 'prize_image_url', s.prize_image_url,
        'coupon_code', c.code,
        'coupon_status', case when c.id is null then null
                              when c.status = 'pending' and c.expires_at <= v_now then 'expired' else c.status end
      ) order by s.created_at desc, s.id)
      from (select * from public.spins where user_id = auth.uid()
             order by created_at desc, id limit v_limit offset v_offset) s
      left join public.coupons c on c.spin_id = s.id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- OPCIONAL: envío del propio cupón por correo (ver docs/EMAIL.md).
-- Solo devuelve datos del cupón del usuario autenticado y de su propio correo;
-- limitado a 5 solicitudes por usuario al día.
-- ---------------------------------------------------------------------
create function public.request_coupon_email(p_coupon_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  c public.coupons%rowtype;
  v_email text;
begin
  if v_uid is null then
    return private.err('not_authenticated');
  end if;
  if not private.rate_hit('mail:' || v_uid::text, 5, 86400) then
    return private.err('rate_limited');
  end if;
  select * into c from public.coupons where id = p_coupon_id and user_id = v_uid;
  if not found then
    return private.err('not_found');
  end if;
  if c.status <> 'pending' or c.expires_at <= private.now() then
    return private.err('not_pending');
  end if;
  select email into v_email from public.profiles where id = v_uid and anonymized_at is null;
  return jsonb_build_object('ok', true, 'email', v_email, 'code', c.code, 'prize_name', c.prize_name,
    'conditions', c.prize_conditions, 'expires_at', c.expires_at);
end $$;
