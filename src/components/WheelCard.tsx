import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useApp } from '../context/AppContext';
import { ackSpin, errText, getSpinResult, redeemPromoCode, spin as spinApi, ApiError } from '../lib/api';
import type { Sector, SpinPayload } from '../lib/types';
import { fmtDateTime, relativeTo, uuid } from '../lib/format';
import { sfx, unlockAudio } from '../lib/sound';
import { Wheel, type WheelHandle } from './Wheel';
import { SeasonDecor, seasonVars } from './SeasonDecor';
import { seasonSectors } from '../lib/seasons';
import { ResultModal } from './ResultModal';
import { Alert, Field } from './ui';
import { IconGoogle } from './icons';
import { useToast } from '../context/Toast';

const PENDING_KEY = 'ruleta.pendingSpin';
const readPending = () => { try { return localStorage.getItem(PENDING_KEY); } catch { return null; } };
const writePending = (v: string) => { try { localStorage.setItem(PENDING_KEY, v); } catch { /* sin almacenamiento */ } };
const clearPending = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* sin almacenamiento */ } };

const prefersReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Garantiza que el premio recibido tenga sector (por si se agotó/archivó mientras tanto). */
function withPrize(list: Sector[], p: SpinPayload['prize']): Sector[] {
  if (list.some((s) => s.id === p.id)) return list;
  return [...list, { id: p.id, name: p.name, label: p.label, color: p.color, image_url: p.image_url, kind: p.kind }];
}

