import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { IconGoogle, IconLock, IconTrophy } from '../components/icons';
import { PageLoader, QrImage, SimpleText } from '../components/ui';
import { PageTitle } from '../components/Layout';
import { SeasonDecor, seasonVars } from '../components/SeasonDecor';
import { couponQrValue } from '../components/ResultModal';
import { errText, redeemRaffleCode } from '../lib/api';
import { groupCode } from '../lib/format';
import type { RaffleInfo } from '../lib/types';
import { phaseAt, refreshRaffle, useRaffleStore } from './store';
import { celebrateWin, Countdown, fmtDayShort, fmtLong, fmtTime, PrizeImage, ticketLabel, TicketStub, useNow } from './parts';

/** El premio, presentado como un gran boleto: es el protagonista de esta pestaña. */
function PrizeTicket({ r, locked }: { r: RaffleInfo; locked: boolean }) {
  return (
    <div className="bigticket-wrap">
      <div className="bigticket">
        <div className="bigticket-main">
          <div className="bigticket-head">
            <PrizeImage url={r.prize_image_url} alt={r.prize} className="bigticket-img" />
            <div>
              <p className="bigticket-prize">{r.prize}</p>
              {r.prize_detail && <p className="bigticket-detail">{r.prize_detail}</p>}
            </div>
          </div>
        </div>
        <div className="bigticket-stub">
          {locked ? <IconLock width={30} height={30} /> : <span className="bigticket-day">{fmtDayShort(Date.parse(r.draw_at))}</span>}
          <span className="bigticket-stub-txt">{locked ? 'Bloqueado' : fmtTime(Date.parse(r.draw_at))}</span>
        </div>
      </div>
    </div>
  );
}

function WinnerTicket({ r }: { r: RaffleInfo }) {
  const w = r.winner!;
  return (
    <div className="bigticket-wrap">
      <div className={`bigticket ${w.mine ? 'bigticket-mine' : ''}`}>
        <div className="bigticket-main">
          <p className="bigticket-detail">{w.mine ? '¡Este es tu boleto!' : 'Boleto ganador'}</p>
          <p className="bigticket-number">{ticketLabel(w.number)}</p>
          <p className="bigticket-detail"><strong>{w.mine ? 'Ganaste' : w.name}</strong> · {r.prize}</p>
        </div>
        <div className="bigticket-stub">
          <IconTrophy width={32} height={32} />
          <span className="bigticket-stub-txt">{fmtDayShort(Date.parse(w.at))}</span>
        </div>
      </div>
    </div>
  );
}

/** Para la persona ganadora: su código y QR para recoger el premio en la tienda. */
function ClaimPrize({ r, now }: { r: RaffleInfo; now: number }) {
  const w = r.winner!;
  const until = Date.parse(w.claim_until);
  if (w.claimed_at) {
    return (
      <section aria-labelledby="reclamar-h" className="mb-10 rounded-2xl bg-surface-2 p-5">
        <h2 id="reclamar-h" className="font-display text-2xl font-extrabold">Premio entregado</h2>
        <p className="mt-1 leading-relaxed text-dim">Recogiste tu {r.prize} el {fmtLong(Date.parse(w.claimed_at))}. ¡Que lo disfrutes!</p>
      </section>
    );
  }
  if (now >= until || !w.claim_code) {
    return (
      <section aria-labelledby="reclamar-h" className="mb-10 rounded-2xl bg-surface-2 p-5">
        <h2 id="reclamar-h" className="font-display text-2xl font-extrabold">Plazo terminado</h2>
        <p className="mt-1 leading-relaxed text-dim">El plazo para recoger el premio terminó el {fmtLong(until)}. Si tienes dudas, acércate a la tienda.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="reclamar-h" className="mb-10 grid items-center gap-5 sm:grid-cols-[auto_1fr]">
      <div className="justify-self-center rounded-2xl border border-line bg-white p-2.5 sm:justify-self-start">
        <QrImage value={couponQrValue(w.claim_code)} size={168} alt="Código QR para recoger el premio del sorteo" />
      </div>
      <div>
        <h2 id="reclamar-h" className="font-display text-2xl font-extrabold">Recoge tu premio</h2>
        <p className="mt-1 leading-relaxed text-dim">Pasa a la tienda con este código y una identificación oficial. Tienes hasta el <strong className="text-ink">{fmtLong(until)}</strong> para recoger tu {r.prize}.</p>
        <p className="mt-3 text-sm text-dim">Si no se puede escanear, dicta este código:</p>
        <p className="font-mono text-2xl font-bold tracking-[0.12em]">{groupCode(w.claim_code)}</p>
      </div>
    </section>
  );
}

function CodeForm({ disabled }: { disabled: boolean }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await redeemRaffleCode(code);
      if (res.ok) { setMsg({ ok: true, text: `¡Listo! Se agregó el boleto ${ticketLabel(res.number)}.` }); setCode(''); await refreshRaffle(); }
      else setMsg({ ok: false, text: res.error === 'max_tickets' ? 'Ya tienes el máximo de boletos.' : errText(res.error) });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'No se pudo registrar el código.' }); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3">
      <label htmlFor="codigo-boleto" className="sr-only">Código del ticket de compra</label>
      <div className="flex gap-2">
        <input id="codigo-boleto" className="input flex-1 font-mono uppercase tracking-widest" placeholder="Ej.: BX7KQ2MPAA" maxLength={16}
          autoComplete="off" autoCapitalize="characters" value={code} disabled={disabled || busy} onChange={(e) => { setCode(e.target.value); setMsg(null); }} />
        <button className="btn btn-primary" disabled={disabled || busy || code.replace(/[^a-z0-9]/gi, '').length < 8}>{busy ? 'Agregando…' : 'Agregar'}</button>
      </div>
      <p className={`mt-2 min-h-5 text-sm ${msg ? (msg.ok ? 'font-semibold text-ok' : 'font-semibold text-bad') : 'text-dim'}`} role="status">
        {msg?.text ?? (disabled ? 'Podrás registrar tu código cuando se abra el sorteo. Guarda tu ticket.' : 'Viene impreso en tu ticket de compra. Cada código vale un boleto.')}
      </p>
    </form>
  );
}

