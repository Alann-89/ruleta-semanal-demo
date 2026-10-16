import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminGetConfig, adminSaveOutcomes, adminSimulate, ApiError, errText } from '../lib/api';
import type { AdminConfig, Prize, PrizeKind, Sector, SimulationResult } from '../lib/types';
import { fmtMoney, fmtPct, KIND_LABEL, safeUrl, uuid } from '../lib/format';
import { uploadImage } from '../lib/media';
import { Alert, Field, Modal, PageLoader, Spinner } from '../components/ui';
import { Wheel, type WheelHandle } from '../components/Wheel';
import { IconArrowDown, IconArrowUp, IconCheck } from '../components/icons';
import { useToast } from '../context/Toast';
import { useApp } from '../context/AppContext';
import { sfx, unlockAudio } from '../lib/sound';

type Item = Prize & { _key: string };
const KINDS = Object.keys(KIND_LABEL) as PrizeKind[];
const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#84cc16'];

const blank = (order: number): Item => ({
  _key: uuid(), name: '', description: '', image_url: null, kind: 'product', value: 0, sector_label: '',
  color: PALETTE[order % PALETTE.length], sort_order: order, probability: 0, stock: null, est_cost: 0,
  conditions: '', coupon_valid_days: 30, daily_limit: null, weekly_limit: null, total_limit: null, is_active: false, archived_at: null,
});

const toItem = (p: Prize): Item => ({ ...p, _key: p.id ?? uuid(), probability: Number(p.probability), value: Number(p.value), est_cost: Number(p.est_cost) });
const strip = (i: Item): Prize => {
  const { _key, ...rest } = i; void _key;
  return { ...rest, archived: !!i.archived_at, image_url: i.image_url || '', description: i.description || '', conditions: i.conditions || '' };
};

function NumInput({ id, value, onChange, nullable = false, step = 1, min = 0, max, placeholder, suffix }: {
  id: string; value: number | null; onChange: (v: number | null) => void; nullable?: boolean; step?: number; min?: number; max?: number; placeholder?: string; suffix?: string;
}) {
  return (
    <div className="relative">
      <input id={id} type="number" inputMode="decimal" className={`input ${suffix ? 'pr-9' : ''}`} min={min} max={max} step={step} placeholder={placeholder}
        value={value ?? ''} onChange={(e) => { const v = e.target.value; onChange(v === '' ? (nullable ? null : 0) : Number(v)); }} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-dim">{suffix}</span>}
    </div>
  );
}

