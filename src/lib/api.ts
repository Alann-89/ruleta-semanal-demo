import { supabase } from './supabase';
import type {
  AdminConfig, AdminSpinRow, AdminUser, AuditRow, CodeRow, Dashboard, ExtraSpinRow, HistoryRow, MyCoupon,
  MyStatus, Paged, PublicState, SimulationResult, SiteConfig, SpinPayload, StaffCoupon, Prize, Role,
  AdminRaffle, FoundCustomer, MyRafflePrize, RaffleClaim, RaffleDetail, RaffleFields, RaffleState, RaffleStatus,
} from './types';

/** Error normalizado de la API (red, permisos, validación o error de negocio). */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly kind: 'network' | 'forbidden' | 'validation' | 'business' | 'unknown',
    public readonly validation: string[] = [],
  ) {
    super(message);
  }
}

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null };

function toApiError(e: PgError): ApiError {
  if (e.message === 'validation_failed') {
    let list: string[] = [];
    try { list = JSON.parse(e.details ?? '[]'); } catch { /* sin detalle */ }
    return new ApiError(list.join(' ') || 'La configuración no es válida.', 'validation_failed', 'validation', list);
  }
  if (e.code === '42501' || /permission denied|forbidden|JWT/i.test(e.message)) {
    return new ApiError('No tienes permiso para esta acción.', 'forbidden', 'forbidden');
  }
  if (/fetch|network|Failed to|Load failed|timeout/i.test(e.message) || e.code === '') {
    return new ApiError('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', 'network', 'network');
  }
  if (e.code === 'PGRST301' || e.code === 'PGRST303') {
    return new ApiError('Tu sesión expiró. Vuelve a iniciar sesión.', 'session', 'forbidden');
  }
  return new ApiError(e.message || 'Error inesperado.', e.code ?? 'unknown', 'unknown');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new ApiError('La aplicación no está configurada.', 'not_configured', 'unknown');
  try {
    const { data, error } = await supabase.rpc(fn, args ?? {});
    if (error) throw toApiError(error);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', 'network', 'network');
  }
}

/** Respuesta de negocio: { ok: false, error } no es una excepción. */
export interface Fail { ok: false; error: string; [k: string]: unknown }
export type Result<T> = (T & { ok: true }) | Fail;

// ---- Cliente --------------------------------------------------------------
export const getPublicState = () => rpc<PublicState>('get_public_state');
export const getMyStatus = () => rpc<MyStatus | Fail>('get_my_status');
export const spin = (requestId: string, code?: string | null) =>
  rpc<SpinPayload | Fail>('spin', { p_request_id: requestId, p_participation_code: code ?? null });
export const getSpinResult = (requestId: string) =>
  rpc<(SpinPayload & { found: true }) | { ok: true; found: false } | Fail>('get_spin_result', { p_request_id: requestId });
export const ackSpin = (spinId: string) => rpc<void>('ack_spin', { p_spin_id: spinId });
export const redeemPromoCode = (code: string) => rpc<{ ok: true } | Fail>('redeem_promo_code', { p_code: code });
export const getMyCoupons = () => rpc<MyCoupon[]>('get_my_coupons');
export const getMyHistory = (limit = 20, offset = 0) => rpc<Paged<HistoryRow>>('get_my_history', { p_limit: limit, p_offset: offset });

// ---- Personal -------------------------------------------------------------
export const staffLookup = (code: string) => rpc<{ ok: true; coupon: StaffCoupon } | Fail>('staff_lookup_coupon', { p_code: code });
export const staffRedeem = (id: string) => rpc<{ ok: true; coupon: StaffCoupon } | Fail>('staff_redeem_coupon', { p_coupon_id: id });

export interface CouponFilters {
  status?: string | null; search?: string | null; prizeId?: string | null;
  from?: string | null; to?: string | null; week?: string | null; limit?: number; offset?: number;
}
export const staffListCoupons = (f: CouponFilters = {}) =>
  rpc<Paged<StaffCoupon>>('staff_list_coupons', {
    p_status: f.status || null, p_search: f.search || null, p_prize_id: f.prizeId || null,
    p_from: f.from || null, p_to: f.to || null, p_week: f.week || null,
    p_limit: f.limit ?? 25, p_offset: f.offset ?? 0,
  });

// ---- Administración -------------------------------------------------------
export const adminGetConfig = () => rpc<AdminConfig>('admin_get_config');
export const adminDashboard = (from?: string | null, to?: string | null) =>
  rpc<Dashboard>('admin_dashboard', { p_from: from ?? null, p_to: to ?? null });
