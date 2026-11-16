-- =====================================================================
-- Sorteo: información que exige la NOM-028-SCFI-2007 (promociones por
-- sorteo) y requisitos para publicarlo.
--
-- - Cada sorteo tiene sus propias bases (texto que redacta la tienda; el
--   panel ofrece una plantilla con los datos del sorteo).
-- - No se publica sin número de permiso de la Secretaría de Gobernación,
--   sin explicar cómo se consigue un boleto y sin bases completas.
-- - Los textos legales del sitio (reglas y aviso de privacidad) no se
--   publican mientras tengan datos marcados como [COMPLETAR …].
-- =====================================================================

alter table public.raffles
  add column how_to_get    text check (how_to_get is null or char_length(how_to_get) <= 240),
  add column prize_value   numeric(12, 2) check (prize_value is null or prize_value >= 0),
  add column permit_number text check (permit_number is null or char_length(permit_number) <= 60),
  add column rules_text    text check (rules_text is null or char_length(rules_text) <= 12000),
  add column published_at  timestamptz;

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
  if char_length(coalesce(p ->> 'permit_number', '')) > 60 then e := array_append(e, 'Número de permiso: máximo 60 caracteres.'); end if;
  if char_length(coalesce(p ->> 'rules_text', '')) > 12000 then e := array_append(e, 'Bases del sorteo: máximo 12 000 caracteres.'); end if;
  if nullif(p ->> 'prize_value', '') is not null then
    begin x := (p ->> 'prize_value')::numeric; exception when others then x := -1; end;
    if x < 0 then e := array_append(e, 'Valor del premio: un número en pesos (o déjalo vacío).'); end if;
  end if;
  return e;
end $$;

-- Lo que falta para poder publicar (NOM-028-SCFI-2007, 4.1.10).
create function private.raffle_publish_errors(r public.raffles)
returns text[] language plpgsql stable set search_path = public, private, pg_temp
as $$
declare
  e text[] := '{}';
begin
  if nullif(btrim(coalesce(r.permit_number, '')), '') is null then
    e := array_append(e, 'Escribe el número de permiso de la Secretaría de Gobernación.');
  end if;
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
                                draw_mode, max_per_customer, claim_days, how_to_get, prize_value, permit_number, rules_text,
                                created_by, created_at, updated_at)
    values (btrim(p ->> 'title'), btrim(p ->> 'prize'), btrim(p ->> 'prize_headline'), nullif(btrim(p ->> 'prize_detail'), ''),
            nullif(p ->> 'prize_image_url', ''), (p ->> 'unlock_at')::timestamptz, (p ->> 'draw_at')::timestamptz,
            p ->> 'draw_mode', (p ->> 'max_per_customer')::integer, (p ->> 'claim_days')::integer,
            nullif(btrim(p ->> 'how_to_get'), ''), nullif(p ->> 'prize_value', '')::numeric,
            nullif(btrim(p ->> 'permit_number'), ''), nullif(btrim(p ->> 'rules_text'), ''),
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
    permit_number = nullif(btrim(p ->> 'permit_number'), ''), rules_text = nullif(btrim(p ->> 'rules_text'), '')
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

create or replace function public.admin_set_raffle_status(p_raffle_id uuid, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = public, private, pg_temp
as $$
declare
  r public.raffles%rowtype;
  v_errors text[];
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
  if p_status = 'published' and r.winner_ticket_id is null then
    v_errors := private.raffle_publish_errors(r);
    if array_length(v_errors, 1) > 0 then
      perform private.raise_validation(v_errors);
    end if;
  end if;
  if p_status = 'draft' and r.winner_ticket_id is not null then
    return private.err('raffle_drawn');
  end if;
  update public.raffles
     set status = p_status,
         published_at = case when p_status = 'published' then coalesce(published_at, private.now()) else published_at end
   where id = r.id;
  perform private.audit('raffle.status', 'raffle', r.id::text, jsonb_build_object('from', r.status, 'to', p_status));
  return jsonb_build_object('ok', true);
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
      'how_to_get', r.how_to_get, 'prize_value', r.prize_value, 'permit_number', r.permit_number,
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

revoke all on function private.raffle_publish_errors(public.raffles) from public, anon, authenticated;

-- Textos legales del sitio: no se publican con datos pendientes ([COMPLETAR …]).
create or replace function private.site_config_errors(j jsonb)
returns text[] language plpgsql immutable set search_path = pg_catalog, pg_temp
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
  -- Textos legales: no se publican con datos pendientes.
  if position('[COMPLETAR' in coalesce(j ->> 'rules_text', '')) > 0 then
    e := array_append(e, 'Reglas: completa los datos marcados como [COMPLETAR …].');
  end if;
  if position('[COMPLETAR' in coalesce(j ->> 'privacy_text', '')) > 0 then
    e := array_append(e, 'Aviso de privacidad: completa los datos marcados como [COMPLETAR …].');
  end if;
  return e;
end $$;

