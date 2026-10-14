import { useCallback, useEffect, useState } from 'react';
import {
  adminCreateCodes, adminDeactivateCode, adminGrantExtra, adminListCodes, adminListExtras, adminListUsers, adminRevokeExtra,
  ApiError, errText,
} from '../lib/api';
import type { AdminUser, CodeRow, ExtraSpinRow, Paged } from '../lib/types';
import { downloadText, fmtShort, groupCode, isoToZonedLocal, toCsv, zonedLocalToIso } from '../lib/format';
import { Alert, CopyButton, Field, Modal, Pagination, Spinner } from '../components/ui';
import { useToast } from '../context/Toast';
import { useApp } from '../context/AppContext';

const ORIGIN: Record<string, string> = { prize: 'Premio «Vuelve a girar»', admin: 'Asignación manual', promo_code: 'Código promocional' };
const STATUS: Record<string, string> = { available: 'Disponible', used: 'Usado', expired: 'Vencido', revoked: 'Revocado' };

function GrantSection({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    try { setResults((await adminListUsers(q.trim(), null, 8, 0)).rows); } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setSearching(false); }
  };
  const grant = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const r = await adminGrantExtra(picked.id, reason, days ? Number(days) : null);
      if (r.ok) { toast(`Giro extra asignado a ${picked.name ?? picked.email}`, 'ok'); setPicked(null); setReason(''); setDays(''); setResults([]); setQ(''); onDone(); }
      else toast(errText(r.error), 'error');
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="card space-y-3 p-4" aria-labelledby="grant-h">
      <div>
        <h2 id="grant-h" className="font-display text-lg font-semibold">Asignar un giro extra</h2>
        <p className="text-sm text-dim">Es una excepción explícita al giro base semanal. Queda registrada con el motivo, quién la otorgó y su vencimiento. El historial nunca se reinicia.</p>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input className="input flex-1" aria-label="Buscar cliente por nombre o correo" placeholder="Buscar cliente por nombre o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-ghost" disabled={searching || q.trim().length < 2}>{searching ? <Spinner label="Buscando" /> : 'Buscar'}</button>
      </form>
      {results.length > 0 && !picked && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {results.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0"><span className="block truncate font-semibold">{u.name ?? '—'}</span><span className="block truncate text-xs text-dim">{u.email} · {u.spins} giros</span></span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPicked(u)}>Elegir</button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <div className="space-y-3 rounded-xl border border-btn p-3">
          <p className="text-sm">Cliente: <strong>{picked.name ?? picked.email}</strong> <span className="text-dim">({picked.email})</span> <button className="ml-2 text-xs underline" onClick={() => setPicked(null)}>cambiar</button></p>
          <Field label="Motivo (obligatorio)" hint="Ej.: compensación por una falla, cortesía de aniversario…">{(id) => <textarea id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}</Field>
          <Field label="Vigencia en días (opcional)" hint="Si lo dejas vacío se usa la vigencia de la campaña.">{(id) => <input id={id} type="number" min={1} max={90} className="input sm:w-40" value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
          <button className="btn btn-primary" disabled={busy || reason.trim().length < 5} onClick={() => void grant()}>{busy ? 'Asignando…' : 'Asignar giro extra'}</button>
        </div>
      )}
    </section>
  );
}