function PrizeEditor({ it, onChange, onMove, onArchive, canUp, canDown }: {
  it: Item; onChange: (p: Partial<Item>) => void; onMove: (d: -1 | 1) => void; onArchive: () => void; canUp: boolean; canDown: boolean;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const redeemable = it.kind !== 'no_prize' && it.kind !== 'extra_spin';
  const img = safeUrl(it.image_url);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try { onChange({ image_url: await uploadImage(f, 'prizes', 640) }); toast('Imagen subida y comprimida', 'ok'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo subir la imagen', 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="space-y-4 border-t border-line p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">{(id) => <input id={id} className="input" value={it.name} maxLength={80} onChange={(e) => onChange({ name: e.target.value })} placeholder="Ej.: Playera de la tienda" />}</Field>
        <Field label="Texto del sector" hint={`${it.sector_label.length}/24 · se muestra sobre la ruleta`}>
          {(id) => <input id={id} className="input" value={it.sector_label} maxLength={24} onChange={(e) => onChange({ sector_label: e.target.value })} placeholder="Ej.: Playera" />}
        </Field>
        <Field label="Tipo de premio">
          {(id) => (
            <select id={id} className="input" value={it.kind} onChange={(e) => onChange({ kind: e.target.value as PrizeKind })}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          )}
        </Field>
        {(it.kind === 'percent_discount' || it.kind === 'fixed_discount') && (
          <Field label={it.kind === 'percent_discount' ? 'Porcentaje de descuento' : 'Importe del descuento'}>
            {(id) => <NumInput id={id} value={it.value} onChange={(v) => onChange({ value: v ?? 0 })} step={it.kind === 'percent_discount' ? 1 : 0.5} max={it.kind === 'percent_discount' ? 100 : undefined} suffix={it.kind === 'percent_discount' ? '%' : '$'} />}
          </Field>
        )}
        <Field label="Probabilidad (%)" hint="Los resultados activos deben sumar exactamente 100 %">
          {(id) => <NumInput id={id} value={it.probability} onChange={(v) => onChange({ probability: v ?? 0 })} step={0.001} max={100} suffix="%" />}
        </Field>
        {it.kind !== 'no_prize' && (
          <Field label="Costo estimado para la tienda" hint="Se usa en estadísticas, calculadora y presupuesto">
            {(id) => <NumInput id={id} value={it.est_cost} onChange={(v) => onChange({ est_cost: v ?? 0 })} step={0.5} suffix="$" />}
          </Field>
        )}
      </div>

      <Field label="Descripción" hint="Aparece en el resultado y en «Mis premios»">
        {(id) => <textarea id={id} className="input" value={it.description ?? ''} maxLength={400} onChange={(e) => onChange({ description: e.target.value })} />}
      </Field>

      {redeemable && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Condiciones de canje" className="sm:col-span-2">
            {(id) => <textarea id={id} className="input" value={it.conditions ?? ''} maxLength={600} onChange={(e) => onChange({ conditions: e.target.value })} placeholder="Ej.: Compra mínima de $300. No acumulable." />}
          </Field>
          <Field label="Vigencia del cupón" hint="Días desde que se gana (incluye el último día completo)">
            {(id) => <NumInput id={id} value={it.coupon_valid_days} min={1} max={365} onChange={(v) => onChange({ coupon_valid_days: v ?? 30 })} suffix="días" />}
          </Field>
        </div>
      )}

      {it.kind !== 'no_prize' && (
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Existencias y límites (vacío = sin límite)</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Existencias">{(id) => <NumInput id={id} value={it.stock} nullable onChange={(v) => onChange({ stock: v })} placeholder="Ilimitado" />}</Field>
            <Field label="Máx. por día">{(id) => <NumInput id={id} value={it.daily_limit} nullable onChange={(v) => onChange({ daily_limit: v })} placeholder="—" />}</Field>
            <Field label="Máx. por semana">{(id) => <NumInput id={id} value={it.weekly_limit} nullable onChange={(v) => onChange({ weekly_limit: v })} placeholder="—" />}</Field>
            <Field label="Máx. en la campaña">{(id) => <NumInput id={id} value={it.total_limit} nullable onChange={(v) => onChange({ total_limit: v })} placeholder="—" />}</Field>
          </div>
          <p className="mt-2 text-xs text-dim">Cuando se agota, su probabilidad pasa a «Sin premio» según la política de la campaña. Nunca se entrega una unidad inexistente.</p>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Color del sector">
          {(id) => (
            <div className="flex items-center gap-2">
              <input id={id} type="color" className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-transparent p-1" value={/^#[0-9a-f]{6}$/i.test(it.color) ? it.color : '#ff7a1a'} onChange={(e) => onChange({ color: e.target.value })} />
              <input aria-label="Color en hexadecimal" className="input w-32 font-mono" value={it.color} maxLength={7} onChange={(e) => onChange({ color: e.target.value })} />
              <div className="flex flex-wrap gap-1" aria-hidden="true">{PALETTE.map((c) => <button key={c} type="button" tabIndex={-1} className="h-6 w-6 rounded-full border border-black/20" style={{ background: c }} onClick={() => onChange({ color: c })} />)}</div>
            </div>
          )}
        </Field>
        <Field label="Imagen del premio" hint="JPG, PNG o WebP. Se redimensiona (640 px) y se comprime a WebP (< 480 KB).">
          {(id) => (
            <div className="flex items-center gap-3">
              {img ? <img src={img} alt="" className="h-14 w-14 rounded-lg border border-line object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line text-xs text-dim">Sin imagen</span>}
              <input ref={fileRef} id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
              <label htmlFor={id} className="btn btn-ghost btn-sm cursor-pointer">{uploading ? <Spinner label="Subiendo" /> : img ? 'Cambiar' : 'Subir imagen'}</label>
              {img && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ image_url: null })}>Quitar</button>}
            </div>
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" disabled={!canUp} onClick={() => onMove(-1)} aria-label="Subir en el orden de la ruleta"><IconArrowUp width={16} height={16} /> Subir</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!canDown} onClick={() => onMove(1)} aria-label="Bajar en el orden de la ruleta"><IconArrowDown width={16} height={16} /> Bajar</button>
        </div>
        <button type="button" className="btn btn-ghost btn-sm text-bad" onClick={onArchive}>Archivar</button>
      </div>
    </div>
  );
}

function TestModal({ open, onClose, sectors, dirty, storeName }: { open: boolean; onClose: () => void; sectors: Sector[]; dirty: boolean; storeName: string }) {
  const wheel = useRef<WheelHandle>(null);
  const { config } = useApp();
  const [res, setRes] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hi, setHi] = useState<number | null>(null);
  useEffect(() => { if (open) { setRes(null); setErr(null); setHi(null); } }, [open]);

  const run = async () => {
    unlockAudio(); setBusy(true); setErr(null); setHi(null);
    try {
      const r = await adminSimulate();
      if (!r.ok) { setErr(errText(r.error)); return; }
      const idx = sectors.findIndex((s) => s.id === r.prize.id);
      await wheel.current?.spinTo(Math.max(0, idx), {
        reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        durationMs: 3600, turns: 4, offset: (Math.random() * 2 - 1) * 0.3, onTick: sfx.tick,
      });
      setHi(idx); setRes(r);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Probar la ruleta (sin consumir nada)" wide>
      <div className="space-y-3">
        <Alert kind="info"><strong>MODO PRUEBA.</strong> Usa la misma lógica del servidor, pero no consume giros, inventario ni presupuesto, no crea cupones y no aparece en las estadísticas.</Alert>
        {dirty && <Alert kind="warn">Tienes cambios sin guardar: la prueba usa la configuración <strong>guardada</strong>.</Alert>}
        <div className="theme-scope mx-auto max-w-sm rounded-2xl bg-[#150f2e] px-4 pb-4 pt-8 text-white" style={{ ['--c-accent' as string]: config.theme.accent }}>
          <Wheel ref={wheel} sectors={sectors} placeholder={sectors.length < 2} highlight={hi} logoUrl={config.store.logo_url} storeName={storeName} />
        </div>
        <button className="btn btn-primary w-full" disabled={busy || sectors.length < 2} onClick={() => void run()}>{busy ? 'Girando…' : 'Girar (prueba)'}</button>
        {err && <Alert kind="error">{err}</Alert>}
        {res && (
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2"><span className="badge badge-info mr-2">PRUEBA</span>Resultado: <strong>{res.prize.name}</strong> ({KIND_LABEL[res.prize.kind]})</p>
            <table className="rtable"><thead><tr><th>Resultado</th><th>Configurada</th><th>Efectiva ahora</th><th>Disponible</th></tr></thead>
              <tbody>{res.effective.map((e) => (
                <tr key={e.prize_id}><td data-label="Resultado">{e.name}</td><td data-label="Configurada">{fmtPct(e.configured, 3)}</td><td data-label="Efectiva ahora">{fmtPct(e.effective, 3)}</td><td data-label="Disponible">{e.available ? 'Sí' : 'Agotado / límite'}</td></tr>
              ))}</tbody></table>
            <p className="mt-2 text-xs text-dim">La probabilidad efectiva refleja existencias, límites y presupuesto de este instante, según la política de agotamiento.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Revisa los resultados antes de enviarlos, para avisar cuál falla y por qué. */
function validateItems(list: Item[]): { msgs: string[]; firstKey: string | null } {
  const msgs: string[] = [];
  let firstKey: string | null = null;
  list.filter((i) => !i.archived_at).forEach((i, n) => {
    const name = i.name.trim();
    const who = name ? `«${name}»` : `El resultado n.º ${n + 1}`;
    const bad = (m: string) => { msgs.push(`${who}: ${m}`); firstKey ??= i._key; };
    if (!name) bad('escribe un nombre.');
    else if (i.name.length > 80) bad('el nombre admite hasta 80 caracteres.');
    if (!i.sector_label.trim()) bad('escribe el texto que se verá sobre la ruleta.');
    else if (i.sector_label.length > 24) bad('el texto del sector admite hasta 24 caracteres.');
    if (i.kind === 'percent_discount' && Number(i.value) > 100) bad('un descuento en % no puede pasar de 100.');
  });
  return { msgs, firstKey };
}

/** Traduce los rechazos técnicos de la base de datos a un aviso comprensible. */
const DB_HINTS: Record<string, string> = {
  prizes_name_check: 'Hay un resultado sin nombre (o con más de 80 caracteres). Revisa que todos tengan nombre.',
  prizes_sector_label_check: 'Hay un resultado sin texto de sector (o con más de 24 caracteres).',
  prizes_image_url_check: 'Una imagen no es válida: debe ser una URL https.',
  prizes_color_check: 'Un color no es válido (usa el formato #RRGGBB).',
  prizes_percent_range: 'Un descuento en % no puede pasar de 100.',
  prizes_probability_check: 'Una probabilidad debe estar entre 0 y 100.',
  prizes_coupon_valid_days_check: 'La vigencia del cupón debe estar entre 1 y 365 días.',
  prizes_description_check: 'Una descripción pasa de 400 caracteres.',
  prizes_conditions_check: 'Unas condiciones pasan de 600 caracteres.',
};
const friendlyDbError = (msg: string) => {
  const m = /constraint "([a-z_]+)"/.exec(msg);
  return (m && DB_HINTS[m[1]]) || msg;
};

export default function PrizesPage() {
  const toast = useToast();
  const { config: site } = useApp();
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [saved, setSaved] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await adminGetConfig();
      const list = c.prizes.map(toItem);
      setCfg(c); setItems(list); setSaved(JSON.stringify(list.map(strip))); setErrors(c.errors); setLoadError(null);
    } catch (e) { setLoadError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => saved !== '' && JSON.stringify(items.map(strip)) !== saved, [items, saved]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const live = items.filter((i) => !i.archived_at);
  const archived = items.filter((i) => i.archived_at);
  const sum = live.filter((i) => i.is_active).reduce((a, i) => a + Number(i.probability || 0), 0);
  const sumOk = Math.abs(sum - 100) < 0.0005;
  const patch = (key: string, p: Partial<Item>) => setItems((l) => l.map((i) => (i._key === key ? { ...i, ...p } : i)));

  const move = (key: string, d: -1 | 1) => setItems((l) => {
    const order = l.filter((i) => !i.archived_at);
    const idx = order.findIndex((i) => i._key === key), j = idx + d;
    if (j < 0 || j >= order.length) return l;
    [order[idx], order[j]] = [order[j], order[idx]];
    const rank = new Map(order.map((i, n) => [i._key, n]));
    return l.map((i) => (rank.has(i._key) ? { ...i, sort_order: (rank.get(i._key) as number) * 10 } : i)).sort((a, b) => a.sort_order - b.sort_order);
  });

  const balance = () => {
    const np = live.find((i) => i.is_active && i.kind === 'no_prize');
    if (!np) { toast('Activa un resultado «Sin premio» para poder ajustarlo.', 'error'); return; }
    const others = live.filter((i) => i.is_active && i._key !== np._key).reduce((a, i) => a + Number(i.probability || 0), 0);
    patch(np._key, { probability: Math.round((100 - others) * 1000) / 1000 });
  };

  const save = async () => {
    if (!cfg) return;
    const check = validateItems(items);
    if (check.msgs.length > 0) {
      setErrors(check.msgs); setOpen(check.firstKey);
      toast('Completa los datos que faltan antes de guardar', 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true); setErrors([]);
    const payload = items.map((i, n) => strip({ ...i, sort_order: i.archived_at ? i.sort_order : n * 10 }));
    try {
      const r = await adminSaveOutcomes(cfg.campaign.id, payload);
      const list = r.prizes.map(toItem);
      await load();
      setItems(list); setSaved(JSON.stringify(list.map(strip)));
      toast('Resultados guardados', 'ok');
    } catch (e) {
      if (e instanceof ApiError) { setErrors(e.validation.length ? e.validation : [friendlyDbError(e.message)]); toast('No se guardó: revisa los avisos', 'error'); }
      else toast('Error inesperado', 'error');
    } finally { setSaving(false); }
  };

  const savedSectors: Sector[] = useMemo(() => (cfg?.prizes ?? []).filter((p) => p.is_active && !p.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order).map((p) => ({ id: p.id as string, name: p.name, label: p.sector_label, color: p.color, image_url: p.image_url, kind: p.kind })), [cfg]);

  if (loadError) return <Alert kind="error">{loadError}</Alert>;
  if (!cfg) return <PageLoader />;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Resultados de la ruleta</h1>
          <p className="text-sm text-dim">Todos los sectores tienen el mismo tamaño en la ruleta; la probabilidad real la defines aquí.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setTesting(true)}>Probar</button>
          <button className="btn btn-ghost" onClick={() => { const n = blank(items.length); setItems((l) => [...l, n]); setOpen(n._key); }}>+ Agregar</button>
        </div>
      </div>

      {cfg.campaign.status === 'active' && <Alert kind="info">La campaña está <strong>activa</strong>: al guardar se valida la configuración completa y se rechaza si es inválida (nada se aplica a medias).</Alert>}
      {errors.length > 0 && <Alert kind="error"><ul className="list-disc space-y-1 pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>}

      <div className={`card sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${sumOk ? 'border-ok' : 'border-bad'}`} role="status" aria-live="polite">
        <div>
          <p className="text-sm text-dim">Suma de probabilidades (resultados activos)</p>
          <p className={`font-display text-2xl font-semibold ${sumOk ? 'text-ok' : 'text-bad'}`}><span className="inline-flex items-center gap-2">{fmtPct(sum, 3)} {sumOk ? <IconCheck width={22} height={22} aria-label="Suma correcta" /> : `· faltan ${fmtPct(100 - sum, 3)}`}</span></p>
        </div>
        <div className="flex gap-2">
          {!sumOk && <button className="btn btn-ghost btn-sm" onClick={balance}>Completar con «Sin premio»</button>}
          <button className="btn btn-primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}</button>
        </div>
      </div>

      <ul className="space-y-3">
        {live.map((it, n) => {
          const isOpen = open === it._key;
          return (
            <li key={it._key} className={`card overflow-hidden ${it.is_active ? '' : 'opacity-75'}`}>
              <div className="flex items-center gap-3 p-3">
                <span className="h-9 w-9 shrink-0 rounded-lg border border-black/10" style={{ background: it.color }} aria-hidden="true" />
                <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it._key)}>
                  <span className="block truncate font-semibold">{it.name || <em className="text-dim">Sin nombre</em>}</span>
                  <span className="block truncate text-xs text-dim">
                    {KIND_LABEL[it.kind]} · {fmtPct(Number(it.probability), 3)}
                    {it.kind !== 'no_prize' && <> · {it.stock == null ? 'existencias ilimitadas' : `${it.stock} en existencia`} · costo {fmtMoney(it.est_cost)}</>}
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-dim sm:inline">{it.is_active ? 'Activo' : 'Inactivo'}</span>
                  <button type="button" role="switch" aria-checked={it.is_active} aria-label={`${it.name || 'Resultado'} activo`} onClick={() => patch(it._key, { is_active: !it.is_active })}
                    className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${it.is_active ? 'border-transparent bg-btn' : 'border-line bg-surface-2'}`}>
                    <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${it.is_active ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
              {isOpen && (
                <PrizeEditor it={it} onChange={(p) => patch(it._key, p)} onMove={(d) => move(it._key, d)} canUp={n > 0} canDown={n < live.length - 1}
                  onArchive={() => { patch(it._key, { archived_at: new Date().toISOString(), is_active: false }); setOpen(null); }} />
              )}
            </li>
          );
        })}
      </ul>
      {live.length === 0 && <div className="card p-8 text-center text-dim">Aún no hay resultados. Agrega al menos dos, incluido uno de tipo «Sin premio».</div>}

      {archived.length > 0 && (
        <details className="card p-3">
          <summary className="cursor-pointer text-sm font-semibold">Archivados ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-line text-sm">
            {archived.map((a) => (
              <li key={a._key} className="flex items-center justify-between gap-3 py-2">
                <span>{a.name || 'Sin nombre'} <span className="text-xs text-dim">({KIND_LABEL[a.kind]})</span></span>
                <button className="btn btn-ghost btn-sm" onClick={() => patch(a._key, { archived_at: null })}>Restaurar</button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-dim">Los premios archivados no se pueden borrar: los cupones y giros ya otorgados conservan su historia.</p>
        </details>
      )}

      <TestModal open={testing} onClose={() => setTesting(false)} sectors={savedSectors} dirty={dirty} storeName={site.store.name} />
    </div>
  );
}
