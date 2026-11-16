import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, Field, Modal, PageLoader, Spinner } from '../components/ui';
import { QrScanner } from '../components/QrScanner';
import { IconMinus, IconPlus, IconScan, IconTrophy } from '../components/icons';
import { useToast } from '../context/Toast';
import {
  ApiError, adminCreateRaffleCodes, adminDrawRaffle, adminListRaffles, adminRaffleDetail, adminSaveRaffle,
  adminSetRaffleStatus, adminVoidRaffleTicket, errText, staffFindCustomer, staffGrantRaffleTickets,
} from '../lib/api';
import { DEFAULT_TZ, downloadText, isoToZonedLocal, safeUrl, toCsv, zonedLocalToIso } from '../lib/format';
import { uploadImage } from '../lib/media';
import type { AdminRaffle, DrawMode, FoundCustomer, RaffleDetail, RaffleFields, RafflePhase, RaffleStatus } from '../lib/types';
import { refreshRaffle, useRaffleStore } from '../raffle/store';
import { fmtLong, SOURCE_LABEL, ticketLabel } from '../raffle/parts';

const STATUS_LABEL: Record<RaffleStatus, string> = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' };
const STATUS_BADGE: Record<RaffleStatus, string> = { draft: 'badge-pending', published: 'badge-redeemed', archived: 'badge-expired' };
const PHASE_LABEL: Record<RafflePhase, string> = { locked: 'cuenta regresiva', open: 'abierto', drawn: 'sorteado' };

const fail = (toast: ReturnType<typeof useToast>, e: unknown) => toast(e instanceof Error ? e.message : 'Error inesperado', 'error');
const parseClientQr = (text: string) => (/^LUKY-CLIENTE:/i.test(text.trim()) ? text.trim() : null);

