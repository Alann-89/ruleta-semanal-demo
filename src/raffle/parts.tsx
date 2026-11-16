import { useEffect, useState } from 'react';
import { DEFAULT_TZ, safeUrl } from '../lib/format';
import type { TicketSource } from '../lib/types';
import { IconGift } from '../components/icons';
import './raffle.css';

export const ticketLabel = (n: number) => `N.º ${String(n).padStart(4, '0')}`;

/** Reloj compartido: vuelve a pintar cada segundo (o cada `ms`). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { timeZone: DEFAULT_TZ, ...opts });
const longFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const dayFmt = fmt({ day: 'numeric', month: 'short' });
const timeFmt = fmt({ hour: 'numeric', minute: '2-digit' });
export const fmtLong = (ms: number) => longFmt.format(ms);
export const fmtDayShort = (ms: number) => dayFmt.format(ms).replace('.', '');
export const fmtTime = (ms: number) => timeFmt.format(ms);

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/**
 * Cuenta regresiva real hacia `target` (la fecha que fija la tienda).
 * Los números usan cifras tabulares para que no «bailen» al cambiar.
 */
export function Countdown({ target, now, size = 'md', label }: { target: number; now: number; size?: 'md' | 'lg'; label: string }) {
  const p = parts(target - now);
  const units: Array<[number, string, string]> = [[p.d, 'días', 'día'], [p.h, 'horas', 'hora'], [p.m, 'min', 'min'], [p.s, 'seg', 'seg']];
  const spoken = `${p.d} días, ${p.h} horas y ${p.m} minutos`;
  return (
    <div className={`countdown countdown-${size}`} role="timer" aria-label={`${label}: ${spoken}`}>
      {units.map(([v, many, one], i) => (
        <div key={many} className="countdown-unit" aria-hidden="true">
          <span className="countdown-num">{String(v).padStart(2, '0')}</span>
          <span className="countdown-lbl">{v === 1 && i < 2 ? one : many}</span>
        </div>
      ))}
    </div>
  );
}

export const SOURCE_LABEL: Record<TicketSource, string> = { panel: 'Asignado en tienda', code: 'Código de compra' };

/** Boleto individual del cliente: número grande y talón perforado. */
export function TicketStub({ n, source, winner = false }: { n: number; source?: TicketSource; winner?: boolean }) {
  return (
    <li className={`stub ${winner ? 'stub-win' : ''}`}>
      <span className="stub-paper">
        <span className="stub-body">
          <span className="stub-num">{ticketLabel(n)}</span>
          <span className="stub-src">{winner ? 'Boleto ganador' : source ? SOURCE_LABEL[source] : 'Boleto'}</span>
        </span>
        <span className="stub-tail" aria-hidden="true" />
      </span>
    </li>
  );
}

/** Foto del premio que sube la tienda; sin foto, un regalo dibujado. */
export function PrizeImage({ url, alt, className = '' }: { url: string | null; alt: string; className?: string }) {
  const src = safeUrl(url);
  if (src) return <img src={src} alt={alt} className={`prize-img ${className}`} loading="lazy" />;
  return (
    <span className={`prize-img prize-img-fallback ${className}`} role="img" aria-label={alt}>
      <IconGift width="60%" height="60%" strokeWidth={1.6} />
    </span>
  );
}

/** Confeti al ganar (respeta «reducir movimiento»). */
export async function celebrateWin(colors: string[]) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const confetti = (await import('canvas-confetti')).default;
  const base = { colors, disableForReducedMotion: true, ticks: 240, gravity: 0.85 };
  void confetti({ ...base, particleCount: 160, spread: 90, startVelocity: 46, origin: { x: 0.5, y: 0.45 } });
  setTimeout(() => void confetti({ ...base, particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 250);
  setTimeout(() => void confetti({ ...base, particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 250);
}
