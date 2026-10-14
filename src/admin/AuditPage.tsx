import { useCallback, useEffect, useState } from 'react';
import { adminListAudit, ApiError } from '../lib/api';
import type { AuditRow, Paged } from '../lib/types';
import { fmtShort } from '../lib/format';
import { Alert, Pagination, Spinner } from '../components/ui';
import { useApp } from '../context/AppContext';

const LABEL: Record<string, string> = {
  'coupon.redeem': 'Canje de premio', 'coupon.void': 'Anulación de cupón', 'prize.create': 'Resultado creado', 'prize.update': 'Resultado editado',
  'campaign.update': 'Campaña editada', 'extra_spin.grant': 'Giro extra asignado', 'extra_spin.revoke': 'Giro extra revocado',
  'codes.create': 'Códigos creados', 'codes.deactivate': 'Código desactivado', 'user.set_role': 'Cambio de rol', 'user.block': 'Cuenta bloqueada',
  'user.unblock': 'Cuenta desbloqueada', 'user.anonymize': 'Datos anonimizados', 'config.save_draft': 'Borrador de apariencia guardado',
  'config.publish': 'Apariencia publicada', 'config.discard_draft': 'Borrador descartado',
};

export default function AuditPage() {
  const { pub } = useApp();
  const tz = pub?.campaign?.timezone;
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<AuditRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await adminListAudit(action || null, 25, offset)); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
  }, [action, offset]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Auditoría</h1>
          <p className="text-sm text-dim">Registro permanente de cambios administrativos, canjes y asignaciones. No se puede editar ni borrar.</p>
        </div>
        <select className="input !w-auto" aria-label="Filtrar" value={action} onChange={(e) => { setOffset(0); setAction(e.target.value); }}>
          <option value="">Todo</option><option value="coupon">Canjes y anulaciones</option><option value="prize">Resultados</option><option value="campaign">Campaña</option>
          <option value="extra_spin">Giros extra</option><option value="codes">Códigos</option><option value="user">Usuarios</option><option value="config">Apariencia</option>
        </select>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {!data ? <div className="py-8 text-center"><Spinner /></div> : data.rows.length === 0 ? <div className="card p-8 text-center text-dim">Sin registros.</div> : (
        <div className="card overflow-hidden p-1 max-md:border-0 max-md:bg-transparent max-md:p-0">
          <table className="rtable">
            <caption className="sr-only">Registro de auditoría</caption>
            <thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Fecha" className="whitespace-nowrap">{fmtShort(r.at, tz)}</td>
                <td data-label="Quién">{r.actor_email ?? 'Sistema'}</td>
                <td data-label="Acción"><span className="font-semibold">{LABEL[r.action] ?? r.action}</span><span className="block font-mono text-xs text-dim">{r.action}</span></td>
                <td data-label="Detalle">
                  <details><summary className="cursor-pointer text-sm text-dim">Ver detalle</summary>
                    <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-2 text-xs">{JSON.stringify(r.details, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {data && <Pagination total={data.total} offset={offset} limit={25} onChange={setOffset} />}
    </div>
  );
}
