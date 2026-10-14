import { Link } from 'react-router-dom';
import type { SpinPayload } from '../lib/types';
import { useApp } from '../context/AppContext';
import { env } from '../lib/env';
import { fmtDay, groupCode, isCouponKind, safeUrl, valueLabel } from '../lib/format';
import { contrastInk } from '../lib/wheel';
import { CopyButton, Modal, QrImage } from './ui';
import { IconGift, IconSpark } from './icons';

/** QR: solo contiene una dirección con el código. Abrirlo NO canjea el premio. */
export const couponQrValue = (code: string) => `${env.siteUrl}/admin/canjes?codigo=${code}`;

export function ResultModal({ result, onClose, onSpinAgain }: { result: SpinPayload | null; onClose: () => void; onSpinAgain: () => void }) {
  const { config, pub } = useApp();
  if (!result) return null;
  const { prize, coupon } = result;
  const tz = pub?.campaign?.timezone;
  const img = safeUrl(prize.image_url);
  const win = isCouponKind(prize.kind);
  const extra = prize.kind === 'extra_spin';
  const title = win ? config.copy.celebration_message : extra ? config.copy.extra_spin_message : config.copy.no_prize_message;
  const val = valueLabel(prize.kind, prize.value, prize.name);

  return (
    <Modal open onClose={onClose} labelledBy="result-title" wide={win}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative">
          {img ? (
            <img src={img} alt="" width={112} height={112} className="h-28 w-28 rounded-2xl border border-[color:var(--line)] bg-white object-cover shadow-[0_10px_20px_-10px_rgb(58_22_6/.5)]" />
          ) : (
            <span className="inline-flex h-24 w-24 items-center justify-center rounded-full border border-black/10 shadow-[0_10px_20px_-10px_rgb(58_22_6/.5)]" style={{ background: prize.color, color: contrastInk(prize.color, 3.2) }} aria-hidden="true">
              {win ? <IconGift width={44} height={44} /> : <IconSpark width={44} height={44} />}
            </span>
          )}
        </div>
        <h2 id="result-title" className={`font-display font-extrabold leading-tight ${win ? 'text-[1.6rem]' : 'text-[1.3rem]'}`}>{title}</h2>
        <p className="font-display text-xl font-bold text-[color:var(--c-primary)]">{prize.name}{val ? ` · ${val}` : ''}</p>
        {prize.description && <p className="max-w-sm text-sm text-dim">{prize.description}</p>}

        {win && coupon && (
          <>
            <div className="ticket-cut w-full pt-4">
              <div className="rounded-xl border border-[color:var(--line)] bg-surface-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dim">Tu código de canje</p>
                <p className="my-1.5 select-all font-mono text-[1.65rem] font-bold tracking-[0.12em] text-ink" aria-label={`Código ${coupon.code.split('').join(' ')}`}>{groupCode(coupon.code)}</p>
                <CopyButton text={coupon.code} label="Copiar código" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-2xl border border-[color:var(--line)] bg-white p-2.5"><QrImage value={couponQrValue(coupon.code)} size={168} /></div>
              <p className="text-xs text-dim">Muestra el código o el QR en la tienda.</p>
            </div>
            <ul className="w-full space-y-1 rounded-xl bg-surface-2 p-3 text-left text-sm">
              <li><strong>Válido hasta:</strong> {fmtDay(coupon.expires_at, tz)}</li>
              {prize.conditions && <li><strong>Condiciones:</strong> {prize.conditions}</li>}
              <li className="text-dim">Se canjea una sola vez. Lo encuentras siempre en «Mis premios».</li>
            </ul>
          </>
        )}

        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {win && <Link to="/premios" onClick={onClose} className="btn btn-primary">Ver en Mis premios</Link>}
          {extra && result.extras_available > 0 && (
            <button className="btn btn-primary" onClick={() => { onClose(); onSpinAgain(); }}>Girar de nuevo</button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}