function ExtrasList({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const { pub } = useApp();
  const tz = pub?.campaign?.timezone;
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<ExtraSpinRow> | null>(null);
  const [revoking, setRevoking] = useState<ExtraSpinRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await adminListExtras(status || null, 15, offset)); } catch (e) { toast(e instanceof ApiError ? e.message : 'Error', 'error'); } }, [status, offset, toast]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      const r = await adminRevokeExtra(revoking.id, reason);
      if (r.ok) { toast('Giro extra revocado', 'ok'); setRevoking(null); setReason(''); void load(); } else toast(errText(r.error), 'error');
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-3" aria-labelledby="extras-h">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="extras-h" className="font-display text-lg font-semibold">Giros extra otorgados</h2>
        <select aria-label="Filtrar por estado" className="input !w-auto" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }}>
          <option value="">Todos</option><option value="available">Disponibles</option><option value="used">Usados</option><option value="expired">Vencidos</option><option value="revoked">Revocados</option>
        </select>
      </div>
      {!data ? <Spinner /> : data.rows.length === 0 ? <div className="card p-6 text-center text-dim">Todavía no hay giros extra.</div> : (
        <div className="card overflow-hidden p-1 max-md:border-0 max-md:bg-transparent max-md:p-0">
          <table className="rtable">
            <caption className="sr-only">Giros extra</caption>
            <thead><tr><th>Cliente</th><th>Origen</th><th>Estado</th><th>Motivo</th><th>Creado</th><th>Vence</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Cliente"><span className="font-semibold">{r.user_name}</span><span className="block text-xs text-dim">{r.user_email}</span></td>
                <td data-label="Origen">{ORIGIN[r.origin] ?? r.origin}{r.granted_by_name && <span className="block text-xs text-dim">por {r.granted_by_name}</span>}</td>
                <td data-label="Estado"><span className={`badge ${r.status === 'available' ? 'badge-redeemed' : r.status === 'used' ? 'badge-info' : r.status === 'revoked' ? 'badge-void' : 'badge-expired'}`}>{STATUS[r.status] ?? r.status}</span></td>
                <td data-label="Motivo">{r.revoke_reason ? `Revocado: ${r.revoke_reason}` : r.reason ?? '—'}</td>
                <td data-label="Creado">{fmtShort(r.created_at, tz)}</td>
                <td data-label="Vence">{fmtShort(r.expires_at, tz)}</td>
                <td data-label="">{r.status === 'available' && <button className="btn btn-ghost btn-sm" onClick={() => setRevoking(r)}>Revocar</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {data && <Pagination total={data.total} offset={offset} limit={15} onChange={setOffset} />}
      <Modal open={!!revoking} onClose={() => !busy && setRevoking(null)} title="Revocar giro extra">
        <div className="space-y-3">
          <Field label="Motivo (obligatorio)">{(id) => <textarea id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="flex gap-2"><button className="btn btn-ghost flex-1" onClick={() => setRevoking(null)}>Cancelar</button><button className="btn btn-danger flex-1" disabled={busy || reason.trim().length < 3} onClick={() => void revoke()}>Revocar</button></div>
        </div>
      </Modal>
    </section>
  );
}

function CodesSection() {
  const toast = useToast();
  const { pub } = useApp();
  const tz = pub?.campaign?.timezone ?? 'America/Mexico_City';
  const [kind, setKind] = useState<'extra_spin' | 'participation'>('extra_spin');
  const [count, setCount] = useState(10);
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<CodeRow> | null>(null);

  const load = useCallback(async () => { try { setData(await adminListCodes(filter || null, 15, offset)); } catch (e) { toast(e instanceof ApiError ? e.message : 'Error', 'error'); } }, [filter, offset, toast]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await adminCreateCodes(kind, count, expires ? zonedLocalToIso(expires, tz) : null, note || null);
      if (r.ok) { setFresh(r.codes); toast(`${r.codes.length} códigos creados`, 'ok'); void load(); } else toast(errText(r.error), 'error');
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-3" aria-labelledby="codes-h">
      <div>
        <h2 id="codes-h" className="font-display text-lg font-semibold">Códigos de un solo uso</h2>
        <p className="text-sm text-dim">
          <strong>Promocionales:</strong> el cliente los canjea en la web y recibe un giro extra. <strong>De participación:</strong> solo se piden si activas esa modalidad en «Campaña» (códigos entregados en la tienda). Cada código sirve una vez.
        </p>
      </div>
      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tipo">{(id) => <select id={id} className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="extra_spin">Promocional (giro extra)</option><option value="participation">De participación (tienda)</option></select>}</Field>
        <Field label="Cantidad (máx. 200)">{(id) => <input id={id} type="number" min={1} max={200} className="input" value={count} onChange={(e) => setCount(Number(e.target.value))} />}</Field>
        <Field label="Vencimiento (opcional)" hint={`Hora de ${tz}`}>{(id) => <input id={id} type="datetime-local" className="input" value={expires} onChange={(e) => setExpires(e.target.value)} min={isoToZonedLocal(new Date().toISOString(), tz)} />}</Field>
        <Field label="Nota (opcional)">{(id) => <input id={id} className="input" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: Volante sábado" />}</Field>
        <div className="sm:col-span-2 lg:col-span-4"><button className="btn btn-primary" disabled={busy || count < 1} onClick={() => void create()}>{busy ? 'Creando…' : 'Generar códigos'}</button></div>
      </div>

      {fresh && (
        <Alert kind="ok">
          <p className="mb-2 font-semibold">Códigos creados. Cópialos o descárgalos ahora (puedes verlos también en la lista).</p>
          <div className="mb-2 grid max-h-48 grid-cols-2 gap-1 overflow-y-auto font-mono text-sm sm:grid-cols-4">{fresh.map((c) => <span key={c}>{c}</span>)}</div>
          <div className="flex gap-2"><CopyButton text={fresh.join('\n')} label="Copiar todos" />
            <button className="btn btn-ghost btn-sm" onClick={() => downloadText('codigos.csv', toCsv([['Código'], ...fresh.map((c) => [c])]))}>Descargar CSV</button></div>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Lista de códigos</h3>
        <select aria-label="Filtrar por tipo" className="input !w-auto" value={filter} onChange={(e) => { setOffset(0); setFilter(e.target.value); }}>
          <option value="">Todos</option><option value="extra_spin">Promocionales</option><option value="participation">De participación</option>
        </select>
      </div>
      {!data ? <Spinner /> : data.rows.length === 0 ? <div className="card p-6 text-center text-dim">No hay códigos.</div> : (
        <div className="card overflow-hidden p-1 max-md:border-0 max-md:bg-transparent max-md:p-0">
          <table className="rtable">
            <caption className="sr-only">Códigos</caption>
            <thead><tr><th>Código</th><th>Tipo</th><th>Estado</th><th>Nota</th><th>Vence</th><th>Usado por</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{data.rows.map((c) => {
              const expired = c.expires_at && new Date(c.expires_at) < new Date();
              const st = c.used_at ? 'Usado' : !c.active ? 'Desactivado' : expired ? 'Vencido' : 'Disponible';
              return (
                <tr key={c.id}>
                  <td data-label="Código" className="font-mono text-xs">{groupCode(c.code)}</td>
                  <td data-label="Tipo">{c.kind === 'extra_spin' ? 'Promocional' : 'Participación'}</td>
                  <td data-label="Estado"><span className={`badge ${st === 'Disponible' ? 'badge-redeemed' : st === 'Usado' ? 'badge-info' : 'badge-expired'}`}>{st}</span></td>
                  <td data-label="Nota">{c.note ?? '—'}</td>
                  <td data-label="Vence">{c.expires_at ? fmtShort(c.expires_at, tz) : 'Sin vencimiento'}</td>
                  <td data-label="Usado por">{c.used_by_name ? `${c.used_by_name} · ${fmtShort(c.used_at, tz)}` : '—'}</td>
                  <td data-label="">{!c.used_at && c.active && <button className="btn btn-ghost btn-sm" onClick={async () => { const r = await adminDeactivateCode(c.id); if (r.ok) { toast('Código desactivado', 'ok'); void load(); } }}>Desactivar</button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {data && <Pagination total={data.total} offset={offset} limit={15} onChange={setOffset} />}
    </section>
  );
}

export default function ExtrasPage() {
  const [tab, setTab] = useState<'extras' | 'codes'>('extras');
  const [key, setKey] = useState(0);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Giros extra y códigos</h1>
        <p className="text-sm text-dim">Los giros extra son excepciones explícitas al giro base semanal: cada uno tiene origen, estado y vencimiento, y se muestran por separado de los giros base.</p>
      </div>
      <div role="tablist" aria-label="Secciones" className="flex gap-1 border-b border-line">
        {([['extras', 'Giros extra'], ['codes', 'Códigos']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold ${tab === k ? 'border-btn text-ink' : 'border-transparent text-dim'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'extras' ? (<><GrantSection onDone={() => setKey((k) => k + 1)} /><ExtrasList refreshKey={key} /></>) : <CodesSection />}
    </div>
  );
}
