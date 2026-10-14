-- Endurece las funciones auxiliares puras: search_path fijo (recomendación del linter de Supabase).
alter function private.now() set search_path = pg_catalog, pg_temp;
alter function private.rand_unit() set search_path = pg_catalog, pg_temp;
alter function private.rand_code(integer) set search_path = pg_catalog, pg_temp;
alter function private.norm_code(text) set search_path = pg_catalog, pg_temp;
alter function private.like_escape(text) set search_path = pg_catalog, pg_temp;
alter function private.mask_email(text) set search_path = pg_catalog, pg_temp;
alter function private.week_start(timestamptz, text) set search_path = pg_catalog, pg_temp;
alter function private.week_start_ts(date, text) set search_path = pg_catalog, pg_temp;
alter function private.err(text, jsonb) set search_path = pg_catalog, pg_temp;
alter function private.jsonb_diff(jsonb, jsonb) set search_path = pg_catalog, pg_temp;
alter function private.touch_updated_at() set search_path = pg_catalog, pg_temp;
alter function private.forbid_mutation() set search_path = pg_catalog, pg_temp;
alter function private.spins_guard() set search_path = pg_catalog, pg_temp;
alter function private.coupons_guard() set search_path = pg_catalog, pg_temp;
alter function private.raise_validation(text[]) set search_path = pg_catalog, pg_temp;
alter function private.site_config_errors(jsonb) set search_path = pg_catalog, pg_temp;
