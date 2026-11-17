export type Role = 'customer' | 'staff' | 'admin';
export type PrizeKind = 'product' | 'percent_discount' | 'fixed_discount' | 'conditional_promo' | 'extra_spin' | 'no_prize';
export type CouponStatus = 'pending' | 'redeemed' | 'expired' | 'void';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'closed';

export interface HoursRow { days: string; hours: string }

export interface SiteConfig {
  store: { name: string; tagline: string; logo_url: string | null };
  theme: {
    primary: string; secondary: string; accent: string; background: string;
    background_image_url: string | null; glow: number; motion: number;
    /** Diseño de temporada (id de lib/seasons). Se aplica sobre los colores de marca. */
    preset?: string | null;
    preset_copy?: boolean; preset_wheel?: boolean; preset_decor?: boolean;
    /** Fechas (YYYY-MM-DD) entre las que está activo; vacío = siempre. */
    preset_from?: string | null; preset_until?: string | null;
  };
  copy: {
    welcome_title: string; welcome_text: string; button_text: string;
    celebration_message: string; no_prize_message: string; extra_spin_message: string;
  };
  sound: { enabled_by_default: boolean; volume: number };
  contact: {
    address: string; maps_url: string | null; phone: string; whatsapp: string; email: string; hours: HoursRow[];
  };
  rules_text: string;
  privacy_text: string;
  redeem_text: string;
}

export interface Sector {
  id: string; name: string; label: string; color: string; image_url: string | null; kind: PrizeKind;
}

export interface PublicState {
  server_time: string;
  campaign: null | {
    id: string; name: string; status: CampaignStatus; timezone: string;
    starts_at: string | null; ends_at: string | null; require_participation_code: boolean;
  };
  config: SiteConfig;
  outcomes: Sector[];
}

export interface ExtraSpinInfo { id: string; origin: 'prize' | 'admin' | 'promo_code'; expires_at: string }

export interface SpinPayload {
  ok: true;
  replay: boolean;
  spin: { id: string; created_at: string; origin: 'base' | 'extra'; week_start: string; seen: boolean };
  prize: {
    id: string; name: string; label: string; kind: PrizeKind; value: number;
    description: string | null; color: string; image_url: string | null; conditions: string | null;
  };
  coupon: null | { id: string; code: string; expires_at: string; status: string };
  extra_spin_granted: boolean;
  extras_available: number;
  next_base_at: string;
  found?: boolean;
}

export interface MyStatus {
  ok: true;
  server_time: string;
  user: { id: string; email: string; name: string | null; avatar_url: string | null; role: Role };
  campaign_status?: CampaignStatus;
  timezone?: string;
  week_start?: string;
  week_ends_at?: string;
  base_available?: boolean;
  next_base_at?: string | null;
  extras?: ExtraSpinInfo[];
  can_spin: boolean;
  reason: string | null;
  require_participation_code?: boolean;
  pending_coupons?: number;
  unseen_spin?: SpinPayload | null;
}

export interface MyCoupon {
  id: string; code: string; status: string; effective_status: CouponStatus;
  prize_name: string; prize_kind: PrizeKind; prize_value: number; prize_description: string | null;
  prize_image_url: string | null; prize_conditions: string | null; expires_at: string; created_at: string;
  redeemed_at: string | null; void_reason: string | null;
}

export interface HistoryRow {
  id: string; created_at: string; origin: 'base' | 'extra'; week_start: string;
  prize_name: string; prize_kind: PrizeKind; prize_image_url: string | null;
  coupon_code: string | null; coupon_status: CouponStatus | null;
}

// ---- Personal / administración ---------------------------------------
export interface StaffCoupon {
  id: string; code: string; status: string; effective_status: CouponStatus;
  prize_id: string; prize_name: string; prize_kind: PrizeKind; prize_value: number;
  prize_description: string | null; prize_image_url: string | null; prize_conditions: string | null;
  expires_at: string; created_at: string; week_start: string; spin_origin: 'base' | 'extra';
  redeemed_at: string | null; redeemed_by_name: string | null;
  void_at: string | null; void_reason: string | null; est_cost: number | null;
  owner: { id: string; name: string | null; email: string | null };
}

export interface Paged<T> { total: number; rows: T[] }

// ---- Sorteo exclusivo --------------------------------------------------------
export type RafflePhase = 'locked' | 'open' | 'drawn';
export type RaffleStatus = 'draft' | 'published' | 'archived';
export type TicketSource = 'panel' | 'code';
export type DrawMode = 'manual' | 'auto';

