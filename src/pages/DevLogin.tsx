import { useEffect, useState } from 'react';
import { env } from '../lib/env';
import { authStorageKey } from '../lib/supabase';
import { PageTitle } from '../components/Layout';

interface DevUser { email: string; name: string; role: string }

/** SOLO DESARROLLO LOCAL (VITE_DEV_LOGIN=1): entra como un usuario de demostración. */
export default function DevLogin() {
  const [users, setUsers] = useState<DevUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${env.supabaseUrl}/dev/users`).then((r) => r.json()).then(setUsers).catch(() => setErr('No se pudo conectar con el servidor local de desarrollo.'));
  }, []);
  const login = async (email: string) => {
    const r = await fetch(`${env.supabaseUrl}/dev/login?email=${encodeURIComponent(email)}`);
    const session = await r.json();
    localStorage.setItem(authStorageKey(), JSON.stringify(session));
    window.location.href = '/';
  };
  return (
    <>
      <PageTitle sub="Solo para el entorno local de demostración. No existe en producción.">Acceso de demostración</PageTitle>
      {err && <p className="text-red-400">{err}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {users.map((u) => (
          <li key={u.email}>
            <button className="card w-full p-4 text-left hover:bg-surface-2" onClick={() => void login(u.email)}>
              <span className="font-display block text-lg font-semibold">{u.name}</span>
              <span className="text-sm text-dim">{u.email} · {u.role}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
