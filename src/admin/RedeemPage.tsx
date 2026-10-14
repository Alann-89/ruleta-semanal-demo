import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/Toast';
import { adminGetConfig, adminVoidCoupon, ApiError, errText, staffListCoupons, staffLookup, staffRedeem, type CouponFilters } from '../lib/api';
import type { CouponStatus, Prize, StaffCoupon } from '../lib/types';
import { downloadText, fmtMoney, fmtShort, fmtWeek, groupCode, KIND_LABEL, mondayOf, safeUrl, toCsv, valueLabel, zonedMidnightIso } from '../lib/format';
import { Alert, Field, Modal, Pagination, Spinner, StatusBadge } from '../components/ui';
import { QrScanner } from '../components/QrScanner';
import { IconCheck, IconGift, IconScan } from '../components/icons';

const LIMIT = 20;

function CouponDetail({ c, tz, onRedeem, onVoid, busy, isAdmin }: {
  c: StaffCoupon; tz: string; busy: boolean; isAdmin: boolean; onRedeem: () => void; onVoid: () => void;
}) {
  const img = safeUrl(c.prize_image_url);
  const val = valueLabel(c.prize_kind, c.prize_value, c.prize_name);
  const st = c.effective_status;
  const banner = st === 'pending'
    ? { cls: 'border-emerald-500 bg-emerald-50 text-emerald-900', text: 'Listo para canjear' }
    : st === 'redeemed'
      ? { cls: 'border-red-500 bg-red-50 text-red-900', text: `YA CANJEADO el ${fmtShort(c.redeemed_at, tz)}${c.redeemed_by_name ? ` · atendió ${c.redeemed_by_name}` : ''}` }
      : st === 'expired'
        ? { cls: 'border-amber-500 bg-amber-50 text-amber-900', text: `VENCIDO el ${fmtShort(c.expires_at, tz)}` }
        : { cls: 'border-red-500 bg-red-50 text-red-900', text: `ANULADO${c.void_reason ? `: ${c.void_reason}` : ''}` };
  return (
    <div className="card overflow-hidden">
      <div className={`border-b-2 px-4 py-2.5 text-sm font-bold ${banner.cls}`} role="status">{banner.text}</div>
      <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr]">
        {img
          ? <img src={img} alt="" width={96} height={96} className="h-24 w-24 rounded-xl border border-line object-cover" />
          : <span className="inline-flex h-24 w-24 items-center justify-center rounded-xl bg-surface-2 text-dim" aria-hidden="true"><IconGift width={36} height={36} /></span>}
        <div className="min-w-0 space-y-1">
          <p className="font-display text-xl font-semibold leading-tight">{c.prize_name}{val ? ` · ${val}` : ''}</p>
          <p className="text-sm text-dim">{KIND_LABEL[c.prize_kind]}{c.prize_description ? ` — ${c.prize_description}` : ''}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-semibold">Cliente</dt><dd>{c.owner.name ?? '—'} <span className="text-dim">({c.owner.email ?? '—'})</span></dd>
            <dt className="font-semibold">Código</dt><dd className="font-mono tracking-wider">{groupCode(c.code)}</dd>
            <dt className="font-semibold">Estado</dt><dd><StatusBadge status={st} /></dd>
            <dt className="font-semibold">Vence</dt><dd>{fmtShort(c.expires_at, tz)}</dd>
            <dt className="font-semibold">Giro</dt><dd>{fmtShort(c.created_at, tz)} · {c.spin_origin === 'base' ? 'base' : 'extra'}</dd>
          </dl>
          {c.prize_conditions && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"><strong>Condiciones:</strong> {c.prize_conditions}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line p-3">
        {st === 'pending' && <button className="btn btn-primary !min-h-12 flex-1 text-base" disabled={busy} onClick={onRedeem}><IconCheck width={18} height={18} /> Canjear premio…</button>}
        {isAdmin && (st === 'pending' || st === 'redeemed') && <button className="btn btn-ghost" disabled={busy} onClick={onVoid}>Anular…</button>}
      </div>
    </div>
  );
}