export interface RaffleFields {
  title: string; prize: string; prize_headline: string; prize_detail: string | null; prize_image_url: string | null;
  unlock_at: string; draw_at: string; draw_mode: DrawMode; max_per_customer: number; claim_days: number;
  /** Cómo se consigue un boleto (obligatorio para publicar). */
  how_to_get: string | null;
  /** Valor aproximado del premio en pesos (opcional). */
  prize_value: number | null;
  /** Bases del sorteo (formato: «## » títulos, «- » viñetas). */
  rules_text: string | null;
}
export interface RaffleInfo extends RaffleFields {
  id: string; phase: RafflePhase; total_tickets: number; published_at: string | null;
  winner: {
    number: number; name: string; mine: boolean; at: string;
    /** Fecha límite para reclamar el premio. */
    claim_until: string;
    /** Cuándo se entregó el premio (null si no se ha entregado). */
    claimed_at: string | null;
    /** Código para reclamar: solo lo recibe la persona ganadora y mientras no se entregue. */
    claim_code: string | null;
  } | null;
}
export interface MyRaffleTicket { number: number; source: TicketSource; created_at: string }
export interface RaffleState {
  server_time: string;
  raffle: RaffleInfo | null;
  me: { tickets: MyRaffleTicket[]; reminder: boolean } | null;
}
export interface AdminRaffle extends RaffleFields {
  id: string; status: RaffleStatus; phase: RafflePhase; created_at: string; updated_at: string; drawn_at: string | null; published_at: string | null;
  tickets: number; participants: number; codes_total: number; codes_free: number; reminders: number;
  winner: { number: number; name: string | null; email: string; user_id: string } | null;
  claim_until: string | null; claimed_at: string | null; claimed_by_name: string | null;
}
/** Premio de sorteo ganado, visto en «Mis premios». */
export interface MyRafflePrize {
  raffle_id: string; title: string; prize: string; prize_detail: string | null; prize_image_url: string | null;
  number: number; drawn_at: string; claim_until: string; claimed_at: string | null;
  status: 'pending' | 'claimed' | 'expired';
  /** Solo mientras se puede recoger. */
  claim_code: string | null;
}
/** Premio del sorteo visto desde «Canjes». */
export interface RaffleClaim {
  raffle_id: string; title: string; prize: string; prize_detail: string | null; prize_image_url: string | null; claim_code: string;
  number: number; name: string | null; email: string | null; drawn_at: string; claim_until: string;
  claimed_at: string | null; claimed_by_name: string | null; status: 'pending' | 'claimed' | 'expired' | 'void';
}
export interface RaffleParticipant {
  user_id: string; name: string | null; email: string; last_at: string;
  tickets: { id: string; number: number; source: TicketSource; reason: string | null; created_at: string; voided: boolean }[];
}
export interface RaffleDetail {
  participants: RaffleParticipant[];
  codes: { code: string; used_at: string | null; active: boolean; used_by: string | null }[];
  reminders: number;
}
export interface FoundCustomer { id: string; name: string | null; email: string; tickets: number }

export interface Campaign {
  id: string; name: string; status: CampaignStatus; timezone: string;
  starts_at: string | null; ends_at: string | null; require_participation_code: boolean;
  max_extra_spins_per_week: number; extra_spin_valid_days: number;
  depletion_policy: 'to_no_prize' | 'redistribute';
  budget_max: number | null; budget_committed: number;
  max_prizes_per_day: number | null; max_prizes_per_week: number | null; max_prizes_total: number | null;
}

export interface Prize {
  id?: string;
  name: string; description: string | null; image_url: string | null; kind: PrizeKind; value: number;
  sector_label: string; color: string; sort_order: number; probability: number;
  stock: number | null; est_cost: number; conditions: string | null; coupon_valid_days: number;
  daily_limit: number | null; weekly_limit: number | null; total_limit: number | null;
  is_active: boolean; archived_at?: string | null; archived?: boolean;
}

export interface AdminConfig {
  campaign: Campaign;
  prizes: Prize[];
  site: { draft: SiteConfig; published: SiteConfig; published_at: string | null; updated_at: string };
  errors: string[];
}

export interface Dashboard {
  campaign: null | { id: string; name: string; status: CampaignStatus; budget_max: number | null; budget_committed: number };
  unique_participants: number; base_spins: number; extra_spins: number;
  prizes_awarded: number; prizes_redeemed: number; prizes_pending: number; prizes_expired: number; prizes_void: number;
  cost_awarded: number; cost_redeemed: number;
  distribution: { prize_id: string; name: string; kind: PrizeKind; count: number; pct: number }[];
  stock: { prize_id: string; name: string; kind: PrizeKind; stock: number | null; is_active: boolean; probability: number }[];
  weekly: { week_start: string; base: number; extra: number; participants: number }[];
}

export interface SimulationResult {
  ok: true; test: true;
  prize: SpinPayload['prize'];
  effective: { prize_id: string; name: string; configured: number; available: boolean; effective: number }[];
}

export interface AdminUser {
  id: string; email: string; name: string | null; role: Role; is_blocked: boolean; blocked_reason: string | null;
  created_at: string; spins: number; last_spin_at: string | null; extras_available: number;
}

export interface ExtraSpinRow {
  id: string; origin: string; status: string; user_name: string; user_email: string; reason: string | null;
  granted_by_name: string | null; created_at: string; expires_at: string; used_at: string | null; revoke_reason: string | null;
}

export interface CodeRow {
  id: string; kind: 'extra_spin' | 'participation'; code: string; note: string | null; active: boolean;
  expires_at: string | null; created_at: string; used_at: string | null; used_by_name: string | null;
}

export interface AuditRow {
  id: number; at: string; actor_id: string | null; actor_email: string | null; action: string;
  entity: string; entity_id: string | null; details: Record<string, unknown>;
}

export interface AdminSpinRow {
  id: string; created_at: string; origin: 'base' | 'extra'; week_start: string;
  prize_name: string; prize_kind: PrizeKind; user_name: string; user_email: string;
}
