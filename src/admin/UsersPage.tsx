import { useCallback, useEffect, useState } from 'react';
import { adminAnonymize, adminListUsers, adminSetBlocked, adminSetRole, ApiError, errText } from '../lib/api';
import type { AdminUser, Paged, Role } from '../lib/types';
import { fmtShort } from '../lib/format';
import { Alert, Field, Modal, Pagination, Spinner } from '../components/ui';
import { useToast } from '../context/Toast';
import { useApp } from '../context/AppContext';

const ROLE: Record<Role, string> = { customer: 'Cliente', staff: 'Personal de tienda', admin: 'Administrador' };
type Action = { kind: 'role'; user: AdminUser; role: Role } | { kind: 'block'; user: AdminUser } | { kind: 'unblock'; user: AdminUser } | { kind: 'anon'; user: AdminUser };

export default function UsersPage() {
  const toast = useToast();
  const { me, pub } = useApp();
  const tz = pub?.campaign?.timezone;
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<AdminUser> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await adminListUsers(search.trim() || null, role || null, 20, offset)); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
  }, [search, role, offset]);
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);

  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const r = action.kind === 'role' ? await adminSetRole(action.user.id, action.role)
        : action.kind === 'block' ? await adminSetBlocked(action.user.id, true, reason)
        : action.kind === 'unblock' ? await adminSetBlocked(action.user.id, false, null)
        : await adminAnonymize(action.user.id);
      if (r.ok) { toast('Listo', 'ok'); setAction(null); setReason(''); void load(); } else toast(errText(r.error), 'error');
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Usuarios y roles</h1>
        <p className="text-sm text-dim">Las personas se registran solas al entrar con Google y empiezan como <strong>Cliente</strong>. Solo un administrador puede darles acceso al panel.</p>
      </div>
      <Alert kind="info"><strong>Cómo agregar personal:</strong> pídele que entre una vez a la web con su cuenta de Google; luego búscalo aquí y cámbiale el rol a «Personal de tienda» (solo ve y realiza canjes) o «Administrador».</Alert>
      <div className="card grid gap-3 p-3 sm:grid-cols-[1fr_auto]">
        <input className="input" aria-label="Buscar usuario" placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => { setOffset(0); setSearch(e.target.value); }} />
        <select className="input" aria-label="Filtrar por rol" value={role} onChange={(e) => { setOffset(0); setRole(e.target.value); }}>
          <option value="">Todos los roles</option><option value="customer">Clientes</option><option value="staff">Personal</option><option value="admin">Administradores</option>
        </select>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {!data ? <div className="py-8 text-center"><Spinner /></div> : data.rows.length === 0 ? <div className="card p-8 text-center text-dim">Sin resultados.</div> : (
        <div className="card overflow-hidden p-1 max-md:border-0 max-md:bg-transparent max-md:p-0">
          <table className="rtable">
            <caption className="sr-only">Usuarios</caption>
            <thead><tr><th>Usuario</th><th>Rol</th><th>Giros</th><th>Último giro</th><th>Extras</th><th>Acciones</th></tr></thead>
            <tbody>{data.rows.map((u) => (
              <tr key={u.id}>
                <td data-label="Usuario"><span className="font-semibold">{u.name ?? '—'}</span> {u.is_blocked && <span className="badge badge-void">Bloqueado</span>}<span className="block text-xs text-dim">{u.email}</span></td>
                <td data-label="Rol">
                  <select aria-label={`Rol de ${u.email}`} className="input !min-h-10 !w-auto" value={u.role} disabled={u.id === me?.user.id}
                    onChange={(e) => setAction({ kind: 'role', user: u, role: e.target.value as Role })}>
                    {(Object.keys(ROLE) as Role[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
                  </select>
                </td>
                <td data-label="Giros">{u.spins}</td>
                <td data-label="Último giro">{u.last_spin_at ? fmtShort(u.last_spin_at, tz) : '—'}</td>
                <td data-label="Extras">{u.extras_available}</td>
                <td data-label="Acciones">
                  <div className="flex flex-wrap gap-1.5">
                    {u.id !== me?.user.id && (u.is_blocked
                      ? <button className="btn btn-ghost btn-sm" onClick={() => setAction({ kind: 'unblock', user: u })}>Desbloquear</button>
                      : <button className="btn btn-ghost btn-sm" onClick={() => setAction({ kind: 'block', user: u })}>Bloquear</button>)}
                    {u.role === 'customer' && !u.email.endsWith('@eliminado.invalid') && <button className="btn btn-ghost btn-sm text-bad" onClick={() => setAction({ kind: 'anon', user: u })}>Anonimizar</button>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {data && <Pagination total={data.total} offset={offset} limit={20} onChange={setOffset} />}

      <Modal open={!!action} onClose={() => !busy && setAction(null)} title={action?.kind === 'role' ? 'Cambiar rol' : action?.kind === 'block' ? 'Bloquear cuenta' : action?.kind === 'unblock' ? 'Desbloquear cuenta' : 'Anonimizar datos personales'}>
        {action && (
          <div className="space-y-3">
            {action.kind === 'role' && <p className="text-sm">¿Cambiar a <strong>{action.user.name ?? action.user.email}</strong> de <em>{ROLE[action.user.role]}</em> a <strong>{ROLE[action.role]}</strong>?{action.role === 'admin' && ' Tendrá acceso completo a la configuración.'}</p>}
            {action.kind === 'block' && (<><p className="text-sm">La cuenta no podrá girar ni canjear códigos. Su historial se conserva. No se bloquea por IP: solo esta cuenta.</p>
              <Field label="Motivo (obligatorio)">{(id) => <textarea id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field></>)}
            {action.kind === 'unblock' && <p className="text-sm">La cuenta de <strong>{action.user.email}</strong> podrá participar de nuevo.</p>}
            {action.kind === 'anon' && <p className="text-sm">Se borrarán el nombre, correo y foto de <strong>{action.user.email}</strong> y se bloqueará la cuenta. Sus giros y cupones se conservan sin datos personales. Esta acción no se puede deshacer.</p>}
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => setAction(null)}>Cancelar</button>
              <button className={`btn flex-1 ${action.kind === 'anon' || action.kind === 'block' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || (action.kind === 'block' && reason.trim().length < 5)} onClick={() => void run()}>Confirmar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
