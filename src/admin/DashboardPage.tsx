import { useEffect, useMemo, useState } from 'react';
import { adminDashboard, adminGetConfig, ApiError } from '../lib/api';
import type { Dashboard, Prize } from '../lib/types';
import { fmtMoney, fmtPct, fmtWeek, KIND_LABEL, zonedMidnightIso } from '../lib/format';
import { Alert, Field, PageLoader } from '../components/ui';
import { useApp } from '../context/AppContext';

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-dim">{label}</p>
      <p className={`font-display mt-1 text-3xl font-semibold ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-dim">{sub}</p>}
    </div>
  );
}

function KpiRow({ title, items, children }: { title: string; items: [string, string | number, string?, ('ok' | 'warn' | 'bad')?][]; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4 p-4 sm:p-5">
      <h2 className="w-full text-xs font-bold uppercase tracking-[0.12em] text-dim">{title}</h2>
      {items.map(([label, value, sub, tone]) => (
        <div key={label} className="min-w-[8rem]">
          <p className={`font-display text-[1.7rem] font-bold leading-none ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : ''}`}>{value}</p>
          <p className="mt-1.5 text-sm font-medium">{label}</p>
          {sub && <p className="text-xs text-dim">{sub}</p>}
        </div>
      ))}
      {children}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{r.label}</span><span className="text-dim">{r.sub}</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${r.label}: ${r.sub ?? r.value}`}>
            <div className="h-full rounded-full bg-btn" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Calculadora de costo esperado a partir de las probabilidades configuradas. */