async function celebrate(kind: SpinPayload['prize']['kind'], colors: string[]) {
  if (kind === 'no_prize') { sfx.lose(); return; }
  if (kind === 'extra_spin') sfx.extra(); else sfx.win();
  if (prefersReduced()) return;
  const confetti = (await import('canvas-confetti')).default;
  const base = { colors, disableForReducedMotion: true, ticks: 220, gravity: 0.9 };
  const big = kind !== 'extra_spin';
  void confetti({ ...base, particleCount: big ? 150 : 60, spread: 85, startVelocity: 48, origin: { x: 0.5, y: 0.55 } });
  if (big) {
    setTimeout(() => void confetti({ ...base, particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 220);
    setTimeout(() => void confetti({ ...base, particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 220);
  }
}

const REASONS: Record<string, string> = {
  campaign_draft: 'La promoción todavía no ha comenzado. ¡Vuelve pronto!',
  campaign_paused: 'La promoción está en pausa por ahora. Tu historial y premios se conservan.',
  campaign_closed: 'La promoción terminó. Gracias por participar.',
  campaign_not_started: 'La promoción todavía no ha comenzado.',
  campaign_ended: 'La promoción terminó. Gracias por participar.',
  account_blocked: 'Tu cuenta no puede participar. Si crees que es un error, habla con la tienda.',
  no_campaign: 'La promoción aún no está disponible.',
};

/** Hero (titular + ruleta) y lámina blanca con el botón, el estado y el resto de la página (children). */
export function WheelCard({ title, children }: { title: string; children?: ReactNode }) {
  const { config, season, seasonFx, pub, pubLoading, me, session, authReady, clockOffset, signInWithGoogle, refreshMe, refreshPublic } = useApp();
  const toast = useToast();
  const wheel = useRef<WheelHandle>(null);
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'spinning'>('idle');
  const [frozen, setFrozen] = useState<Sector[] | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [result, setResult] = useState<SpinPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [promo, setPromo] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const playedRef = useRef<string | null>(null);
  const busy = useRef(false);

  const outcomes = pub?.outcomes ?? [];
  const sectors = frozen ?? outcomes;
  const placeholder = sectors.length < 2;
  const wheelSectors = useMemo(() => seasonSectors(sectors, season, seasonFx.wheel), [sectors, season, seasonFx.wheel]);
  const tz = pub?.campaign?.timezone;

  const play = useCallback(async (res: SpinPayload) => {
    if (playedRef.current === res.spin.id) return;
    playedRef.current = res.spin.id;
    const list = withPrize(outcomes, res.prize);
    flushSync(() => { setFrozen(list); setHighlight(null); setPhase('spinning'); });
    const idx = list.findIndex((s) => s.id === res.prize.id);
    const reduced = prefersReduced();
    const motion = Math.max(0, Math.min(100, config.theme.motion)) / 100;
    try {
      await wheel.current?.spinTo(idx, {
        reduced,
        durationMs: 4300 + motion * 2600,
        turns: 5 + Math.floor(motion * 2.99),
        offset: (Math.random() * 2 - 1) * 0.34,
        onTick: sfx.tick,
      });
    } finally {
      setHighlight(idx);
      void celebrate(res.prize.kind, [config.theme.primary, config.theme.accent, '#ffffff', config.theme.secondary, '#ff9a62']);
      setResult(res);
      setPhase('idle');
      busy.current = false;
      void ackSpin(res.spin.id).catch(() => { /* se reintentará al volver */ });
      void refreshMe();
      void refreshPublic();
      setTimeout(() => setFrozen(null), 50);
    }
  }, [outcomes, config.theme, refreshMe, refreshPublic]);

  const onSpin = useCallback(async () => {
    if (busy.current || !me?.can_spin) return;
    busy.current = true;
    unlockAudio(); sfx.click();
    setError(null); setHighlight(null);
    const reqId = readPending() ?? uuid();
    writePending(reqId);
    setPhase('requesting');
    try {
      const res = await spinApi(reqId, me.require_participation_code ? code : null);
      if (!res.ok) {
        clearPending();
        setError(errText(res.error));
        setPhase('idle'); busy.current = false;
        void refreshMe(); void refreshPublic();
        return;
      }
      clearPending();
      setCode('');
      await play(res);
    } catch (e) {
      // Sin respuesta: el giro pudo registrarse. Se conserva el identificador para recuperarlo.
      setError(e instanceof ApiError && e.kind === 'network'
        ? 'Se perdió la conexión. Tu giro no se pierde: vuelve a pulsar el botón y recuperaremos el resultado.'
        : 'No pudimos completar el giro. Inténtalo de nuevo.');
      setPhase('idle'); busy.current = false;
    }
  }, [me, code, play, refreshMe, refreshPublic]);

  // Recuperar resultados: solicitud pendiente (conexión perdida) o resultado no visto (pestaña cerrada).
  useEffect(() => {
    if (!me || !pub || phase !== 'idle' || busy.current) return;
    const pending = readPending();
    let alive = true;
    void (async () => {
      await null; // fuera de la fase de efectos (flushSync dentro de play)
      if (pending) {
        try {
          const r = await getSpinResult(pending);
          if (!alive) return;
          if (r.ok && 'found' in r && r.found) { clearPending(); busy.current = true; await play(r as SpinPayload); return; }
          if (r.ok) clearPending();
        } catch { return; }
      }
      if (me.unseen_spin && alive) { busy.current = true; await play(me.unseen_spin); }
    })();
    return () => { alive = false; };
  }, [me, pub]); // eslint-disable-line react-hooks/exhaustive-deps

  const redeemPromo = async () => {
    if (!promo.trim()) return;
    setPromoBusy(true);
    try {
      const r = await redeemPromoCode(promo.trim());
      if (r.ok) { toast('¡Código aceptado! Tienes un giro extra.', 'ok'); setPromo(''); await refreshMe(); }
      else toast(errText(r.error), 'error');
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setPromoBusy(false); }
  };

  const nowMs = Date.now() + clockOffset;
  const campaignStatus = pub?.campaign?.status;
  const reason = me?.reason ?? (campaignStatus && campaignStatus !== 'active' ? `campaign_${campaignStatus}` : null);
  const extras = me?.extras ?? [];
  const inactive = !!campaignStatus && campaignStatus !== 'active';
  const label = phase === 'requesting' ? 'Girando…' : phase === 'spinning' ? '¡Mucha suerte!' : config.copy.button_text;
  const live = useMemo(() => {
    if (phase === 'spinning') return 'La ruleta está girando.';
    if (result) return `Resultado: ${result.prize.name}.`;
    return '';
  }, [phase, result]);

  return (
    <>
      <section aria-labelledby="ruleta-h" className="hero" style={seasonVars(season)}>
        {season && seasonFx.decor && <SeasonDecor season={season} />}
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-7 sm:pt-9">
          <h1 id="ruleta-h" className="font-display mx-auto max-w-[17ch] text-balance text-center text-[clamp(1.8rem,7.6vw,3.3rem)] font-extrabold leading-[1.05] text-[color:var(--hero-ink)] md:max-w-[26ch]">{title}</h1>
          <div className="mx-auto px-[1.5%] pb-1 pt-[13%]" style={{ width: 'min(100%, 36rem, max(19rem, calc(100dvh - 21rem)))' }}>
            <Wheel ref={wheel} sectors={wheelSectors} placeholder={placeholder} highlight={highlight} logoUrl={config.store.logo_url} storeName={config.store.name}
              dimmed={inactive && !pubLoading} active={phase === 'spinning'} />
          </div>
        </div>
      </section>
      <p className="sr-only-live" aria-live="polite">{live}</p>

      <div className="sheet">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 pb-6 pt-8">
          {!authReady || (session && !me && !error) ? (
            <button className="btn-spin" disabled><span>Cargando…</span></button>
          ) : !session ? (
            <>
              <button type="button" onClick={() => void signInWithGoogle()} className="btn btn-ghost !min-h-14 !rounded-full !px-6 !text-base shadow-sm">
                <IconGoogle /> Continuar con Google
              </button>
              <p className="max-w-sm text-center text-sm text-dim">Inicia sesión para girar. Solo usamos tu nombre y correo para identificar tu cuenta.</p>
            </>
          ) : (
            <>
              {me?.require_participation_code && me.can_spin && (
                <Field label="Código de participación" hint="Te lo entregan en la tienda al comprar." className="w-full max-w-sm">
                  {(id) => <input id={id} className="input text-center font-mono uppercase tracking-widest" value={code} autoComplete="off" autoCapitalize="characters" maxLength={14}
                    onChange={(e) => setCode(e.target.value)} placeholder="XXXXXXXXXX" />}
                </Field>
              )}
              <button type="button" className={`btn-spin ${me?.can_spin && phase === 'idle' ? 'ready' : ''}`}
                disabled={!me?.can_spin || phase !== 'idle' || (!!me?.require_participation_code && me.can_spin && code.trim().length < 6)}
                aria-disabled={!me?.can_spin} onClick={() => void onSpin()}>
                {label}
              </button>
            </>
          )}

          {error && <Alert kind="error" className="w-full max-w-md text-center">{error}</Alert>}

          {session && me && (
            <div className="w-full max-w-md rounded-2xl bg-surface-2 px-5 py-4 text-center" aria-live="polite">
              {me.can_spin ? (
                <>
                  <p className="font-display text-lg font-bold">
                    {me.base_available ? 'Tienes tu giro de la semana disponible' : `Tienes ${extras.length} giro${extras.length === 1 ? '' : 's'} extra disponible${extras.length === 1 ? '' : 's'}`}
                  </p>
                  {me.base_available && extras.length > 0 && <p className="mt-1 text-sm text-dim">Además tienes {extras.length} giro{extras.length === 1 ? '' : 's'} extra.</p>}
                </>
              ) : reason === 'already_spun' ? (
                <>
                  <p className="font-display text-lg font-bold">Ya usaste tu giro de esta semana</p>
                  {me.next_base_at && (
                    <p className="mt-1 text-sm text-dim">
                      Tu próximo giro estará disponible el <strong className="text-ink">{fmtDateTime(me.next_base_at, tz)}</strong> ({relativeTo(me.next_base_at, nowMs)}).
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">{(reason && REASONS[reason]) ?? 'Por ahora no puedes girar.'}</p>
              )}
              {me.base_available === false && extras.length > 0 && me.can_spin && me.next_base_at && (
                <p className="mt-1 text-sm text-dim">Tu giro base se renueva el {fmtDateTime(me.next_base_at, tz)}.</p>
              )}
              {extras.length > 0 && (
                <p className="mt-2 text-xs text-dim">Giros extra vigentes hasta: {extras.map((e) => fmtDateTime(e.expires_at, tz)).join(' · ')}</p>
              )}
            </div>
          )}

          {!session && inactive && !pubLoading && (
            <Alert kind="warn" className="max-w-md text-center">{REASONS[`campaign_${campaignStatus}`] ?? 'La promoción no está activa por ahora.'}</Alert>
          )}

          {session && me && campaignStatus === 'active' && (
            <details className="w-full max-w-md text-sm">
              <summary className="cursor-pointer select-none text-center text-dim underline-offset-4 hover:underline">¿Tienes un código promocional de giro extra?</summary>
              <div className="mt-3 flex gap-2">
                <input className="input flex-1 font-mono uppercase tracking-widest" aria-label="Código promocional" placeholder="CÓDIGO" value={promo}
                  autoComplete="off" autoCapitalize="characters" maxLength={14} onChange={(e) => setPromo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void redeemPromo(); }} />
                <button className="btn btn-primary" disabled={promoBusy || !promo.trim()} onClick={() => void redeemPromo()}>Canjear</button>
              </div>
            </details>
          )}
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-24 md:pb-14">{children}</div>
      </div>

      <ResultModal result={result} onClose={() => { setResult(null); setHighlight(null); }} onSpinAgain={() => void onSpin()} />
    </>
  );
}
