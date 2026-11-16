import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { IconArrowRight, IconBell, IconCheck, IconChevronRight, IconLock, IconTicket, IconTrophy } from '../components/icons';
import { Modal } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/Toast';
import { errText, toggleRaffleReminder } from '../lib/api';
import type { RaffleInfo, RafflePhase } from '../lib/types';
import { phaseAt, refreshRaffle, useRaffleStore } from './store';
import { Countdown, fmtDayShort, fmtTime, PrizeImage, ticketLabel, useNow } from './parts';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Estado del sorteo visible para las presentaciones de la pantalla principal (null si no hay sorteo). */
function useRaffleView() {
  const { state, offset } = useRaffleStore();
  const now = useNow() + offset;
  const r = state?.raffle ?? null;
  const phase: RafflePhase | null = r ? phaseAt(r, now) : null;

  // Momento de desbloqueo: si el contador llega a cero con la pantalla abierta, el candado se abre.
  const prev = useRef<RafflePhase | null>(phase);
  const [justOpened, setJustOpened] = useState(false);
  useEffect(() => {
    const was = prev.current;
    prev.current = phase;
    if (was === 'locked' && phase === 'open') {
      setJustOpened(true);
      const t = window.setTimeout(() => setJustOpened(false), 2600);
      return () => window.clearTimeout(t);
    }
  }, [phase]);

  // Sorteo automático: al vencer la hora se vuelve a consultar para traer al ganador.
  const lastAsk = useRef(0);
  const due = !!r && r.draw_mode === 'auto' && !r.winner && now >= Date.parse(r.draw_at);
  useEffect(() => {
    if (due && Date.now() - lastAsk.current > 15_000) { lastAsk.current = Date.now(); void refreshRaffle(); }
  }, [due, now]);

  if (!r || !phase) return null;
  return { r, now, phase, mine: state?.me?.tickets ?? [], reminder: !!state?.me?.reminder, signedIn: !!state?.me, justOpened };
}
type View = NonNullable<ReturnType<typeof useRaffleView>>;

function RemindButton({ v }: { v: View }) {
  const { signInWithGoogle } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!v.signedIn) {
    return (
      <button type="button" className="rticket-cta" onClick={() => void signInWithGoogle()}>
        <IconBell width={20} height={20} /> Inicia sesión y te avisamos
      </button>
    );
  }
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await toggleRaffleReminder();
      if (!res.ok) toast(errText(res.error), 'error');
      await refreshRaffle();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" className={`rticket-cta ${v.reminder ? 'is-on' : ''}`} aria-pressed={v.reminder} disabled={busy} onClick={() => void toggle()}>
      {v.reminder ? <><IconCheck width={20} height={20} /> Te avisaremos</> : <><IconBell width={20} height={20} /> Avísame al abrir</>}
    </button>
  );
}

/** Tus boletos y cuántos hay en juego (datos reales). */
function Meta({ v }: { v: View }) {
  return (
    <p className="rticket-meta">
      <IconTicket width={18} height={18} />
      <span>
        {!v.signedIn ? 'Inicia sesión para ver tus boletos'
          : v.mine.length > 0 ? <strong>Tienes {plural(v.mine.length, 'boleto', 'boletos')}</strong> : 'Aún no tienes boleto'}
        {' · '}{v.r.total_tickets} en juego
      </span>
    </p>
  );
}

function MainAction({ v }: { v: View }) {
  if (v.phase === 'locked') return <RemindButton v={v} />;
  return (
    <Link to="/sorteo" className="rticket-cta">
      {v.phase === 'open' ? 'Entrar al sorteo' : 'Ver el resultado'} <IconArrowRight width={20} height={20} />
    </Link>
  );
}

