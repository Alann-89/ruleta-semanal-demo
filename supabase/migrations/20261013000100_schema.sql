-- =====================================================================
-- Ruleta semanal — 1/5: esquema (tablas, restricciones, índices)
--
-- Principios:
--  * Toda escritura sensible ocurre dentro de funciones SECURITY DEFINER
--    (ver migraciones 3 y 4). Los clientes NO tienen INSERT/UPDATE/DELETE.
--  * El historial es inmutable: giros, cupones y auditoría no se borran.
--  * Los premios ganados guardan una copia (snapshot) del nombre, valor y
--    condiciones, de modo que editar un premio no altera cupones existentes.
-- =====================================================================

create schema if not exists private;

-- Que nada quede ejecutable por PUBLIC/anon/authenticated por omisión.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ---------------------------------------------------------------------
-- Perfiles (1:1 con auth.users). El rol vive aquí y solo lo cambia
-- admin_set_role() o el SQL Editor (primer administrador).
-- ---------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  display_name   text,
  avatar_url     text,
  role           text not null default 'customer' check (role in ('customer', 'staff', 'admin')),
  is_blocked     boolean not null default false,
  blocked_reason text,
  anonymized_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role) where role <> 'customer';

-- ---------------------------------------------------------------------
-- Campaña (en v1 hay una vigente a la vez; el esquema admite varias).
-- ---------------------------------------------------------------------
create table public.campaigns (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null check (char_length(name) between 1 and 80),
  status                     text not null default 'draft' check (status in ('draft', 'active', 'paused', 'closed')),
  timezone                   text not null default 'America/Mexico_City',
  starts_at                  timestamptz,
  ends_at                    timestamptz,
  require_participation_code boolean not null default false,
  max_extra_spins_per_week   integer not null default 2 check (max_extra_spins_per_week between 0 and 20),
  extra_spin_valid_days      integer not null default 7 check (extra_spin_valid_days between 1 and 90),
  -- 'to_no_prize': la probabilidad de lo agotado pasa a "sin premio" (por omisión)
  -- 'redistribute': se reparte proporcionalmente entre lo que sigue disponible
  depletion_policy           text not null default 'to_no_prize' check (depletion_policy in ('to_no_prize', 'redistribute')),
  budget_max                 numeric(12, 2) check (budget_max is null or budget_max >= 0),
  budget_committed           numeric(12, 2) not null default 0 check (budget_committed >= 0),
  max_prizes_per_day         integer check (max_prizes_per_day is null or max_prizes_per_day >= 0),
  max_prizes_per_week        integer check (max_prizes_per_week is null or max_prizes_per_week >= 0),
  max_prizes_total           integer check (max_prizes_total is null or max_prizes_total >= 0),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint campaigns_window_valid check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint campaigns_budget_not_exceeded check (budget_max is null or budget_committed <= budget_max)
);
-- Solo una campaña viva (activa o pausada) a la vez.
create unique index campaigns_single_live on public.campaigns ((true)) where status in ('active', 'paused');

-- ---------------------------------------------------------------------
-- Resultados / premios de la ruleta
-- ---------------------------------------------------------------------
create table public.prizes (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.campaigns (id),
  name               text not null check (char_length(name) between 1 and 80),
  description        text check (description is null or char_length(description) <= 400),
  image_url          text check (image_url is null or image_url ~ '^https://[^\s"''()<>]+$'),
  kind               text not null check (kind in ('product', 'percent_discount', 'fixed_discount', 'conditional_promo', 'extra_spin', 'no_prize')),
  value              numeric(10, 2) not null default 0 check (value >= 0),
  sector_label       text not null check (char_length(sector_label) between 1 and 24),
  color              text not null default '#ff7a1a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order         integer not null default 0,
  probability        numeric(6, 3) not null default 0 check (probability between 0 and 100),
  stock              integer check (stock is null or stock >= 0),     -- null = ilimitado
  est_cost           numeric(10, 2) not null default 0 check (est_cost >= 0),
  conditions         text check (conditions is null or char_length(conditions) <= 600),
  coupon_valid_days  integer not null default 30 check (coupon_valid_days between 1 and 365),
  daily_limit        integer check (daily_limit is null or daily_limit >= 0),
  weekly_limit       integer check (weekly_limit is null or weekly_limit >= 0),
  total_limit        integer check (total_limit is null or total_limit >= 0),
  is_active          boolean not null default false,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint prizes_percent_range check (kind <> 'percent_discount' or value <= 100)
);
create index prizes_campaign_idx on public.prizes (campaign_id, sort_order) where archived_at is null;

-- ---------------------------------------------------------------------
-- Códigos de un solo uso (giro extra por promoción / participación en tienda)
-- ---------------------------------------------------------------------
create table public.codes (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id),
  kind        text not null check (kind in ('extra_spin', 'participation')),
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8,12}$'),
  note        text check (note is null or char_length(note) <= 200),
  expires_at  timestamptz,
  active      boolean not null default true,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  used_by     uuid references public.profiles (id),
  used_at     timestamptz,
  spin_id     uuid,
  constraint codes_used_consistent check ((used_by is null) = (used_at is null))
);
create index codes_campaign_idx on public.codes (campaign_id, kind, created_at desc);

