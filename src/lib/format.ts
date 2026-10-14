import type { CouponStatus, PrizeKind } from './types';

export const DEFAULT_TZ = 'America/Mexico_City';

export function fmtDateTime(iso: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: tz,
  }).format(new Date(iso));
}

export function fmtShort(iso: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz,
  }).format(new Date(iso));
}

export function fmtDay(iso: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(new Date(iso));
}

/** `2026-10-05` (fecha civil) -> "5 oct 2026" sin conversiones de zona. */
export function fmtWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const fmtMoney = (n: number | string | null | undefined) => money.format(Number(n ?? 0));
export const fmtPct = (n: number, digits = 1) => `${Number(n).toLocaleString('es-MX', { maximumFractionDigits: digits })} %`;

/** Tiempo restante aproximado hasta `iso`, usando la hora del SERVIDOR como referencia. */
export function relativeTo(iso: string, serverNowMs: number): string {
  const ms = new Date(iso).getTime() - serverNowMs;
  if (ms <= 0) return 'ahora';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `en ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `en ${hours} h ${mins % 60} min`;
  return `en ${Math.round(hours / 24)} días`;
}

/** Iniciales de la marca: «Luky Home» -> «LH» (primera letra de las dos primeras palabras). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '★';
  const a = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return a.toUpperCase();
}

export const groupCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

export const KIND_LABEL: Record<PrizeKind, string> = {
  product: 'Producto',
  percent_discount: 'Descuento %',
  fixed_discount: 'Descuento $',
  conditional_promo: 'Promoción con condiciones',
  extra_spin: 'Giro extra',
  no_prize: 'Sin premio',
};

export const STATUS_LABEL: Record<CouponStatus, string> = {
  pending: 'Pendiente', redeemed: 'Canjeado', expired: 'Vencido', void: 'Anulado',
};

export function valueLabel(kind: PrizeKind, value: number, name?: string): string | null {
  const v = Number(value);
  // Si el nombre del premio ya dice el valor («20 % de descuento»), no se repite.
  if (name && v > 0 && new RegExp(`(^|[^0-9])${v}([^0-9]|$)`).test(name)) return null;
  if (kind === 'percent_discount' && v > 0) return `${v} % de descuento`;
  if (kind === 'fixed_discount' && v > 0) return `${fmtMoney(v)} de descuento`;
  return null;
}

export const isCouponKind = (k: PrizeKind) => k !== 'no_prize' && k !== 'extra_spin';

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    // Evita inyección de fórmulas al abrir el CSV en Excel/Sheets.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Solo permite URLs https sin caracteres que rompan CSS/HTML. */
export function safeUrl(u: string | null | undefined): string | null {
  return u && /^https?:\/\/[^\s"'()<>]+$/.test(u) ? u : null;
}

/** Medianoche de una fecha civil (YYYY-MM-DD) en la zona dada, como ISO UTC. */
export function zonedMidnightIso(dateStr: string, tz: string): string {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const wall = (z: string) => Date.parse(guess.toLocaleString('en-US', { timeZone: z }));
  return new Date(guess.getTime() + (wall('UTC') - wall(tz))).toISOString();
}

/** Lunes (YYYY-MM-DD) de la semana que contiene la fecha civil dada. */
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DDTHH:mm' (hora de pared en `tz`) -> ISO UTC. */
export function zonedLocalToIso(local: string, tz: string): string {
  const guess = new Date(`${local}:00Z`);
  const wall = (z: string) => Date.parse(guess.toLocaleString('en-US', { timeZone: z }));
  return new Date(guess.getTime() + (wall('UTC') - wall(tz))).toISOString();
}

/** ISO -> 'YYYY-MM-DDTHH:mm' en `tz` (para <input type="datetime-local">). */
export function isoToZonedLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso)).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