function StatusBlock({ v }: { v: View }) {
  const { r, now, phase } = v;
  if (phase === 'locked') {
    return (
      <>
        <p className="rticket-label">Se abre en</p>
        <Countdown target={Date.parse(r.unlock_at)} now={now} label="El sorteo se abre en" />
      </>
    );
  }
  if (phase === 'open') {
    const pending = now >= Date.parse(r.draw_at);
    return (
      <>
        <p className="rticket-status" aria-live="polite">¡El sorteo ya está abierto!</p>
        {pending ? <p className="rticket-label">El ganador se elige en breve</p> : (
          <>
            <p className="rticket-label">El ganador se elige en</p>
            <Countdown target={Date.parse(r.draw_at)} now={now} label="El ganador se elige en" />
          </>
        )}
      </>
    );
  }
  return (
    <>
      <p className="rticket-status">{r.winner?.mine ? '¡Tu boleto ganó!' : 'Ya tenemos ganador'}</p>
      {r.winner && <p className="rticket-winner">Boleto ganador <strong>{ticketLabel(r.winner.number)}</strong>{r.winner.mine ? '' : ` · ${r.winner.name}`}</p>}
    </>
  );
}

function Stub({ r, phase }: { r: RaffleInfo; phase: RafflePhase }) {
  return (
    <div className="rticket-stub" aria-hidden="true">
      {phase === 'drawn' ? <IconTrophy width={22} height={22} /> : <IconLock width={22} height={22} className="rticket-lock" />}
      <span>{phase === 'locked' ? `Abre ${fmtDayShort(Date.parse(r.unlock_at))}` : phase === 'open' ? 'Abierto' : 'Sorteado'}</span>
      <span className="rticket-stub-sep" />
      <span>Sorteo {fmtDayShort(Date.parse(r.draw_at))}</span>
    </div>
  );
}

/** Computadora: el boleto completo, junto a la ruleta (lado derecho del encabezado). */
export function RaffleSide() {
  const v = useRaffleView();
  const id = useId();
  const [sheet, setSheet] = useState(false);
  if (!v) return null;
  return (
    <aside className="rside" aria-labelledby={`${id}-h`}>
      <div className={`rticket ${v.justOpened ? 'rticket-opening' : ''}`} data-phase={v.phase}>
        <div className="rticket-paper">
          <div className="rticket-art">
            <PrizeImage url={v.r.prize_image_url} alt={v.r.prize} className="rticket-art-img" />
            <span className="rticket-stamp">Exclusivo</span>
          </div>
          <div className="rticket-main">
            <h2 id={`${id}-h`} className="rticket-title">{v.r.prize_headline}</h2>
            <p className="rticket-sub">{v.r.title} · solo con boleto</p>
            <StatusBlock v={v} />
            <MainAction v={v} />
            <Meta v={v} />
            <button type="button" className="rticket-link" onClick={() => setSheet(true)}>¿Cómo participo?</button>
          </div>
          <Stub r={v.r} phase={v.phase} />
        </div>
      </div>
      <RaffleSheet v={v} open={sheet} onClose={() => setSheet(false)} />
    </aside>
  );
}