export const adminUpdateCampaign = (id: string, patch: Record<string, unknown>) =>
  rpc<{ ok: true }>('admin_update_campaign', { p_campaign_id: id, p: patch });
export const adminSaveOutcomes = (campaignId: string, items: Prize[]) =>
  rpc<{ ok: true; prizes: Prize[] }>('admin_save_outcomes', { p_campaign_id: campaignId, p_items: items });
export const adminSimulate = () => rpc<SimulationResult | Fail>('admin_simulate_spin', {});
export const adminVoidCoupon = (id: string, reason: string, restock: boolean) =>
  rpc<{ ok: true } | Fail>('admin_void_coupon', { p_coupon_id: id, p_reason: reason, p_restock: restock });
export const adminGrantExtra = (userId: string, reason: string, days?: number | null) =>
  rpc<{ ok: true } | Fail>('admin_grant_extra_spin', { p_user_id: userId, p_reason: reason, p_valid_days: days ?? null });
export const adminRevokeExtra = (id: string, reason: string) =>
  rpc<{ ok: true } | Fail>('admin_revoke_extra_spin', { p_id: id, p_reason: reason });
export const adminListExtras = (status: string | null, limit: number, offset: number) =>
  rpc<Paged<ExtraSpinRow>>('admin_list_extra_spins', { p_status: status, p_limit: limit, p_offset: offset });
export const adminCreateCodes = (kind: 'extra_spin' | 'participation', count: number, expiresAt: string | null, note: string | null) =>
  rpc<{ ok: true; codes: string[] } | Fail>('admin_create_codes', { p_kind: kind, p_count: count, p_expires_at: expiresAt, p_note: note });
export const adminListCodes = (kind: string | null, limit: number, offset: number) =>
  rpc<Paged<CodeRow>>('admin_list_codes', { p_kind: kind, p_limit: limit, p_offset: offset });
export const adminDeactivateCode = (id: string) => rpc<{ ok: true } | Fail>('admin_deactivate_code', { p_id: id });
export const adminListUsers = (search: string | null, role: string | null, limit: number, offset: number) =>
  rpc<Paged<AdminUser>>('admin_list_users', { p_search: search, p_role: role, p_limit: limit, p_offset: offset });
export const adminSetRole = (userId: string, role: Role) => rpc<{ ok: true } | Fail>('admin_set_role', { p_user_id: userId, p_role: role });
export const adminSetBlocked = (userId: string, blocked: boolean, reason: string | null) =>
  rpc<{ ok: true } | Fail>('admin_set_blocked', { p_user_id: userId, p_blocked: blocked, p_reason: reason });
export const adminAnonymize = (userId: string) => rpc<{ ok: true } | Fail>('admin_anonymize_user', { p_user_id: userId });
export const adminListSpins = (origin: string | null, search: string | null, week: string | null, limit: number, offset: number) =>
  rpc<Paged<AdminSpinRow>>('admin_list_spins', { p_origin: origin, p_search: search, p_week: week, p_limit: limit, p_offset: offset });
export const adminListAudit = (action: string | null, limit: number, offset: number) =>
  rpc<Paged<AuditRow>>('admin_list_audit', { p_action: action, p_limit: limit, p_offset: offset });
export const adminSaveDraft = (draft: SiteConfig) => rpc<{ ok: true; errors: string[] } | Fail>('admin_save_draft', { p_draft: draft });
export const adminPublishConfig = () => rpc<{ ok: true }>('admin_publish_config');
export const adminDiscardDraft = () => rpc<{ ok: true }>('admin_discard_draft');

// ---- Sorteo exclusivo -------------------------------------------------------
export const getRaffleState = () => rpc<RaffleState>('get_raffle_state');
export const redeemRaffleCode = (code: string) => rpc<{ ok: true; number: number } | Fail>('redeem_raffle_code', { p_code: code });
export const toggleRaffleReminder = () => rpc<{ ok: true; reminder: boolean } | Fail>('toggle_raffle_reminder');
export const staffFindCustomer = (query: string) => rpc<FoundCustomer[]>('staff_find_customer', { p_query: query });
export const staffGrantRaffleTickets = (userId: string, qty: number, reason: string) =>
  rpc<{ ok: true; numbers: number[]; have: number } | Fail>('staff_grant_raffle_tickets', { p_user_id: userId, p_qty: qty, p_reason: reason });