export default function RafflePage() {
  const { state, loaded, offset } = useRaffleStore();
  const now = useNow() + offset;
  const { session, config, season, seasonFx, signInWithGoogle } = useApp();
  const r = state?.raffle ?? null;
  const phase = r ? phaseAt(r, now) : null;

  // Celebración una sola vez cuando el cliente ve que su boleto ganó.
  const celebrated = useRef(false);
  useEffect(() => {
    if (phase === 'drawn' && r?.winner?.mine && !celebrated.current) {
      celebrated.current = true;
      void celebrateWin([config.theme.primary, config.theme.accent, '#ffffff', config.theme.secondary]);
    }
  }, [phase, r?.winner?.mine, config.theme]);

  // Sorteo automático vencido: vuelve a consultar para traer al ganador.
  const lastAsk = useRef(0);
  const due = !!r && r.draw_mode === 'auto' && !r.winner && now >= Date.parse(r.draw_at);
  useEffect(() => {
    if (due && Date.now() - lastAsk.current > 15_000) { lastAsk.current = Date.now(); void refreshRaffle(); }
  }, [due, now]);

  if (!loaded) return <PageLoader />;
  if (!r || !phase) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-32 pt-6 md:pb-14">
        <PageTitle sub="Cuando la tienda abra un sorteo exclusivo, aparecerá aquí y en la pantalla principal.">Sorteo</PageTitle>
        <Link to="/" className="btn btn-primary">Ir a la ruleta</Link>
      </div>
    );
  }

  const mine = state?.me?.tickets ?? [];
  const atMax = mine.length >= r.max_per_customer;
  const drawAt = Date.parse(r.draw_at);
  const pending = phase === 'open' && now >= drawAt;
  const how = r.winner
    ? `Se eligió al azar, el ${fmtLong(Date.parse(r.winner.at))}, un boleto entre los ${r.total_tickets} que estaban en juego.`
    : r.draw_mode === 'auto'
      ? `El ${fmtLong(drawAt)} el sistema elige al azar un boleto entre todos los que estén en juego. El resultado aparece aquí en ese momento.`
      : `El ${fmtLong(drawAt)} se realiza el sorteo en vivo en la tienda: se elige al azar un boleto entre todos los que estén en juego y el resultado aparece aquí.`;

  return (
    <>
      <section aria-labelledby="sorteo-h" className="hero raffle-hero" style={seasonVars(season)}>
        {season && seasonFx.decor && <SeasonDecor season={season} />}
        <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-8 text-center sm:pt-10">
          <h1 id="sorteo-h" className="font-display mx-auto max-w-[18ch] text-balance text-[clamp(1.9rem,7.4vw,3.2rem)] font-extrabold leading-[1.04] text-[color:var(--hero-ink)]">{r.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-[0.98rem] text-[color:var(--hero-ink)] opacity-90">Solo para clientes con boleto</p>

          <div className="mt-7">{phase === 'drawn' ? <WinnerTicket r={r} /> : <PrizeTicket r={r} locked={phase === 'locked'} />}</div>

          {phase === 'locked' && (
            <div className="mt-8">
              <p className="raffle-timer-label">Se abre en</p>
              <Countdown target={Date.parse(r.unlock_at)} now={now} size="lg" label="El sorteo se abre en" />
            </div>
          )}
          {phase === 'open' && (
            <div className="mt-8">
              {pending ? <p className="raffle-timer-label">El ganador se elige en breve</p> : (
                <>
                  <p className="raffle-timer-label">El ganador se elige en</p>
                  <Countdown target={drawAt} now={now} size="lg" label="El ganador se elige en" />
                </>
              )}
              <p className="mt-3 text-sm text-[color:var(--hero-ink)] opacity-90">{r.draw_mode === 'auto' ? 'Sorteo automático' : 'Sorteo en vivo en la tienda'} · {fmtLong(drawAt)}</p>
            </div>
          )}
        </div>
      </section>

      <div className="sheet">
        <div className="mx-auto max-w-3xl px-4 pb-32 pt-9 md:pb-16">
          {phase === 'drawn' && r.winner?.mine && <ClaimPrize r={r} now={now} />}

          <section aria-labelledby="mis-boletos-h">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="mis-boletos-h" className="font-display text-2xl font-extrabold">Tus boletos</h2>
              {session && mine.length > 0 && (
                <p className="text-sm text-dim"><strong className="text-ink tabular-nums">{mine.length}</strong> de <span className="tabular-nums">{r.total_tickets}</span> boletos en juego</p>
              )}
            </div>
            {!session ? (
              <div className="mt-4 flex flex-col items-start gap-3">
                <p className="text-dim">Inicia sesión para ver tus boletos. Consulta el <Link to="/privacidad" className="underline underline-offset-4">aviso de privacidad</Link>.</p>
                <button type="button" onClick={() => void signInWithGoogle()} className="btn btn-ghost !min-h-12 !rounded-full !px-5"><IconGoogle /> Continuar con Google</button>
              </div>
            ) : mine.length === 0 ? (
              <p className="mt-3 max-w-prose leading-relaxed text-dim">Aún no tienes boleto. Este sorteo es exclusivo: solo participan los clientes a quienes la tienda les da un boleto.</p>
            ) : (
              <ul className="stub-list mt-4">
                {mine.map((t) => <TicketStub key={t.number} n={t.number} source={t.source} winner={r.winner?.number === t.number} />)}
              </ul>
            )}
          </section>

          {session && phase !== 'drawn' && (
            <section aria-labelledby="mas-h" className="mt-12">
              <h2 id="mas-h" className="font-display text-2xl font-extrabold">{mine.length > 0 ? 'Consigue más boletos' : 'Cómo conseguir tu boleto'}</h2>
              {atMax ? (
                <p className="mt-2 text-dim">Ya tienes el máximo de {r.max_per_customer} boletos. ¡Mucha suerte!</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-dim">Máximo {r.max_per_customer} boletos por cliente.</p>
                  <div className="ways mt-5">
                    <div className="way">
                      <h3 className="font-display text-lg font-bold leading-tight">En caja, con tu compra</h3>
                      <p className="mt-1 text-sm leading-relaxed text-dim">{r.how_to_get ? `${r.how_to_get.replace(/\.?$/, '.')} ` : ''}Muestra tu código de cliente al pagar y el personal te asigna tus boletos al momento.</p>
                      <div className="mt-3 flex items-center gap-4">
                        <QrImage value={`LUKY-CLIENTE:${session.user.id}`} size={124} alt="Tu código de cliente" className="border border-line" />
                        <p className="text-xs leading-relaxed text-dim">Tu código de cliente.<br />Sube el brillo de la pantalla para que se lea mejor.</p>
                      </div>
                    </div>
                    <div className="way">
                      <h3 className="font-display text-lg font-bold leading-tight">Con el código de tu ticket</h3>
                      <p className="mt-1 text-sm leading-relaxed text-dim">Algunas compras incluyen un código de sorteo. Escríbelo aquí.</p>
                      <CodeForm disabled={phase === 'locked'} />
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          <section aria-labelledby="como-h" className="mt-12 border-t border-line pt-8">
            <h2 id="como-h" className="font-display text-2xl font-extrabold">{phase === 'drawn' ? 'Cómo se eligió' : 'Cómo se elige al ganador'}</h2>
            <p className="mt-2 max-w-prose leading-relaxed text-dim">{how}</p>
            <p className="mt-2 max-w-prose leading-relaxed text-dim">Cada boleto tiene la misma oportunidad. Por privacidad, el nombre del ganador se muestra abreviado.</p>
            {phase === 'drawn' && session && !r.winner?.mine && <p className="mt-2 font-semibold">Esta vez no fue tu boleto. ¡Gracias por participar!</p>}
            <Link to="/sorteo/bases" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Bases del sorteo</Link>
          </section>
        </div>
      </div>
    </>
  );
}

/** Bases del sorteo publicado (las redacta la tienda en el panel). */
export function RaffleRulesPage() {
  const { state, loaded } = useRaffleStore();
  const r = state?.raffle ?? null;
  if (!loaded) return <PageLoader />;
  return (
    <>
      <PageTitle sub={r ? `${r.title} · ${r.prize}` : undefined}>Bases del sorteo</PageTitle>
      {!r ? <p className="text-dim">Ahora no hay un sorteo publicado.</p> : (
        <article className="card p-5 md:p-7">
          {r.rules_text ? <SimpleText text={r.rules_text} className="prose-lite" /> : <p className="text-dim">La tienda aún no publica las bases de este sorteo.</p>}
          <p className="mt-6 text-sm text-dim">Consulta también el <Link to="/privacidad" className="underline underline-offset-4">aviso de privacidad</Link> y las <Link to="/reglas" className="underline underline-offset-4">reglas de la ruleta</Link>.</p>
        </article>
      )}
      <Link to="/sorteo" className="btn btn-ghost mt-6">Volver al sorteo</Link>
    </>
  );
}