/** Hoja de detalles: premio, cuenta regresiva, cómo participar en tres pasos y reglas. */
function RaffleSheet({ v, open, onClose }: { v: View; open: boolean; onClose: () => void }) {
  const id = useId();
  const { r } = v;
  const unlock = Date.parse(r.unlock_at), draw = Date.parse(r.draw_at);
  const steps: Array<[string, string]> = [
    ['Consigue tu boleto', `${r.how_to_get ? `${r.how_to_get.replace(/\.?$/, '.')} ` : ''}En caja, muestra tu código de cliente o registra el código impreso en tu ticket.`],
    [`Se abre el ${fmtDayShort(unlock)}`, 'Ese día aparece la pestaña «Sorteo», donde ves tus boletos y puedes sumar más.'],
    [`Ganador el ${fmtDayShort(draw)}`, r.draw_mode === 'auto'
      ? `A las ${fmtTime(draw)} el sistema elige un boleto al azar.`
      : `A las ${fmtTime(draw)} se elige un boleto al azar, en vivo en la tienda.`],
  ];
  return createPortal(
    // Fuera del encabezado: su contexto de apilamiento dejaría la hoja debajo del resto de la página.
    <Modal open={open} onClose={onClose} labelledBy={`${id}-h`}>
      <div className="rsheet" data-phase={v.phase}>
        <div className="rsheet-head">
          <PrizeImage url={r.prize_image_url} alt={r.prize} className="rsheet-art" />
          <div>
            <h2 id={`${id}-h`} className="font-display text-[1.45rem] font-extrabold leading-[1.08]">{r.prize_headline}</h2>
            <p className="mt-1 text-sm text-dim">{r.title} · solo para clientes con boleto</p>
          </div>
        </div>
        {r.prize_detail && <p className="mt-3 text-sm leading-relaxed text-dim">{r.prize_detail}</p>}
        <div className="rsheet-status"><StatusBlock v={v} /></div>
        <div className="mt-4 flex flex-col items-start gap-3"><MainAction v={v} /><Meta v={v} /></div>
        <h3 className="font-display mt-6 text-lg font-extrabold">Cómo participar</h3>
        <ol className="rsheet-steps">
          {steps.map(([t, d], i) => (
            <li key={t}>
              <span className="rsheet-n" aria-hidden="true">{i + 1}</span>
              <span><strong className="block leading-tight">{t}</strong><span className="text-sm text-dim">{d}</span></span>
            </li>
          ))}
        </ol>
        <Link to="/sorteo/bases" onClick={onClose} className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Bases del sorteo</Link>
      </div>
    </Modal>,
    document.body,
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
function compact(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const clock = `${pad2(Math.floor((s % 86400) / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}

/**
 * Celular y tablet: franja-boleto arriba de la ruleta, con el premio, qué es y cuánto falta.
 * Bloqueado abre la hoja de detalles; abierto o sorteado lleva a la pestaña «Sorteo».
 */
export function RaffleStrip() {
  const v = useRaffleView();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(false);
  if (!v) return null;
  const { r, now, phase, mine } = v;
  const left = compact(Date.parse(r.unlock_at) - now);
  const title = phase === 'locked' ? 'Sorteo exclusivo' : phase === 'open' ? '¡Sorteo abierto!' : r.winner?.mine ? '¡Tu boleto ganó!' : 'Ya hay ganador';
  const sub = phase === 'drawn' && r.winner ? `Boleto ${ticketLabel(r.winner.number)}`
    : phase === 'open' ? (mine.length > 0 ? `Tienes ${plural(mine.length, 'boleto', 'boletos')}` : 'Entra y participa') : r.prize;
  return (
    <>
      <div className="rstrip-wrap">
        <button type="button" className={`rstrip ${v.justOpened ? 'rticket-opening' : ''}`} data-phase={phase}
          aria-label={phase === 'locked' ? `${title}: ${r.prize_headline}. Se abre en ${left}. Ver cómo participar` : `${title}. ${sub}. Ir a la pestaña Sorteo`}
          onClick={() => (phase === 'locked' ? setSheet(true) : navigate('/sorteo'))}>
          <span className="rstrip-paper">
            <span className="rstrip-art" aria-hidden="true"><PrizeImage url={r.prize_image_url} alt="" /></span>
            <span className="rstrip-text" aria-hidden="true">
              <span className="rstrip-title">{title}</span>
              <span className="rstrip-sub">{sub}</span>
            </span>
            <span className="rstrip-end" aria-hidden="true">
              {phase === 'locked' ? (
                <><span className="rstrip-lbl"><IconLock width={13} height={13} className="rticket-lock" /> Abre en</span><span className="rstrip-clock">{left}</span></>
              ) : (
                <span className="rstrip-go">{phase === 'open' ? 'Entrar' : 'Ver'} <IconChevronRight width={16} height={16} /></span>
              )}
            </span>
          </span>
        </button>
      </div>
      <RaffleSheet v={v} open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}
