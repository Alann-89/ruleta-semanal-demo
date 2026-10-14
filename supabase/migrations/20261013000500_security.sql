-- =====================================================================
-- Ruleta semanal — 5/5: permisos, RLS y almacenamiento.
--
-- Modelo: los clientes (anon/authenticated) NO pueden escribir en ninguna
-- tabla. Solo leen lo propio por RLS y llaman a las funciones RPC listadas
-- abajo. Todo lo demás está cerrado por omisión.
-- =====================================================================

-- 1) Cerrar todo -------------------------------------------------------
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

-- 2) Funciones que usan las políticas RLS -----------------------------
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.app_role() to authenticated;
grant execute on function private.now() to authenticated;

-- 3) Lectura (siempre filtrada por RLS) --------------------------------
grant select on public.profiles, public.spins, public.coupons, public.extra_spins,
                public.campaigns, public.prizes, public.codes, public.audit_log, public.site_config
  to authenticated;

-- 4) RPC expuestas ------------------------------------------------------
grant execute on function public.get_public_state() to anon, authenticated;

grant execute on function
  public.get_my_status(),
  public.spin(uuid, text),
  public.get_spin_result(uuid),
  public.ack_spin(uuid),
  public.redeem_promo_code(text),
  public.get_my_coupons(),
  public.get_my_history(integer, integer),
  public.request_coupon_email(uuid)
to authenticated;

-- Personal de tienda (el rol se valida dentro de cada función)
grant execute on function
  public.staff_lookup_coupon(text),
  public.staff_redeem_coupon(uuid),
  public.staff_list_coupons(text, text, uuid, timestamptz, timestamptz, date, integer, integer)
to authenticated;

-- Administración (el rol se valida dentro de cada función)
grant execute on function
  public.admin_void_coupon(uuid, text, boolean),
  public.admin_dashboard(timestamptz, timestamptz),
  public.admin_update_campaign(uuid, jsonb),
  public.admin_save_outcomes(uuid, jsonb),
  public.admin_check_campaign(uuid),
  public.admin_get_config(),
  public.admin_simulate_spin(uuid),
  public.admin_grant_extra_spin(uuid, text, integer),
  public.admin_revoke_extra_spin(uuid, text),
  public.admin_list_extra_spins(text, integer, integer),
  public.admin_create_codes(text, integer, timestamptz, text),
  public.admin_list_codes(text, integer, integer),
  public.admin_deactivate_code(uuid),
  public.admin_list_users(text, text, integer, integer),
  public.admin_set_role(uuid, text),
  public.admin_set_blocked(uuid, boolean, text),
  public.admin_anonymize_user(uuid),
  public.admin_list_spins(text, text, date, integer, integer),
  public.admin_list_audit(text, integer, integer),
  public.admin_save_draft(jsonb),
  public.admin_publish_config(),
  public.admin_discard_draft()
to authenticated;

-- 5) RLS: cada persona ve solo lo suyo; el administrador ve todo -------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());

create policy spins_select on public.spins for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy coupons_select on public.coupons for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy extra_spins_select on public.extra_spins for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy campaigns_select on public.campaigns for select to authenticated
  using (private.is_admin());

create policy prizes_select on public.prizes for select to authenticated
  using (private.is_admin());

create policy codes_select on public.codes for select to authenticated
  using (private.is_admin());

create policy audit_select on public.audit_log for select to authenticated
  using (private.is_admin());

create policy site_config_select on public.site_config for select to authenticated
  using (private.is_admin());

-- rate_limits: sin políticas => nadie (salvo funciones SECURITY DEFINER).

-- 6) Almacenamiento de imágenes ----------------------------------------
-- Bucket público (las imágenes de premios y marca son públicas). Solo un
-- administrador puede subir, reemplazar o borrar. Límite de 512 KB y tipos
-- de imagen web; el panel además comprime en el navegador.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = 524288, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

create policy media_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and private.is_admin());
create policy media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.is_admin());
create policy media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and private.is_admin())
  with check (bucket_id = 'media' and private.is_admin());
create policy media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and private.is_admin());
