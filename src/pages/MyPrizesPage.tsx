import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getMyCoupons, ApiError } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/Toast';
import type { MyCoupon } from '../lib/types';
import { fmtDay, fmtShort, groupCode, safeUrl, valueLabel } from '../lib/format';
import { Alert, CopyButton, Empty, PageLoader, QrImage, SimpleText, StatusBadge } from '../components/ui';
import { PageTitle } from '../components/Layout';
import { couponQrValue } from '../components/ResultModal';
import { LoginGate } from './LoginGate';
import { IconGift } from '../components/icons';

const EMAIL_ENABLED = import.meta.env.VITE_ENABLE_EMAIL === '1';

function EmailButton({ id }: { id: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke('send-coupon-email', { body: { coupon_id: id } });
    setBusy(false);
    if (error) toast('No se pudo enviar el correo. Inténtalo más tarde.', 'error');
    else toast('Te enviamos el código a tu correo.', 'ok');
  };
  return <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send()}>{busy ? 'Enviando…' : 'Enviar a mi correo'}</button>;
}

function CouponCard({ c, open, onToggle, tz }: { c: MyCoupon; open: boolean; onToggle: () => void; tz?: string }) {
  const img = safeUrl(c.prize_image_url);
  const val = valueLabel(c.prize_kind, c.prize_value, c.prize_name);
  const live = c.effective_status === 'pending';
  return (
    <li className={`card overflow-hidden ${live ? '' : 'opacity-85'}`}>
      <div className="flex gap-4 p-4">
        {img
          ? <img src={img} alt="" loading="lazy" width={72} height={72} className="h-[72px] w-[72px] shrink-0 rounded-xl bg-white object-cover" />
          : <span className="inline-flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink" aria-hidden="true"><IconGift width={30} height={30} /></span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold leading-tight">{c.prize_name}</h2>
            <StatusBadge status={c.effective_status} />
          </div>
          {val && <p className="text-sm font-bold text-[color:var(--c-primary)]">{val}</p>}
          {c.prize_description && <p className="mt-0.5 text-sm text-dim">{c.prize_description}</p>}
          <p className="mt-1 text-xs text-dim">
            {c.effective_status === 'redeemed' ? `Canjeado el ${fmtShort(c.redeemed_at, tz)}`
              : c.effective_status === 'void' ? `Anulado${c.void_reason ? `: ${c.void_reason}` : ''}`
              : c.effective_status === 'expired' ? `Venció el ${fmtDay(c.expires_at, tz)}`
              : `Válido hasta el ${fmtDay(c.expires_at, tz)}`}
          </p>
        </div>
      </div>
      {c.prize_conditions && <p className="border-t border-line bg-surface-2 px-4 py-2 text-sm"><strong>Condiciones:</strong> {c.prize_conditions}</p>}
      <div className="border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-dim">Código</p>
            <p className="select-all font-mono text-xl font-bold tracking-widest">{groupCode(c.code)}</p>
          </div>
          <div className="flex gap-2">
            <CopyButton text={c.code} />
            {EMAIL_ENABLED && live && <EmailButton id={c.id} />}
            <button className="btn btn-ghost btn-sm" aria-expanded={open} onClick={onToggle}>{open ? 'Ocultar QR' : 'Mostrar QR'}</button>
          </div>
        </div>
        {open && (
          <div className="mt-3 flex flex-col items-center gap-1">
            <QrImage value={couponQrValue(c.code)} size={200} />
            <p className="text-xs text-dim">El personal lo escanea para localizar tu premio. Escanearlo no lo canjea.</p>
          </div>
        )}
      </div>
    </li>
  );
}

export default function MyPrizesPage() {
  const { session, authReady, pub, config } = useApp();
  const [rows, setRows] = useState<MyCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const tz = pub?.campaign?.timezone;

  const load = useCallback(async () => {
    try {
      const r = await getMyCoupons();
      setRows(r); setError(null);
      setOpenId((cur) => cur ?? r.find((x) => x.effective_status === 'pending')?.id ?? null);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
  }, []);

  useEffect(() => { if (session) void load(); }, [session, load]);

  if (!authReady) return <PageLoader />;
  if (!session) return <LoginGate title="Mis premios" text="Inicia sesión para ver tus premios, códigos y QR." />;

  const pending = rows?.filter((r) => r.effective_status === 'pending') ?? [];
  const past = rows?.filter((r) => r.effective_status !== 'pending') ?? [];
  return (
    <>
      <PageTitle sub="Aquí quedan guardados tus códigos y QR. Puedes consultarlos cuando quieras.">Mis premios</PageTitle>
      {error && <Alert kind="error" className="mb-4">{error} <button className="underline" onClick={() => void load()}>Reintentar</button></Alert>}
      {!rows && !error && <PageLoader />}
      {rows && rows.length === 0 && <Empty title="Aún no tienes premios">Cuando ganes un premio canjeable aparecerá aquí con su código y QR.</Empty>}
      {pending.length > 0 && (
        <>
          <h2 className="font-display mb-3 text-xl font-semibold">Por canjear ({pending.length})</h2>
          <ul className="space-y-4">{pending.map((c) => <CouponCard key={c.id} c={c} tz={tz} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />)}</ul>
        </>
      )}
      {past.length > 0 && (
        <>
          <h2 className="font-display mb-3 mt-8 text-xl font-semibold">Historial de premios</h2>
          <ul className="space-y-4">{past.map((c) => <CouponCard key={c.id} c={c} tz={tz} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />)}</ul>
        </>
      )}
      {config.redeem_text && (
        <section className="card mt-8 p-5">
          <h2 className="font-display text-lg font-semibold">Cómo canjear en la tienda</h2>
          <SimpleText text={config.redeem_text} className="text-sm" />
        </section>
      )}
    </>
  );
}