// ---------------------------------------------------------------------------
// Dar boletos (administración y personal de caja)
// ---------------------------------------------------------------------------
function GrantTickets({ maxPerCustomer, onGranted }: { maxPerCustomer: number; onGranted: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [who, setWho] = useState<FoundCustomer | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound([]); return; }
    const my = ++seq.current;
    setSearching(true);
    const t = window.setTimeout(() => {
      staffFindCustomer(term)
        .then((rows) => { if (my === seq.current) setFound(rows); })
        .catch((e) => fail(toast, e))
        .finally(() => { if (my === seq.current) setSearching(false); });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, toast]);

  const onScan = useCallback(async (code: string) => {
    setScanning(false);
    try {
      const rows = await staffFindCustomer(code);
      if (rows.length === 1) { setWho(rows[0]); setQty(1); }
      else toast('No encontramos a ese cliente.', 'error');
    } catch (e) { fail(toast, e); }
  }, [toast]);

  const room = who ? Math.max(0, maxPerCustomer - who.tickets) : 0;
  const give = async () => {
    if (!who) return;
    setBusy(true);
    try {
      const res = await staffGrantRaffleTickets(who.id, qty, reason.trim());
      if (!res.ok) { toast(res.error === 'max_tickets' ? 'Este cliente ya tiene el máximo de boletos.' : errText(res.error), 'error'); return; }
      toast(`${who.name ?? who.email}: ${res.numbers.map(ticketLabel).join(', ')}`, 'ok');
      setWho(null); setQ(''); setQty(1); setReason(''); setFound([]);
      onGranted();
    } catch (e) { fail(toast, e); }
    finally { setBusy(false); }
  };

  return (
    <section className="card space-y-4 p-4" aria-labelledby="dar-h">
      <div>
        <h2 id="dar-h" className="font-display text-lg font-semibold">Dar boletos</h2>
        <p className="text-sm text-dim">Busca al cliente o escanea el código que le aparece en su pestaña «Sorteo». Cada asignación queda en la auditoría con su motivo.</p>
      </div>
      {!who ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="buscar-cliente" className="sr-only">Buscar cliente</label>
            <input id="buscar-cliente" className="input" placeholder="Nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            {q.trim().length >= 2 && (
              <div className="card absolute inset-x-0 top-full z-10 mt-1 overflow-hidden p-1 shadow-xl">
                {searching && found.length === 0 ? <p className="px-3 py-2 text-sm text-dim"><Spinner label="Buscando" /></p>
                  : found.length === 0 ? <p className="px-3 py-2 text-sm text-dim">Sin resultados. El cliente debe haber iniciado sesión al menos una vez.</p>
                  : (
                    <ul role="listbox" aria-label="Clientes encontrados">
                      {found.map((c) => (
                        <li key={c.id}>
                          <button type="button" role="option" aria-selected="false" className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-2"
                            onClick={() => { setWho(c); setQty(1); }}>
                            <span className="min-w-0"><span className="block truncate font-semibold">{c.name ?? 'Sin nombre'}</span><span className="block truncate text-xs text-dim">{c.email}</span></span>
                            <span className="shrink-0 text-xs text-dim">{c.tickets} boleto{c.tickets === 1 ? '' : 's'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setScanning(true)}><IconScan width={18} height={18} /> Escanear QR del cliente</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{who.name ?? 'Sin nombre'}</p>
              <p className="text-sm text-dim">{who.email} · tiene {who.tickets} de {maxPerCustomer} boletos</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWho(null)}>Cambiar</button>
          </div>
          {room === 0 ? (
            <Alert kind="warn">Este cliente ya tiene el máximo de boletos.</Alert>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <Field label="Cantidad">
                {(id) => (
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn btn-ghost !w-11 !px-0" aria-label="Uno menos" disabled={qty <= 1} onClick={() => setQty((n) => n - 1)}><IconMinus width={18} height={18} /></button>
                    <output id={id} className="w-10 text-center font-display text-xl font-bold tabular-nums">{qty}</output>
                    <button type="button" className="btn btn-ghost !w-11 !px-0" aria-label="Uno más" disabled={qty >= room} onClick={() => setQty((n) => n + 1)}><IconPlus width={18} height={18} /></button>
                  </div>
                )}
              </Field>
              <Field label="Motivo" hint="Ej.: compra mayor a $500, ticket 4821">
                {(id) => <input id={id} className="input" maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />}
              </Field>
            </div>
          )}
          <button type="button" className="btn btn-primary" disabled={busy || room === 0 || reason.trim().length < 3} onClick={() => void give()}>
            {busy ? 'Dando boletos…' : `Dar ${qty} boleto${qty === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
      {scanning && <QrScanner parse={parseClientQr} onCode={(c) => void onScan(c)} onClose={() => setScanning(false)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Formulario del sorteo
// ---------------------------------------------------------------------------
interface Draft { title: string; prize: string; prize_headline: string; prize_detail: string; prize_image_url: string | null; unlock: string; draw: string; draw_mode: DrawMode; max_per_customer: number; claim_days: number }

function defaultDraft(): Draft {
  const day = 86_400_000;
  const at = (offsetDays: number, h: number) => {
    const d = new Date(Date.now() + offsetDays * day);
    return `${isoToZonedLocal(d.toISOString(), DEFAULT_TZ).slice(0, 10)}T${String(h).padStart(2, '0')}:00`;
  };
  return { title: '', prize: '', prize_headline: '', prize_detail: '', prize_image_url: null, unlock: at(1, 10), draw: at(8, 20), draw_mode: 'manual', max_per_customer: 5, claim_days: 30 };
}
const toDraft = (r: AdminRaffle): Draft => ({
  title: r.title, prize: r.prize, prize_headline: r.prize_headline, prize_detail: r.prize_detail ?? '', prize_image_url: r.prize_image_url,
  unlock: isoToZonedLocal(r.unlock_at, DEFAULT_TZ), draw: isoToZonedLocal(r.draw_at, DEFAULT_TZ),
  draw_mode: r.draw_mode, max_per_customer: r.max_per_customer, claim_days: r.claim_days,
});
const toFields = (d: Draft): RaffleFields => ({
  title: d.title.trim(), prize: d.prize.trim(), prize_headline: d.prize_headline.trim(), prize_detail: d.prize_detail.trim() || null,
  prize_image_url: d.prize_image_url, unlock_at: d.unlock ? zonedLocalToIso(d.unlock, DEFAULT_TZ) : '', draw_at: d.draw ? zonedLocalToIso(d.draw, DEFAULT_TZ) : '',
  draw_mode: d.draw_mode, max_per_customer: d.max_per_customer, claim_days: d.claim_days,
});

function RaffleForm({ raffle, onSaved, onCancel }: { raffle: AdminRaffle | null; onSaved: (id: string) => void; onCancel?: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => (raffle ? toDraft(raffle) : defaultDraft()));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = !!raffle?.winner;
  const img = safeUrl(d.prize_image_url);

  const save = async () => {
    setBusy(true); setErrors([]);
    try {
      const res = await adminSaveRaffle(raffle?.id ?? null, toFields(d));
      if (!res.ok) { toast(errText(res.error), 'error'); return; }
      toast(raffle ? 'Sorteo guardado' : 'Sorteo creado como borrador. Publícalo cuando esté listo.', 'ok');
      onSaved(res.id);
    } catch (e) {
      if (e instanceof ApiError && e.validation.length) setErrors(e.validation);
      else fail(toast, e);
    } finally { setBusy(false); }
  };

  const modes: Array<[DrawMode, string, string]> = [
    ['manual', 'Lo realizo yo con un botón', 'Ideal para hacerlo en vivo en la tienda o en redes. El botón aparece en esta página cuando el sorteo abre.'],
    ['auto', 'Automático a la fecha y hora', 'A la hora fijada el sistema elige al ganador solo, sin que nadie intervenga.'],
  ];

  return (
    <section className="card space-y-4 p-4" aria-labelledby="datos-h">
      <h2 id="datos-h" className="font-display text-lg font-semibold">{raffle ? 'Datos del sorteo' : 'Nuevo sorteo'}</h2>
      {locked && <Alert kind="info">Este sorteo ya se realizó: sus datos ya no se pueden cambiar.</Alert>}
      <fieldset disabled={locked} className="space-y-4">
        <Field label="Nombre del sorteo" hint="Ej.: Gran sorteo navideño">{(id) => <input id={id} className="input" maxLength={60} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Premio" hint="Ej.: Pantalla Smart TV de 55″">{(id) => <input id={id} className="input" maxLength={60} value={d.prize} onChange={(e) => setD({ ...d, prize: e.target.value })} />}</Field>
          <Field label="Frase de la tarjeta" hint="Empieza con el verbo. Ej.: Gana una Pantalla Smart TV de 55″">{(id) => <input id={id} className="input" maxLength={60} value={d.prize_headline} onChange={(e) => setD({ ...d, prize_headline: e.target.value })} />}</Field>
        </div>
        <Field label="Detalle del premio (opcional)" hint="Ej.: 4K, con instalación incluida. Se entrega en la tienda.">{(id) => <input id={id} className="input" maxLength={160} value={d.prize_detail} onChange={(e) => setD({ ...d, prize_detail: e.target.value })} />}</Field>
        <Field label="Foto del premio" hint="La imagen es lo que más llama la atención. De preferencia con fondo liso; se comprime sola.">
          {(id) => (
            <div className="flex items-center gap-3">
              {img ? <img src={img} alt="" className="h-16 w-16 rounded-lg border border-line bg-white object-contain" /> : <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-line text-center text-xs text-dim">Sin foto</span>}
              <input ref={fileRef} id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                setUploading(true);
                try { const url = await uploadImage(f, 'prizes', 640); setD((x) => ({ ...x, prize_image_url: url })); toast('Foto subida', 'ok'); }
                catch (err) { fail(toast, err); }
                finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
              }} />
              {!locked && <label htmlFor={id} className="btn btn-ghost btn-sm cursor-pointer">{uploading ? <Spinner label="Subiendo" /> : img ? 'Cambiar' : 'Subir'}</label>}
              {!locked && img && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, prize_image_url: null })}>Quitar</button>}
            </div>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Se abre el" hint="Hasta entonces los clientes ven la cuenta regresiva.">{(id) => <input id={id} type="datetime-local" className="input" value={d.unlock} onChange={(e) => setD({ ...d, unlock: e.target.value })} />}</Field>
          <Field label="Fecha y hora del sorteo">{(id) => <input id={id} type="datetime-local" className="input" value={d.draw} onChange={(e) => setD({ ...d, draw: e.target.value })} />}</Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Cómo se elige al ganador</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {modes.map(([v, t, h]) => (
              <label key={v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${d.draw_mode === v ? 'border-[#a8340e] bg-surface-2' : 'border-line'}`}>
                <input type="radio" name="modo" className="mt-1 accent-[#a8340e]" checked={d.draw_mode === v} onChange={() => setD({ ...d, draw_mode: v })} />
                <span><span className="block font-semibold">{t}</span><span className="text-sm text-dim">{h}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Máximo de boletos por cliente">
            {(id) => <input id={id} type="number" min={1} max={50} className="input !w-28" value={d.max_per_customer} onChange={(e) => setD({ ...d, max_per_customer: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />}
          </Field>
          <Field label="Días para reclamar el premio">
            {(id) => <input id={id} type="number" min={1} max={365} className="input !w-28" value={d.claim_days} onChange={(e) => setD({ ...d, claim_days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />}
          </Field>
        </div>
      </fieldset>
      {errors.length > 0 && <Alert kind="error"><ul className="list-disc space-y-1 pl-5">{errors.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || uploading} onClick={() => void save()}>{busy ? 'Guardando…' : raffle ? 'Guardar' : 'Crear sorteo'}</button>
          {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Secciones de un sorteo existente
// ---------------------------------------------------------------------------
function StatusActions({ r, onChanged }: { r: AdminRaffle; onChanged: () => void }) {
  const toast = useToast();
  const [ask, setAsk] = useState<RaffleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (status: RaffleStatus) => {
    setBusy(true);
    try {
      const res = await adminSetRaffleStatus(r.id, status);
      if (!res.ok) { toast(errText(res.error), 'error'); return; }
      toast(status === 'published' ? 'Sorteo publicado: los clientes ya lo ven' : status === 'archived' ? 'Sorteo archivado' : 'Sorteo pasado a borrador', 'ok');
      setAsk(null); onChanged();
    } catch (e) { fail(toast, e); }
    finally { setBusy(false); }
  };
  const text: Record<RaffleStatus, [string, string, string]> = {
    published: ['¿Publicar el sorteo?', 'Los clientes verán la tarjeta con la cuenta regresiva en la pantalla principal. Puedes dar boletos desde ahora.', 'Sí, publicar'],
    draft: ['¿Volver a borrador?', 'Los clientes dejarán de ver el sorteo, incluidos sus boletos, hasta que lo publiques de nuevo. Los boletos no se pierden.', 'Sí, volver a borrador'],
    archived: ['¿Archivar el sorteo?', 'Se oculta para los clientes y queda guardado en el historial del panel.', 'Sí, archivar'],
  };
  return (
    <div className="flex flex-wrap gap-2">
      {r.status === 'draft' && <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsk('published')}>Publicar</button>}
      {r.status !== 'draft' && !r.winner && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk('draft')}>Volver a borrador</button>}
      {r.status !== 'archived' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk('archived')}>Archivar</button>}
      {r.status === 'published' && <Link to="/sorteo" className="btn btn-ghost btn-sm">Ver como cliente</Link>}
      <Modal open={!!ask} onClose={() => setAsk(null)} title={ask ? text[ask][0] : ''}>
        {ask && (
          <>
            <p>{text[ask][1]}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void go(ask)}>{text[ask][2]}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function Draw({ r, onDrawn }: { r: AdminRaffle; onDrawn: () => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const doDraw = async () => {
    setBusy(true);
    try {
      const res = await adminDrawRaffle(r.id);
      setConfirm(false);
      if (!res.ok) { toast(errText(res.error), 'error'); return; }
      toast(`Ganador: ${ticketLabel(res.number)} · ${res.name}`, 'ok');
      onDrawn();
    } catch (e) { fail(toast, e); }
    finally { setBusy(false); }
  };
  return (
    <section className="card space-y-3 p-4" aria-labelledby="realizar-h">
      <h2 id="realizar-h" className="font-display text-lg font-semibold">Elegir al ganador</h2>
      {r.winner ? (
        <div className="flex items-center gap-4 rounded-xl bg-surface-2 p-4">
          <IconTrophy width={30} height={30} className="shrink-0 text-[#a8340e]" />
          <div className="min-w-0">
            <p className="font-display text-xl font-bold tabular-nums">{ticketLabel(r.winner.number)} · {r.winner.name ?? 'Sin nombre'}</p>
            <p className="break-all text-sm text-dim">{r.winner.email}</p>
            <p className="text-sm text-dim">Elegido el {fmtLong(Date.parse(r.drawn_at ?? r.updated_at))} entre {r.tickets} boletos. Ya aparece en la pestaña «Sorteo» de los clientes.</p>
          </div>
        </div>
      ) : r.status !== 'published' ? (
        <p className="text-dim">Publica el sorteo para poder realizarlo.</p>
      ) : r.draw_mode === 'auto' ? (
        <p className="text-dim">Se realizará automáticamente entre todos los boletos en juego (hoy {r.tickets}). Programado para el <strong className="text-ink">{fmtLong(Date.parse(r.draw_at))}</strong></p>
      ) : (
        <>
          <p className="text-dim">Pulsa el botón cuando estés listo, por ejemplo en vivo en la tienda. Programado para el <strong className="text-ink">{fmtLong(Date.parse(r.draw_at))}</strong></p>
          <button type="button" className="btn btn-primary !min-h-12" disabled={r.phase !== 'open' || r.tickets === 0} onClick={() => setConfirm(true)}>
            <IconTrophy width={18} height={18} /> Realizar sorteo
          </button>
          {r.phase === 'locked' && <p className="text-sm text-dim">Disponible cuando el sorteo se abra.</p>}
          {r.phase === 'open' && r.tickets === 0 && <p className="text-sm text-dim">Todavía no hay boletos en juego.</p>}
        </>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="¿Realizar el sorteo ahora?">
        <p>Se elegirá al azar <strong>1 de {r.tickets} boletos</strong>. El resultado se publica de inmediato y no se puede deshacer.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void doDraw()}>{busy ? 'Sorteando…' : 'Sí, realizar sorteo'}</button>
        </div>
      </Modal>
    </section>
  );
}

function Codes({ r, detail, onChanged }: { r: AdminRaffle; detail: RaffleDetail; onChanged: () => void }) {
  const toast = useToast();
  const [n, setN] = useState(20);
  const [busy, setBusy] = useState(false);
  const closed = !!r.winner || r.status === 'archived';
  const make = async () => {
    setBusy(true);
    try {
      const res = await adminCreateRaffleCodes(r.id, n);
      if (!res.ok) { toast(errText(res.error), 'error'); return; }
      toast(`Se generaron ${res.codes.length} códigos`, 'ok');
      onChanged();
    } catch (e) { fail(toast, e); }
    finally { setBusy(false); }
  };
  const exportCsv = () => downloadText(`codigos-${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
    toCsv([['Código', 'Estado', 'Usado por'], ...detail.codes.map((c) => [c.code, c.used_at ? 'Usado' : c.active ? 'Disponible' : 'Inactivo', c.used_by ?? ''])]));
  return (
    <section className="card space-y-4 p-4" aria-labelledby="codigos-h">
      <div>
        <h2 id="codigos-h" className="font-display text-lg font-semibold">Códigos para tickets de compra</h2>
        <p className="text-sm text-dim">Imprímelos o pásalos a tu punto de venta. Cada código es de un solo uso y vale un boleto; el cliente lo registra en su pestaña «Sorteo» cuando el sorteo abre. {r.codes_free} sin usar de {r.codes_total}.</p>
      </div>
      {!closed && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Cantidad">{(id) => <input id={id} type="number" min={1} max={500} className="input !w-28" value={n} onChange={(e) => setN(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />}</Field>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void make()}>{busy ? 'Generando…' : 'Generar'}</button>
          <button type="button" className="btn btn-ghost" disabled={detail.codes.length === 0} onClick={exportCsv}>Descargar CSV</button>
        </div>
      )}
      {detail.codes.length === 0 ? <p className="text-sm text-dim">Aún no hay códigos.</p> : (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {detail.codes.slice(0, 12).map((c) => (
              <li key={c.code} className={`rounded-lg border border-line px-3 py-2 ${c.used_at ? 'opacity-55' : ''}`}>
                <span className={`block font-mono text-sm font-bold tracking-widest ${c.used_at ? 'line-through' : ''}`}>{c.code}</span>
                <span className="text-xs text-dim">{c.used_at ? `Usado · ${c.used_by ?? ''}` : 'Disponible'}</span>
              </li>
            ))}
          </ul>
          {detail.codes.length > 12 && <p className="text-xs text-dim">Y {detail.codes.length - 12} más en el CSV.</p>}
          {closed && <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>Descargar CSV</button>}
        </>
      )}
    </section>
  );
}

function Participants({ r, detail, onChanged }: { r: AdminRaffle; detail: RaffleDetail; onChanged: () => void }) {
  const toast = useToast();
  const [voiding, setVoiding] = useState<{ id: string; number: number; name: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const doVoid = async () => {
    if (!voiding) return;
    setBusy(true);
    try {
      const res = await adminVoidRaffleTicket(voiding.id, reason.trim());
      if (!res.ok) { toast(errText(res.error), 'error'); return; }
      toast(`Boleto ${ticketLabel(voiding.number)} anulado`, 'ok');
      setVoiding(null); setReason(''); onChanged();
    } catch (e) { fail(toast, e); }
    finally { setBusy(false); }
  };
  return (
    <section className="card p-4" aria-labelledby="part-h">
      <h2 id="part-h" className="font-display mb-1 text-lg font-semibold">Participantes</h2>
      <p className="mb-3 text-sm text-dim">{r.tickets} boleto{r.tickets === 1 ? '' : 's'} de {r.participants} cliente{r.participants === 1 ? '' : 's'}{detail.reminders > 0 ? ` · ${detail.reminders} pidieron aviso al abrir` : ''}.{!r.winner && detail.participants.length > 0 ? ' Toca un boleto para anularlo si se dio por error.' : ''}</p>
      {detail.participants.length === 0 ? <Empty title="Aún no hay participantes">Da boletos desde «Dar boletos» o genera códigos para los tickets de compra.</Empty> : (
        <table className="rtable">
          <thead><tr><th>Cliente</th><th>Boletos</th><th>Última asignación</th></tr></thead>
          <tbody>
            {detail.participants.map((p) => (
              <tr key={p.user_id}>
                <td data-label="Cliente"><span className="font-semibold">{p.name ?? 'Sin nombre'}</span><br /><span className="break-all text-xs text-dim">{p.email}</span></td>
                <td data-label="Boletos">
                  <span className="flex flex-wrap gap-1.5">
                    {p.tickets.map((t) => (
                      <button key={t.id} type="button" disabled={t.voided || !!r.winner}
                        title={`${SOURCE_LABEL[t.source]}${t.reason ? ` · ${t.reason}` : ''}${t.voided ? ' · anulado' : ''}`}
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${t.voided ? 'border-line text-dim line-through' : r.winner?.number === t.number ? 'border-[#a8340e] bg-[#ffe7c2]' : 'border-line hover:bg-surface-2'}`}
                        onClick={() => setVoiding({ id: t.id, number: t.number, name: p.name ?? p.email })}>
                        {ticketLabel(t.number)}
                      </button>
                    ))}
                  </span>
                </td>
                <td data-label="Última asignación">{fmtLong(Date.parse(p.last_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={!!voiding} onClose={() => setVoiding(null)} title={voiding ? `¿Anular el boleto ${ticketLabel(voiding.number)}?` : ''}>
        {voiding && (
          <>
            <p>El boleto de {voiding.name} dejará de participar. Queda registrado en la auditoría.</p>
            <Field label="Motivo" className="mt-3">{(id) => <input id={id} className="input" maxLength={160} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: asignado por error" />}</Field>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setVoiding(null)}>Cancelar</button>
              <button type="button" className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => void doVoid()}>Anular boleto</button>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
function AdminRaffles() {
  const toast = useToast();
  const [list, setList] = useState<AdminRaffle[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RaffleDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (prefer?: string) => {
    try {
      const rows = await adminListRaffles();
      setList(rows); setLoadError(null);
      setSelected((cur) => {
        const want = prefer ?? (cur !== 'new' ? cur : null);
        if (want && rows.some((r) => r.id === want)) return want;
        return rows.find((r) => r.status === 'published')?.id ?? rows[0]?.id ?? null;
      });
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'Error inesperado.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const current = list?.find((r) => r.id === selected) ?? null;
  const currentId = current?.id ?? null;
  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await adminRaffleDetail(id);
      if (res.ok) setDetail(res); else toast(errText(res.error), 'error');
    } catch (e) { fail(toast, e); }
  }, [toast]);
  useEffect(() => { setDetail(null); if (currentId) void loadDetail(currentId); }, [currentId, loadDetail]);

  const reload = useCallback(async () => {
    await load(currentId ?? undefined);
    if (currentId) await loadDetail(currentId);
    void refreshRaffle();
  }, [load, loadDetail, currentId]);

  if (loadError) return <Alert kind="error">{loadError}</Alert>;
  if (!list) return <PageLoader />;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Sorteos</h1>
          <p className="text-sm text-dim">Solo participan los clientes con boleto. Un sorteo publicado a la vez.</p>
        </div>
        {selected !== 'new' && <button type="button" className="btn btn-primary" onClick={() => setSelected('new')}><IconPlus width={18} height={18} /> Nuevo sorteo</button>}
      </div>

      {list.length > 1 && selected !== 'new' && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sorteos">
          {list.map((r) => (
            <button key={r.id} type="button" role="tab" aria-selected={r.id === selected}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${r.id === selected ? 'border-[#a8340e] bg-surface-2' : 'border-line bg-surface hover:bg-surface-2'}`}
              onClick={() => setSelected(r.id)}>
              {r.title}<span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
            </button>
          ))}
        </div>
      )}

      {selected === 'new' ? (
        <RaffleForm raffle={null} onSaved={(id) => void load(id)} onCancel={() => setSelected(list[0]?.id ?? null)} />
      ) : !current ? (
        <section className="card p-6 text-center">
          <h2 className="font-display text-xl font-semibold">Aún no hay sorteos</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-dim">Crea un sorteo con su premio y sus fechas. Se guarda como borrador; los clientes lo ven solo cuando lo publicas.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => setSelected('new')}><IconPlus width={18} height={18} /> Crear sorteo</button>
        </section>
      ) : (
        <>
          <section className="card space-y-3 p-4" aria-labelledby="resumen-h">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="resumen-h" className="font-display text-lg font-semibold">{current.title}</h2>
              <span className={`badge ${STATUS_BADGE[current.status]}`}>{STATUS_LABEL[current.status]}</span>
              {current.status === 'published' && <span className="text-sm text-dim">· {PHASE_LABEL[current.phase]}</span>}
            </div>
            <p className="text-sm text-dim">
              <span className="tabular-nums">{current.tickets}</span> boleto{current.tickets === 1 ? '' : 's'} de <span className="tabular-nums">{current.participants}</span> cliente{current.participants === 1 ? '' : 's'}
              {' · '}se abre el {fmtLong(Date.parse(current.unlock_at))} · sorteo el {fmtLong(Date.parse(current.draw_at))}
            </p>
            <StatusActions r={current} onChanged={() => void reload()} />
          </section>

          {current.status === 'published' && !current.winner && <GrantTickets maxPerCustomer={current.max_per_customer} onGranted={() => void reload()} />}
          {current.status === 'draft' && <Alert kind="info">Es un borrador: publícalo para que los clientes lo vean y para poder dar boletos.</Alert>}
          <Draw r={current} onDrawn={() => void reload()} />
          <RaffleForm key={`${current.id}-${current.updated_at}`} raffle={current} onSaved={() => void reload()} />
          {detail ? (
            <>
              <Codes r={current} detail={detail} onChanged={() => void reload()} />
              <Participants r={current} detail={detail} onChanged={() => void reload()} />
            </>
          ) : <PageLoader />}
        </>
      )}
    </div>
  );
}

/** Personal de caja: solo dar boletos del sorteo publicado. */
function StaffRaffle() {
  const { state, loaded } = useRaffleStore();
  useEffect(() => { void refreshRaffle(); }, []);
  const r = state?.raffle ?? null;
  if (!loaded) return <PageLoader />;
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <div>
        <h1 className="font-display text-2xl font-semibold">Sorteo</h1>
        {r && <p className="text-sm text-dim">{r.title} · {r.prize}</p>}
      </div>
      {!r ? <Empty title="No hay un sorteo publicado">Cuando la administración publique un sorteo, aquí podrás dar boletos a los clientes.</Empty>
        : r.winner ? <Alert kind="info">Este sorteo ya se realizó: ya no se dan boletos.</Alert>
        : <GrantTickets maxPerCustomer={r.max_per_customer} onGranted={() => void refreshRaffle()} />}
    </div>
  );
}

export default function RaffleAdminPage({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? <AdminRaffles /> : <StaffRaffle />;
}
