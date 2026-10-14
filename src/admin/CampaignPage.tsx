import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminGetConfig, adminUpdateCampaign, ApiError } from '../lib/api';
import type { AdminConfig, Campaign, CampaignStatus } from '../lib/types';
import { fmtMoney, isoToZonedLocal, zonedLocalToIso } from '../lib/format';
import { Alert, Field, Modal, PageLoader, Switch } from '../components/ui';
import { useToast } from '../context/Toast';
import { useApp } from '../context/AppContext';

const STATUS_TEXT: Record<CampaignStatus, string> = { draft: 'Borrador (aún no visible para participar)', active: 'Activa', paused: 'En pausa', closed: 'Cerrada' };
const ZONES = ['America/Mexico_City', 'America/Cancun', 'America/Monterrey', 'America/Merida', 'America/Chihuahua', 'America/Mazatlan', 'America/Hermosillo', 'America/Tijuana', 'America/Bogota', 'America/Lima', 'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'UTC'];

function nullableNum(v: string): number | null { return v === '' ? null : Number(v); }

export default function CampaignPage() {
  const toast = useToast();
  const { refreshPublic } = useApp();
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [form, setForm] = useState<Campaign | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { status: CampaignStatus; title: string; text: string }>(null);

  const load = useCallback(async () => {
    try { const c = await adminGetConfig(); setCfg(c); setForm(c.campaign); setErrors([]); }
    catch (e) { setLoadError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => !!cfg && !!form && JSON.stringify(cfg.campaign) !== JSON.stringify(form), [cfg, form]);
  if (loadError) return <Alert kind="error">{loadError}</Alert>;
  if (!cfg || !form) return <PageLoader />;
  const set = <K extends keyof Campaign>(k: K, v: Campaign[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const tz = form.timezone;

  const apply = async (patch: Record<string, unknown>, okMsg: string) => {
    setSaving(true); setErrors([]);
    try { await adminUpdateCampaign(form.id, patch); toast(okMsg, 'ok'); await load(); void refreshPublic(); }
    catch (e) { if (e instanceof ApiError) { setErrors(e.validation.length ? e.validation : [e.message]); toast('No se aplicó el cambio', 'error'); } }
    finally { setSaving(false); setConfirm(null); }
  };

  const save = () => apply({
    name: form.name, timezone: form.timezone, starts_at: form.starts_at ?? '', ends_at: form.ends_at ?? '',
    require_participation_code: form.require_participation_code, max_extra_spins_per_week: form.max_extra_spins_per_week,
    extra_spin_valid_days: form.extra_spin_valid_days, depletion_policy: form.depletion_policy, budget_max: form.budget_max ?? '',
    max_prizes_per_day: form.max_prizes_per_day ?? '', max_prizes_per_week: form.max_prizes_per_week ?? '', max_prizes_total: form.max_prizes_total ?? '',
  }, 'Configuración guardada');

  const status = cfg.campaign.status;
  const budgetPct = form.budget_max ? Math.min(100, (Number(form.budget_committed) / Number(form.budget_max)) * 100) : 0;
  const zones = ZONES.includes(tz) ? ZONES : [tz, ...ZONES];

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      <div>
        <h1 className="font-display text-2xl font-semibold">Campaña</h1>
        <p className="text-sm text-dim">Estado, reglas de participación, límites y presupuesto.</p>
      </div>

      <section className="card space-y-3 p-4" aria-labelledby="estado-h">
        <h2 id="estado-h" className="font-display text-lg font-semibold">Estado: <span className={status === 'active' ? 'text-ok' : status === 'paused' ? 'text-warn' : ''}>{STATUS_TEXT[status]}</span></h2>
        <div className="flex flex-wrap gap-2">
          {(status === 'draft' || status === 'closed') && <button className="btn btn-primary" disabled={saving} onClick={() => setConfirm({ status: 'active', title: status === 'draft' ? 'Publicar y activar la campaña' : 'Reabrir la campaña', text: 'Se validará la configuración completa (probabilidades = 100 %, resultado «Sin premio», apariencia). Los clientes podrán girar de inmediato.' })}>{status === 'draft' ? 'Activar campaña' : 'Reabrir'}</button>}
          {status === 'active' && <button className="btn btn-ghost" disabled={saving} onClick={() => setConfirm({ status: 'paused', title: 'Pausar la campaña', text: 'Nadie podrá girar mientras esté en pausa. El historial y los premios ganados se conservan y siguen canjeables.' })}>Pausar</button>}
          {status === 'paused' && <button className="btn btn-primary" disabled={saving} onClick={() => setConfirm({ status: 'active', title: 'Reanudar la campaña', text: 'Los clientes podrán volver a girar.' })}>Reanudar</button>}
          {(status === 'active' || status === 'paused') && <button className="btn btn-danger" disabled={saving} onClick={() => setConfirm({ status: 'closed', title: 'Cerrar la participación', text: 'Se cierra la participación. El historial se conserva y los cupones ya otorgados siguen canjeables hasta su vencimiento. Podrás reabrirla después.' })}>Cerrar participación</button>}
        </div>
      </section>

      {errors.length > 0 && <Alert kind="error"><ul className="list-disc space-y-1 pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>}
      {cfg.errors.length > 0 && status !== 'active' && (
        <Alert kind="warn"><strong>Antes de activar corrige:</strong><ul className="mt-1 list-disc space-y-1 pl-5">{cfg.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>
      )}

      <section className="card space-y-4 p-4" aria-labelledby="gen-h">
        <h2 id="gen-h" className="font-display text-lg font-semibold">General</h2>
        <Field label="Nombre interno">{(id) => <input id={id} className="input" value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Zona horaria" hint={status === 'active' ? 'Pausa la campaña para cambiarla: las semanas dependen de ella.' : 'Define cuándo empieza la semana (lunes 00:00).'}>
            {(id) => <select id={id} className="input" value={form.timezone} disabled={status === 'active'} onChange={(e) => set('timezone', e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select>}
          </Field>
          <div />
          <Field label="Inicio (opcional)" hint={`Hora de ${tz}`}>{(id) => <input id={id} type="datetime-local" className="input" value={isoToZonedLocal(form.starts_at, tz)} onChange={(e) => set('starts_at', e.target.value ? zonedLocalToIso(e.target.value, tz) : null)} />}</Field>
          <Field label="Fin (opcional)" hint={`Hora de ${tz}`}>{(id) => <input id={id} type="datetime-local" className="input" value={isoToZonedLocal(form.ends_at, tz)} onChange={(e) => set('ends_at', e.target.value ? zonedLocalToIso(e.target.value, tz) : null)} />}</Field>
        </div>
      </section>

      <section className="card space-y-4 p-4" aria-labelledby="part-h">
        <h2 id="part-h" className="font-display text-lg font-semibold">Participación</h2>
        <p className="text-sm text-dim">Cada cuenta de Google tiene un giro base por semana (de lunes 00:00 a domingo 23:59). Google no garantiza una única cuenta por persona.</p>
        <Switch checked={form.require_participation_code} onChange={(v) => set('require_participation_code', v)} label="Exigir código de participación de la tienda"
          hint="Apagado por omisión. Si lo activas, cada giro base consume un código de un solo uso que entregas en el mostrador (créalos en «Giros extra y códigos»)." />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tope de «Vuelve a girar» por cuenta y semana" hint="Evita cadenas infinitas de giros extra ganados con el premio.">
            {(id) => <input id={id} type="number" min={0} max={20} className="input" value={form.max_extra_spins_per_week} onChange={(e) => set('max_extra_spins_per_week', Number(e.target.value))} />}
          </Field>
          <Field label="Vigencia de un giro extra (días)">
            {(id) => <input id={id} type="number" min={1} max={90} className="input" value={form.extra_spin_valid_days} onChange={(e) => set('extra_spin_valid_days', Number(e.target.value))} />}
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-4" aria-labelledby="dep-h">
        <h2 id="dep-h" className="font-display text-lg font-semibold">Política de agotamiento</h2>
        <p className="text-sm text-dim">Qué pasa con la probabilidad de un premio que se agotó o alcanzó un límite.</p>
        <div className="space-y-2" role="radiogroup" aria-labelledby="dep-h">
          {([
            ['to_no_prize', 'Pasar a «Sin premio» (recomendada)', 'La probabilidad del premio agotado se suma a «Sin premio». Nunca se reparte entre premios más caros, así el costo esperado no sube por sorpresa.'],
            ['redistribute', 'Redistribuir entre los premios disponibles', 'La probabilidad se reparte proporcionalmente entre lo que sigue disponible. Ojo: aumenta la frecuencia de los demás premios, incluidos los más caros.'],
          ] as const).map(([v, t, d]) => (
            <label key={v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${form.depletion_policy === v ? 'border-btn bg-surface-2' : 'border-line'}`}>
              <input type="radio" name="dep" className="mt-1 h-5 w-5" checked={form.depletion_policy === v} onChange={() => set('depletion_policy', v)} />
              <span><span className="block font-semibold">{t}</span><span className="block text-sm text-dim">{d}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section className="card space-y-4 p-4" aria-labelledby="lim-h">
        <h2 id="lim-h" className="font-display text-lg font-semibold">Límites de premios y presupuesto</h2>
        <p className="text-sm text-dim">Topes para toda la campaña (los premios con costo; no cuentan «Sin premio» ni «Vuelve a girar»). Deja vacío para no limitar. Los límites por premio se configuran en «Resultados».</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Máx. premios por día">{(id) => <input id={id} type="number" min={0} className="input" value={form.max_prizes_per_day ?? ''} onChange={(e) => set('max_prizes_per_day', nullableNum(e.target.value))} placeholder="Sin límite" />}</Field>
          <Field label="Máx. premios por semana">{(id) => <input id={id} type="number" min={0} className="input" value={form.max_prizes_per_week ?? ''} onChange={(e) => set('max_prizes_per_week', nullableNum(e.target.value))} placeholder="Sin límite" />}</Field>
          <Field label="Máx. premios en la campaña">{(id) => <input id={id} type="number" min={0} className="input" value={form.max_prizes_total ?? ''} onChange={(e) => set('max_prizes_total', nullableNum(e.target.value))} placeholder="Sin límite" />}</Field>
        </div>
        <Field label="Presupuesto máximo ($)" hint="Suma del costo estimado de los premios otorgados. Al alcanzarlo, los premios con costo dejan de entregarse.">
          {(id) => <input id={id} type="number" min={0} step="0.01" className="input" value={form.budget_max ?? ''} onChange={(e) => set('budget_max', nullableNum(e.target.value))} placeholder="Sin presupuesto máximo" />}
        </Field>
        {form.budget_max != null && (
          <div>
            <div className="mb-1 flex justify-between text-sm"><span>Comprometido: <strong>{fmtMoney(form.budget_committed)}</strong></span><span className="text-dim">de {fmtMoney(form.budget_max)}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-2"><div className={`h-full rounded-full ${budgetPct > 85 ? 'bg-bad' : 'bg-btn'}`} style={{ width: `${budgetPct}%` }} /></div>
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm text-dim" aria-live="polite">{dirty ? 'Tienes cambios sin guardar.' : 'Todo guardado.'}</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={!dirty || saving} onClick={() => setForm(cfg.campaign)}>Descartar</button>
            <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>

      <Modal open={!!confirm} onClose={() => !saving && setConfirm(null)} title={confirm?.title}>
        <div className="space-y-3">
          <p className="text-sm">{confirm?.text}</p>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => setConfirm(null)} disabled={saving}>Cancelar</button>
            <button className={`btn flex-1 ${confirm?.status === 'closed' ? 'btn-danger' : 'btn-primary'}`} disabled={saving}
              onClick={() => confirm && void apply({ status: confirm.status }, 'Estado actualizado')}>Confirmar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
