import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getMyHistory, ApiError } from '../lib/api';
import type { HistoryRow } from '../lib/types';
import { fmtShort, fmtWeek, groupCode } from '../lib/format';
import { Alert, Empty, PageLoader, Pagination, StatusBadge } from '../components/ui';
import { PageTitle } from '../components/Layout';
import { LoginGate } from './LoginGate';

const LIMIT = 15;

export default function HistoryPage() {
  const { session, authReady, pub } = useApp();
  const [data, setData] = useState<{ total: number; rows: HistoryRow[] } | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tz = pub?.campaign?.timezone;

  const load = useCallback(async (o: number) => {
    try { setData(await getMyHistory(LIMIT, o)); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
  }, []);
  useEffect(() => { if (session) void load(offset); }, [session, offset, load]);

  if (!authReady) return <PageLoader />;
  if (!session) return <LoginGate title="Historial" text="Inicia sesión para ver tus participaciones." />;

  return (
    <>
      <PageTitle sub="Todas tus participaciones. El reinicio semanal habilita un nuevo giro; nunca borra tu historial.">Historial de participaciones</PageTitle>
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}
      {!data && !error && <PageLoader />}
      {data && data.rows.length === 0 && <Empty title="Todavía no has girado">Tu primera participación aparecerá aquí.</Empty>}
      {data && data.rows.length > 0 && (
        <>
          <div className="card overflow-hidden p-2 max-md:border-0 max-md:bg-transparent max-md:p-0">
            <table className="rtable">
              <caption className="sr-only">Participaciones</caption>
              <thead><tr><th>Fecha</th><th>Semana</th><th>Tipo</th><th>Resultado</th><th>Cupón</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Fecha">{fmtShort(r.created_at, tz)}</td>
                    <td data-label="Semana">del {fmtWeek(r.week_start)}</td>
                    <td data-label="Tipo"><span className={`badge ${r.origin === 'base' ? 'badge-base' : 'badge-extra'}`}>{r.origin === 'base' ? 'Giro base' : 'Giro extra'}</span></td>
                    <td data-label="Resultado" className="font-semibold">{r.prize_name}</td>
                    <td data-label="Cupón">
                      {r.coupon_code ? (<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{groupCode(r.coupon_code)}</span>{r.coupon_status && <StatusBadge status={r.coupon_status} />}</span>) : <span className="text-dim">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
        </>
      )}
    </>
  );
}
