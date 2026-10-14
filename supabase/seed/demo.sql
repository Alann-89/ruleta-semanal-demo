-- =====================================================================
-- DATOS DE DEMOSTRACIÓN — solo para desarrollo local o un proyecto de pruebas.
-- NUNCA ejecutes este archivo en producción: crea resultados, usuarios
-- y giros ficticios. Se aplica con:  npm run dev:local  (automático)
-- o manualmente en un proyecto de PRUEBAS desde el SQL Editor.
--
-- Es seguro ejecutarlo varias veces: limpia lo que creó antes (prefijo "demo-").
-- =====================================================================

do $demo$
declare
  v_cid uuid;
  v_cfg jsonb;
begin
  select id into v_cid from public.campaigns order by created_at limit 1;

  -- Limpieza de una ejecución anterior (TRUNCATE no activa los triggers de inmutabilidad)
  truncate public.coupons, public.extra_spins, public.spins, public.codes, public.prizes, public.audit_log, public.rate_limits cascade;
  update public.campaigns set status = 'draft', budget_max = null, budget_committed = 0,
    max_prizes_per_day = null, max_prizes_per_week = null, max_prizes_total = null,
    require_participation_code = false, max_extra_spins_per_week = 2, name = 'Ruleta semanal (demo)'
   where id = v_cid;

  -- Apariencia de demostración: Luky Home (naranja y variantes)
  select published into v_cfg from public.site_config;
  v_cfg := jsonb_set(v_cfg, '{store,name}', '"Luky Home"');
  v_cfg := jsonb_set(v_cfg, '{store,tagline}', '"Importados de calidad · Gira y gana cada semana"');
  v_cfg := jsonb_set(v_cfg, '{theme}', '{"primary":"#ec5b1f","secondary":"#a8340e","accent":"#ffc857","background":"#fff8f1","background_image_url":null,"glow":70,"motion":75}'::jsonb);
  v_cfg := jsonb_set(v_cfg, '{copy,welcome_title}', '"¡Gira y gana un premio en Luky Home!"');
  v_cfg := jsonb_set(v_cfg, '{copy,welcome_text}', '"Inicia sesión con Google y gira una vez por semana. Tus premios los canjeas en la tienda."');
  v_cfg := jsonb_set(v_cfg, '{contact,maps_url}', '"https://maps.app.goo.gl/BYqirUuhLhYBcdqZ6"');
  v_cfg := jsonb_set(v_cfg, '{contact,address}', '"Dirección de ejemplo (demo): configúrala en el panel"');
  update public.site_config set draft = v_cfg, published = v_cfg, published_at = now();

  -- Resultados de demostración (suman 100 %). Productos ficticios.
  insert into public.prizes (campaign_id, name, description, kind, value, sector_label, color, sort_order, probability, stock, est_cost, conditions, coupon_valid_days, is_active) values
    (v_cid, 'Set de organizadores',  'Set de 3 organizadores para el hogar.',      'product',          0,  'Organizador',   '#ec5b1f',  1,  2.000,   5, 250.00, 'Se entrega en tienda. Presenta tu código.', 30, true),
    (v_cid, '20 % de descuento',     '20 % en tu compra del día.',                  'percent_discount', 20, '20 % dto.',     '#ffffff',  2,  8.000, null,  30.00, 'No acumulable con otras promociones.', 14, true),
    (v_cid, '$50 de descuento',      '$50 de descuento en compras desde $300.',     'fixed_discount',   50, '$50 dto.',      '#a8340e',  3, 10.000, null,  50.00, 'Compra mínima de $300.', 14, true),
    (v_cid, 'Termo de acero',        'Termo de acero inoxidable de 500 ml.',        'product',          0,  'Termo',         '#ffe3cf',  4,  4.000,   8, 120.00, 'Uno por cliente. Sujeto a existencias.', 21, true),
    (v_cid, '2×1 en snacks',         'Lleva 2 snacks importados y paga 1.',         'conditional_promo',0,  '2×1 snacks',    '#ff8a3d',  5,  8.000, null,  25.00, 'Solo snacks seleccionados. Lunes a jueves.', 14, true),
    (v_cid, '¡Vuelve a girar!',      'Ganaste otra oportunidad.',                   'extra_spin',       0,  'Gira otra vez', '#ffffff',  6,  8.000, null,   0.00, null, 7, true),
    (v_cid, 'Sin premio',            'Esta vez no hubo suerte.',                    'no_prize',         0,  'Casi...',       '#a8340e',  7, 60.000, null,   0.00, null, 1, true);

  update public.campaigns set status = 'active' where id = v_cid;
end
$demo$;