function CostCalculator({ prizes }: { prizes: Prize[] }) {
  const [weekly, setWeekly] = useState(500);
  const [weeks, setWeeks] = useState(4);
  const [extraPct, setExtraPct] = useState(10);
  const active = prizes.filter((p) => p.is_active && !p.archived_at);
  const sum = active.reduce((a, p) => a + Number(p.probability), 0);
  const spins = Math.round(weekly * weeks * (1 + extraPct / 100));
  const perSpin = active.reduce((a, p) => a + (Number(p.probability) / 100) * Number(p.est_cost), 0);
  const total = perSpin * spins;
  // Intervalo ~95 % del costo (aprox. normal; los ganadores de cada premio son binomiales independientes).
  const variance = active.reduce((a, p) => { const q = Number(p.probability) / 100; return a + spins * q * (1 - q) * Number(p.est_cost) ** 2; }, 0);
  const sd = Math.sqrt(variance);
  return (
    <section className="card space-y-4 p-4" aria-labelledby="calc-h">
      <div>
        <h2 id="calc-h" className="font-display text-xl font-semibold">Calculadora de costo esperado</h2>
        <p className="text-sm text-dim">Estima cuánto podrían costar los premios con las probabilidades y costos que configuraste.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Giros base por semana" hint="Participantes que esperas">{(id) => <input id={id} type="number" min={0} className="input" value={weekly} onChange={(e) => setWeekly(Math.max(0, Number(e.target.value)))} />}</Field>
        <Field label="Semanas">{(id) => <input id={id} type="number" min={1} max={104} className="input" value={weeks} onChange={(e) => setWeeks(Math.max(1, Number(e.target.value)))} />}</Field>
        <Field label="Giros extra adicionales (%)" hint="Vuelve a girar, regalos, códigos">{(id) => <input id={id} type="number" min={0} max={300} className="input" value={extraPct} onChange={(e) => setExtraPct(Math.max(0, Number(e.target.value)))} />}</Field>
      </div>
      {Math.abs(sum - 100) > 0.0005 && <Alert kind="warn">Los resultados activos suman {fmtPct(sum, 3)}; el cálculo usa esos valores tal cual.</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Giros totales estimados" value={spins.toLocaleString('es-MX')} />
        <Stat label="Costo esperado por giro" value={fmtMoney(perSpin)} />
        <Stat label="Costo total esperado" value={fmtMoney(total)} sub={`Rango probable (95 %): ${fmtMoney(Math.max(0, total - 1.96 * sd))} – ${fmtMoney(total + 1.96 * sd)}`} />
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="rtable">
          <caption className="sr-only">Ganadores esperados por resultado</caption>
          <thead><tr><th>Resultado</th><th>Probabilidad</th><th>Ganadores esperados</th><th>Rango (95 %)</th><th>Costo esperado</th></tr></thead>
          <tbody>
            {active.map((p) => {
              const q = Number(p.probability) / 100;
              const mean = spins * q, s = Math.sqrt(spins * q * (1 - q));
              return (
                <tr key={p.id}>
                  <td data-label="Resultado">{p.name} <span className="text-xs text-dim">({KIND_LABEL[p.kind]})</span></td>
                  <td data-label="Probabilidad">{fmtPct(Number(p.probability), 3)}</td>
                  <td data-label="Ganadores esperados">{mean.toFixed(1)}</td>
                  <td data-label="Rango (95 %)">{Math.max(0, Math.round(mean - 1.96 * s))} – {Math.round(mean + 1.96 * s)}</td>
                  <td data-label="Costo esperado">{fmtMoney(mean * Number(p.est_cost))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-dim">
        Las probabilidades no garantizan cantidades exactas de ganadores: el azar puede dar más o menos premios de los esperados (por eso el rango).
        Los giros extra (premio «Vuelve a girar», asignaciones manuales y códigos promocionales) aumentan el número de giros y, con ello, el costo.
        Para limitar el riesgo usa existencias, topes diarios/semanales y el presupuesto máximo de la campaña.
      </p>
    </section>
  );
}

export default function DashboardPage() {
  const { pub } = useApp();
  const tz = pub?.campaign?.timezone ?? 'America/Mexico_City';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const f = from ? zonedMidnightIso(from, tz) : null;
    const t = to ? zonedMidnightIso(new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), tz) : null;
    adminDashboard(f, t).then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e.message : 'Error inesperado.'); });
    return () => { alive = false; };
  }, [from, to, tz]);
  useEffect(() => { void adminGetConfig().then((c) => setPrizes(c.prizes)).catch(() => {}); }, []);

  const budget = data?.campaign?.budget_max;
  const used = Number(data?.campaign?.budget_committed ?? 0);
  const budgetPct = useMemo(() => (budget ? Math.min(100, (used / Number(budget)) * 100) : 0), [budget, used]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <PageLoader />;
  if (!data.campaign) return <Alert kind="warn">Aún no hay una campaña configurada.</Alert>;
  const lowStock = data.stock.filter((s) => s.is_active && s.stock != null && s.stock <= 3);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Resumen · {data.campaign.name}</h1>
          <p className="text-sm text-dim">Estado de la campaña: <strong>{{ draft: 'borrador', active: 'activa', paused: 'en pausa', closed: 'cerrada' }[data.campaign.status]}</strong>. Las pruebas del panel no cuentan en estas cifras.</p>
        </div>
        <div className="flex gap-2">
          <Field label="Desde">{(id) => <input id={id} type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Hasta">{(id) => <input id={id} type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
      </div>

      {lowStock.length > 0 && <Alert kind="warn"><strong>Existencias bajas:</strong> {lowStock.map((s) => `${s.name} (${s.stock})`).join(', ')}.</Alert>}

      <section className="card divide-y divide-line" aria-label="Indicadores">
        <KpiRow title="Participación" items={[
          ['Participantes únicos', data.unique_participants],
          ['Giros base', data.base_spins],
          ['Giros adicionales', data.extra_spins, 'Vuelve a girar, regalos y códigos'],
        ]} />
        <KpiRow title="Premios" items={[
          ['Otorgados', data.prizes_awarded],
          ['Canjeados', data.prizes_redeemed, undefined, 'ok'],
          ['Pendientes', data.prizes_pending, undefined, 'warn'],
          ['Vencidos', data.prizes_expired],
          ['Anulados', data.prizes_void],
        ]} />
        <KpiRow title="Costo estimado" items={[
          ['Otorgado', fmtMoney(data.cost_awarded), 'Premios no anulados'],
          ['Canjeado', fmtMoney(data.cost_redeemed), 'Lo que salió de la tienda'],
        ]}>
          {budget != null && (
            <div className="min-w-[14rem] flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-dim">Presupuesto comprometido</p>
              <p className="font-display mt-1 text-xl font-bold">{fmtMoney(used)} <span className="text-sm font-normal text-dim">de {fmtMoney(budget)}</span></p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(budgetPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Presupuesto usado">
                <div className={`h-full rounded-full ${budgetPct > 85 ? 'bg-bad' : 'bg-btn'}`} style={{ width: `${budgetPct}%` }} />
              </div>
            </div>
          )}
        </KpiRow>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="dist-h">
          <h2 id="dist-h" className="font-display mb-3 text-xl font-semibold">Distribución de resultados</h2>
          {data.distribution.length === 0 ? <p className="text-sm text-dim">Todavía no hay giros.</p>
            : <Bars rows={data.distribution.map((d) => ({ label: d.name, value: d.count, sub: `${d.count} · ${fmtPct(d.pct)}` }))} />}
        </section>
        <section className="card p-4" aria-labelledby="stock-h">
          <h2 id="stock-h" className="font-display mb-3 text-xl font-semibold">Existencias restantes</h2>
          <ul className="divide-y divide-line text-sm">
            {data.stock.map((s) => (
              <li key={s.prize_id} className="flex items-center justify-between gap-3 py-2">
                <span>{s.name} {!s.is_active && <span className="badge badge-expired ml-1">inactivo</span>}</span>
                <span className={`font-semibold ${s.stock != null && s.stock <= 3 ? 'text-bad' : ''}`}>{s.stock == null ? 'Ilimitado' : s.stock}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card p-4" aria-labelledby="weekly-h">
        <h2 id="weekly-h" className="font-display mb-3 text-xl font-semibold">Giros por semana</h2>
        {data.weekly.length === 0 ? <p className="text-sm text-dim">Sin datos.</p> : (
          <Bars rows={data.weekly.map((w) => ({ label: `Semana del ${fmtWeek(w.week_start)}`, value: w.base + w.extra, sub: `${w.base} base + ${w.extra} extra · ${w.participants} personas` }))} />
        )}
      </section>

      <CostCalculator prizes={prizes} />
    </div>
  );
}