-- ---------------------------------------------------------------------
-- Giros extra: excepción explícita al giro base semanal.
-- ---------------------------------------------------------------------
create table public.extra_spins (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id),
  campaign_id    uuid not null references public.campaigns (id),
  origin         text not null check (origin in ('prize', 'admin', 'promo_code')),
  status         text not null default 'available' check (status in ('available', 'used', 'expired', 'revoked')),
  week_start     date not null,                 -- semana en que se concedió
  source_spin_id uuid,                          -- origin = prize
  code_id        uuid references public.codes (id),   -- origin = promo_code
  granted_by     uuid references public.profiles (id),
  reason         text,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  revoked_at     timestamptz,
  revoked_by     uuid references public.profiles (id),
  revoke_reason  text,
  created_at     timestamptz not null default now(),
  constraint extra_admin_needs_reason check (origin <> 'admin' or (reason is not null and char_length(btrim(reason)) >= 5)),
  constraint extra_revoke_needs_reason check (status <> 'revoked' or (revoke_reason is not null and char_length(btrim(revoke_reason)) >= 3))
);
create index extra_spins_user_idx on public.extra_spins (user_id, status, expires_at);
create index extra_spins_cap_idx on public.extra_spins (user_id, campaign_id, week_start) where origin = 'prize';

-- ---------------------------------------------------------------------
-- Giros (registro inmutable). Un giro base por cuenta y semana, garantizado
-- por el índice único parcial spins_one_base_per_week.
-- ---------------------------------------------------------------------
create table public.spins (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id),
  campaign_id           uuid not null references public.campaigns (id),
  week_start            date not null,
  origin                text not null check (origin in ('base', 'extra')),
  extra_spin_id         uuid references public.extra_spins (id),
  participation_code_id uuid references public.codes (id),
  request_id            uuid not null,          -- idempotencia
  prize_id              uuid not null references public.prizes (id),
  -- copia histórica del resultado
  prize_name            text not null,
  prize_label           text not null,
  prize_kind            text not null,
  prize_value           numeric(10, 2) not null default 0,
  prize_description     text,
  prize_color           text not null,
  prize_image_url       text,
  prize_conditions      text,
  seen_at               timestamptz,            -- el cliente ya vio el resultado
  created_at            timestamptz not null default now(),
  constraint spins_request_unique unique (user_id, request_id),
  constraint spins_extra_ref check ((origin = 'extra') = (extra_spin_id is not null))
);
create unique index spins_one_base_per_week on public.spins (user_id, campaign_id, week_start) where origin = 'base';
create unique index spins_extra_once on public.spins (extra_spin_id) where extra_spin_id is not null;
create index spins_user_idx on public.spins (user_id, created_at desc);
create index spins_campaign_idx on public.spins (campaign_id, created_at desc);
create index spins_prize_idx on public.spins (prize_id, created_at);

alter table public.codes add constraint codes_spin_fk foreign key (spin_id) references public.spins (id);
alter table public.extra_spins add constraint extra_spins_source_spin_fk foreign key (source_spin_id) references public.spins (id);

-- ---------------------------------------------------------------------
-- Cupones (premios canjeables)
-- ---------------------------------------------------------------------
create table public.coupons (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns (id),
  user_id           uuid not null references public.profiles (id),
  spin_id           uuid not null unique references public.spins (id),
  prize_id          uuid not null references public.prizes (id),
  code              text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{12}$'),
  -- copia histórica
  prize_name        text not null,
  prize_kind        text not null,
  prize_value       numeric(10, 2) not null default 0,
  prize_description text,
  prize_image_url   text,
  prize_conditions  text,
  est_cost          numeric(10, 2) not null default 0,
  status            text not null default 'pending' check (status in ('pending', 'redeemed', 'void')),
  expires_at        timestamptz not null,
  redeemed_at       timestamptz,
  redeemed_by       uuid references public.profiles (id),
  void_at           timestamptz,
  void_by           uuid references public.profiles (id),
  void_reason       text,
  created_at        timestamptz not null default now(),
  constraint coupons_redeemed_consistent check (status <> 'redeemed' or (redeemed_at is not null and redeemed_by is not null)),
  constraint coupons_void_consistent check (status <> 'void' or (void_at is not null and void_by is not null and void_reason is not null and char_length(btrim(void_reason)) >= 3))
);
create index coupons_user_idx on public.coupons (user_id, created_at desc);
create index coupons_campaign_idx on public.coupons (campaign_id, created_at desc);
create index coupons_status_idx on public.coupons (status, expires_at);
create index coupons_prize_idx on public.coupons (prize_id);

-- ---------------------------------------------------------------------
-- Auditoría (solo anexar) y límites de solicitudes
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_action_idx on public.audit_log (action, at desc);

create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null default 0
);

-- ---------------------------------------------------------------------
-- Apariencia y textos (borrador / publicado)
-- ---------------------------------------------------------------------
create table public.site_config (
  id           boolean primary key default true check (id),   -- fila única
  draft        jsonb not null,
  published    jsonb not null,
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id)
);

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.prizes enable row level security;
alter table public.codes enable row level security;
alter table public.extra_spins enable row level security;
alter table public.spins enable row level security;
alter table public.coupons enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;
alter table public.site_config enable row level security;