export const adminListRaffles = () => rpc<AdminRaffle[]>('admin_list_raffles');
export const adminRaffleDetail = (id: string) => rpc<({ ok: true } & RaffleDetail) | Fail>('admin_raffle_detail', { p_raffle_id: id });
export const adminSaveRaffle = (id: string | null, fields: RaffleFields) => rpc<{ ok: true; id: string } | Fail>('admin_save_raffle', { p_raffle_id: id, p: fields });
export const adminSetRaffleStatus = (id: string, status: RaffleStatus) => rpc<{ ok: true } | Fail>('admin_set_raffle_status', { p_raffle_id: id, p_status: status });
export const adminCreateRaffleCodes = (id: string, count: number) => rpc<{ ok: true; codes: string[] } | Fail>('admin_create_raffle_codes', { p_raffle_id: id, p_count: count });
export const adminDrawRaffle = (id: string) => rpc<{ ok: true; number: number; total: number; name: string } | Fail>('admin_draw_raffle', { p_raffle_id: id });
export const adminVoidRaffleTicket = (ticketId: string, reason: string) => rpc<{ ok: true } | Fail>('admin_void_raffle_ticket', { p_ticket_id: ticketId, p_reason: reason });
export const getMyRafflePrizes = () => rpc<MyRafflePrize[]>('get_my_raffle_prizes');
export const staffLookupRaffleClaim = (code: string) => rpc<{ ok: true; claim: RaffleClaim } | Fail>('staff_lookup_raffle_claim', { p_code: code });
export const staffClaimRafflePrize = (raffleId: string) => rpc<{ ok: true; claim: RaffleClaim } | Fail>('staff_claim_raffle_prize', { p_raffle_id: raffleId });
/** Código normalizado: los premios del sorteo tienen 11 caracteres; los cupones de la ruleta, 12. */
export const isRaffleClaimCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '').length === 11;

/** Mensajes en español para los códigos de error de negocio. */
export const ERROR_TEXT: Record<string, string> = {
  not_authenticated: 'Inicia sesión para continuar.',
  account_blocked: 'Tu cuenta no puede participar. Contacta a la tienda.',
  rate_limited: 'Demasiados intentos. Espera un momento y vuelve a intentar.',
  too_many_attempts: 'Demasiados intentos fallidos. Espera unos minutos.',
  no_campaign: 'La promoción aún no está disponible.',
  campaign_inactive: 'La promoción no está activa en este momento.',
  no_spin_available: 'Ya usaste tu giro de esta semana.',
  code_required: 'Esta promoción pide un código de participación de la tienda.',
  invalid_code: 'Código inválido, usado o vencido.',
  nothing_available: 'Por ahora no hay resultados disponibles. Intenta más tarde.',
  not_found: 'No encontramos ese código.',
  already_redeemed: 'Este premio ya fue canjeado.',
  void: 'Este premio fue anulado.',
  expired: 'Este premio venció.',
  reason_required: 'Escribe un motivo (mínimo 5 caracteres).',
  last_admin: 'Debe quedar al menos un administrador.',
  not_voidable: 'Este cupón ya no se puede anular.',
  user_not_found: 'Usuario no encontrado.',
  not_allowed: 'Acción no permitida para este usuario.',
  cannot_block_self: 'No puedes bloquearte a ti mismo.',
  no_raffle: 'No hay un sorteo activo.',
  raffle_not_open: 'El sorteo aún no se abre.',
  raffle_closed: 'El sorteo ya terminó.',
  raffle_open: 'El sorteo ya está abierto.',
  raffle_drawn: 'Este sorteo ya se realizó.',
  raffle_not_published: 'Publica el sorteo primero.',
  max_tickets: 'Ya se alcanzó el máximo de boletos por cliente.',
  reason_short: 'Escribe un motivo (mínimo 3 caracteres).',
  invalid_quantity: 'Cantidad no válida.',
  another_published: 'Ya hay otro sorteo publicado. Archívalo o pásalo a borrador primero.',
  no_tickets: 'Todavía no hay boletos en juego.',
  auto_mode: 'Este sorteo es automático: se realizará solo a la hora fijada.',
  already_voided: 'Ese boleto ya estaba anulado.',
  invalid_status: 'Estado no válido.',
  already_claimed: 'Este premio del sorteo ya fue entregado.',
  claim_expired: 'Venció el plazo para reclamar este premio.',
};
export const errText = (code: string) => ERROR_TEXT[code] ?? 'No se pudo completar la acción.';