export default function RedeemPage({ isAdmin }: { isAdmin: boolean }) {
  const { pub } = useApp();
  const toast = useToast();
  const tz = pub?.campaign?.timezone ?? 'America/Mexico_City';
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<StaffCoupon | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [voiding, setVoiding] = useState<StaffCoupon | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [restock, setRestock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<StaffCoupon | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Tabla
  const [filters, setFilters] = useState({ status: '', search: '', prizeId: '', from: '', to: '', week: '' });
  const [offset, setOffset] = useState(0);
  const [table, setTable] = useState<{ total: number; rows: StaffCoupon[] } | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);

  const apiFilters = useCallback((o: number, limit = LIMIT): CouponFilters => ({
    status: filters.status || null, search: filters.search || null, prizeId: filters.prizeId || null,
    from: filters.from ? zonedMidnightIso(filters.from, tz) : null,
    to: filters.to ? zonedMidnightIso(new Date(Date.parse(`${filters.to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), tz) : null,
    week: filters.week ? mondayOf(filters.week) : null, limit, offset: o,
  }), [filters, tz]);

  const loadTable = useCallback(async (o: number) => {
    try { setTable(await staffListCoupons(apiFilters(o))); setTableError(null); }
    catch (e) { setTableError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
  }, [apiFilters]);

  useEffect(() => { void loadTable(offset); }, [offset, loadTable]);
  useEffect(() => {
    if (isAdmin) void adminGetConfig().then((c) => setPrizes(c.prizes)).catch(() => {});
  }, [isAdmin]);

  const lookup = useCallback(async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    setLooking(true); setLookupError(null); setDone(null);
    try {
      const r = await staffLookup(c);
      if (r.ok) { setFound(r.coupon); setCode(''); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else { setFound(null); setLookupError(errText(r.error)); }
    } catch (e) { setLookupError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
    finally { setLooking(false); }
  }, []);

  // Un QR abierto con la cámara del teléfono llega como ?codigo=XXXX (solo localiza; no canjea).
  useEffect(() => {
    const c = params.get('codigo');
    if (c) { void lookup(c); setParams({}, { replace: true }); }
  }, [params, lookup, setParams]);

  const doRedeem = async () => {
    if (!found) return;
    setBusy(true);
    try {
      const r = await staffRedeem(found.id);
      if (r.ok) { setDone(r.coupon); setFound(null); toast('Premio canjeado', 'ok'); void loadTable(offset); }
      else {
        toast(errText(r.error), 'error');
        const again = await staffLookup(found.code); if (again.ok) setFound(again.coupon);
      }
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setBusy(false); setConfirm(false); }
  };

  const doVoid = async () => {
    if (!voiding) return;
    setBusy(true);
    try {
      const r = await adminVoidCoupon(voiding.id, voidReason, restock);
      if (r.ok) { toast('Cupón anulado', 'ok'); setVoiding(null); setVoidReason(''); setRestock(false); setFound(null); void loadTable(offset); }
      else toast(errText(r.error), 'error');
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setBusy(false); }
  };

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: StaffCoupon[] = [];
      for (let o = 0; o < 20000; o += 200) {
        const page = await staffListCoupons(apiFilters(o, 200));
        rows.push(...page.rows);
        if (rows.length >= page.total || page.rows.length === 0) break;
      }
      downloadText(`canjes-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
        ['Código', 'Cliente', 'Correo', 'Premio', 'Tipo', 'Valor', 'Fecha del giro', 'Semana', 'Origen', 'Vence', 'Estado', 'Fecha del canje', 'Canjeado por', 'Motivo de anulación', 'Costo estimado'],
        ...rows.map((r) => [r.code, r.owner.name, r.owner.email, r.prize_name, KIND_LABEL[r.prize_kind], r.prize_value, fmtShort(r.created_at, tz), r.week_start,
          r.spin_origin === 'base' ? 'Base' : 'Extra', fmtShort(r.expires_at, tz), r.effective_status, r.redeemed_at ? fmtShort(r.redeemed_at, tz) : '', r.redeemed_by_name, r.void_reason, r.est_cost]),
      ]));
      toast(`Exportadas ${rows.length} filas`, 'ok');
    } catch (e) { toast(e instanceof Error ? e.message : 'Error al exportar', 'error'); }
    finally { setExporting(false); }
  };

  const onScan = useCallback((c: string) => { setScanning(false); void lookup(c); }, [lookup]);
  const set = (k: keyof typeof filters, v: string) => { setOffset(0); setFilters((f) => ({ ...f, [k]: v })); };
  const hasFilter = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div ref={topRef}>
        <h1 className="font-display text-2xl font-semibold">Canjear un premio</h1>
        <p className="text-sm text-dim">Escanea el QR del cliente o escribe el código. Buscar un código nunca lo canjea: el canje se confirma aparte.</p>
      </div>

      <form className="card flex flex-col gap-3 p-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void lookup(code); }}>
        <input className="input flex-1 font-mono text-lg uppercase tracking-widest" aria-label="Código del premio" placeholder="XXXX-XXXX-XXXX" value={code}
          autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1 sm:flex-none" disabled={looking || !code.trim()}>{looking ? <Spinner label="Buscando" /> : 'Buscar'}</button>
          <button type="button" className="btn btn-ghost flex-1 sm:flex-none" onClick={() => setScanning(true)}><IconScan width={18} height={18} /> Escanear QR</button>
        </div>
      </form>

      {lookupError && <Alert kind="error">{lookupError}</Alert>}
      {done && (
        <Alert kind="ok"><strong>¡Canje registrado!</strong> Entrega: {done.prize_name} a {done.owner.name ?? done.owner.email}. Código {groupCode(done.code)}.</Alert>
      )}
      {found && <CouponDetail c={found} tz={tz} busy={busy} isAdmin={isAdmin} onRedeem={() => setConfirm(true)} onVoid={() => setVoiding(found)} />}

      <section aria-labelledby="ganadores-h" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="ganadores-h" className="font-display text-xl font-semibold">Ganadores y canjes</h2>
          {isAdmin && <button className="btn btn-ghost btn-sm" disabled={exporting || !table?.total} onClick={() => void exportCsv()}>{exporting ? 'Exportando…' : 'Exportar CSV'}</button>}
        </div>

        <div className="card grid grid-cols-2 gap-3 p-3 lg:grid-cols-6">
          <Field label="Buscar" className="col-span-2" hint={isAdmin ? 'Nombre, correo o código' : 'Nombre o código'}>
            {(id) => <input id={id} className="input" value={filters.search} onChange={(e) => set('search', e.target.value)} placeholder="Buscar…" />}
          </Field>
          <Field label="Estado">
            {(id) => (
              <select id={id} className="input" value={filters.status} onChange={(e) => set('status', e.target.value)}>
                <option value="">Todos</option><option value="pending">Pendiente</option><option value="redeemed">Canjeado</option>
                <option value="expired">Vencido</option><option value="void">Anulado</option>
              </select>
            )}
          </Field>
          {isAdmin && (
            <Field label="Premio">
              {(id) => (
                <select id={id} className="input" value={filters.prizeId} onChange={(e) => set('prizeId', e.target.value)}>
                  <option value="">Todos</option>
                  {prizes.filter((p) => p.kind !== 'no_prize' && p.kind !== 'extra_spin').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </Field>
          )}
          <Field label="Desde">{(id) => <input id={id} type="date" className="input" value={filters.from} onChange={(e) => set('from', e.target.value)} />}</Field>
          <Field label="Hasta">{(id) => <input id={id} type="date" className="input" value={filters.to} onChange={(e) => set('to', e.target.value)} />}</Field>
          <Field label="Semana de…" hint="Elige cualquier día de la semana">{(id) => <input id={id} type="date" className="input" value={filters.week} onChange={(e) => set('week', e.target.value)} />}</Field>
          {hasFilter && <div className="flex items-end"><button className="btn btn-ghost btn-sm" onClick={() => { setOffset(0); setFilters({ status: '', search: '', prizeId: '', from: '', to: '', week: '' }); }}>Limpiar filtros</button></div>}
        </div>

        {tableError && <Alert kind="error">{tableError}</Alert>}
        {!table && !tableError && <div className="py-8 text-center"><Spinner /></div>}
        {table && table.rows.length === 0 && <div className="card p-8 text-center text-dim">No hay resultados con estos filtros.</div>}
        {table && table.rows.length > 0 && (
          <div className="card overflow-hidden p-1 max-md:border-0 max-md:bg-transparent max-md:p-0">
            <table className="rtable">
              <caption className="sr-only">Ganadores y canjes</caption>
              <thead><tr><th>Cliente</th><th>Premio</th><th>Giro</th><th>Código</th><th>Vence</th><th>Estado</th><th>Canje</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Cliente"><span className="font-semibold">{r.owner.name ?? '—'}</span><br /><span className="text-xs text-dim">{r.owner.email}</span></td>
                    <td data-label="Premio">{r.prize_name}{r.est_cost != null && <span className="block text-xs text-dim">costo {fmtMoney(r.est_cost)}</span>}</td>
                    <td data-label="Giro">{fmtShort(r.created_at, tz)}<span className="block text-xs text-dim">semana del {fmtWeek(r.week_start)} · {r.spin_origin === 'base' ? 'base' : 'extra'}</span></td>
                    <td data-label="Código" className="font-mono text-xs">{groupCode(r.code)}</td>
                    <td data-label="Vence">{fmtShort(r.expires_at, tz)}</td>
                    <td data-label="Estado"><StatusBadge status={r.effective_status as CouponStatus} />{r.void_reason && <span className="block text-xs text-dim">{r.void_reason}</span>}</td>
                    <td data-label="Canje">{r.redeemed_at ? <>{fmtShort(r.redeemed_at, tz)}<span className="block text-xs text-dim">{r.redeemed_by_name}</span></> : <span className="text-dim">—</span>}</td>
                    <td data-label="">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setFound(r); setDone(null); topRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>
                        {r.effective_status === 'pending' ? 'Canjear' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {table && <Pagination total={table.total} offset={offset} limit={LIMIT} onChange={setOffset} />}
      </section>

      <Modal open={scanning} onClose={() => setScanning(false)} title="Escanear QR del premio">
        <QrScanner onCode={onScan} onClose={() => setScanning(false)} />
      </Modal>

      <Modal open={confirm && !!found} onClose={() => !busy && setConfirm(false)} title="Confirmar canje">
        {found && (
          <div className="space-y-3">
            <p>¿Entregar <strong>{found.prize_name}</strong> a <strong>{found.owner.name ?? found.owner.email}</strong>?</p>
            {found.prize_conditions && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"><strong>Condiciones:</strong> {found.prize_conditions}</p>}
            <p className="text-sm text-dim">Esta acción se registra a tu nombre y no se puede repetir.</p>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button>
              <button className="btn btn-primary flex-1" disabled={busy} onClick={() => void doRedeem()}>{busy ? 'Canjeando…' : 'Sí, canjear'}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!voiding} onClose={() => !busy && setVoiding(null)} title="Anular cupón">
        {voiding && (
          <div className="space-y-3">
            <p className="text-sm">Se anulará <strong>{voiding.prize_name}</strong> ({groupCode(voiding.code)}). El registro se conserva con tu motivo.</p>
            <Field label="Motivo (obligatorio)">{(id) => <textarea id={id} className="input" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Ej.: emitido por error, canje equivocado…" />}</Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-5 w-5" /> Devolver la unidad al inventario</label>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => setVoiding(null)}>Cancelar</button>
              <button className="btn btn-danger flex-1" disabled={busy || voidReason.trim().length < 5} onClick={() => void doVoid()}>Anular</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
