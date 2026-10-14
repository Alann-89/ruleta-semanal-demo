import { useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/ui';
import { useApp } from '../context/AppContext';
import { demoState, demoSubscribe, getDemoNow, getDemoUser, notifyDemoChanged, setDemoNow, setDemoUser, setLoginOpen } from './bus';
import { DEMO_USERS } from './users';

const REPO = (import.meta.env.VITE_REPO_URL as string | undefined)?.trim();
const ROLE_LABEL = { admin: 'Administradora', staff: 'Personal de tienda', customer: 'Cliente' } as const;

function useDemo<T>(pick: () => T): T {
  // Las instantáneas deben ser estables: se serializa para comparar.
  const snap = useSyncExternalStore(demoSubscribe, () => JSON.stringify(pick()), () => JSON.stringify(pick()));
  return JSON.parse(snap) as T;
}

/** Franja de la demostración + selector de usuarios ficticios + carga inicial. */
export function DemoUI() {
  const navigate = useNavigate();
  const { pub } = useApp();
  const s = useDemo(() => ({ booting: demoState.booting, login: demoState.loginOpen, user: getDemoUser()?.id ?? null, now: getDemoNow() }));
  const [busy, setBusy] = useState(false);
  const tz = pub?.campaign?.timezone ?? 'America/Mexico_City';

  const nextWeek = () => {
    const base = s.now ? new Date(s.now) : new Date();
    setDemoNow(new Date(base.getTime() + 7 * 86400000).toISOString());
    notifyDemoChanged();
    navigate('/');
  };
  const realTime = () => { setDemoNow(''); notifyDemoChanged(); navigate('/'); };
  const reset = async () => {
    setBusy(true);
    try {
      const { resetDemoData } = await import('./db');
      await resetDemoData();
      setDemoNow('');
      notifyDemoChanged();
      navigate('/');
    } finally { setBusy(false); }
  };
  const login = (id: string) => {
    const u = DEMO_USERS.find((x) => x.id === id)!;
    setDemoUser(u); setLoginOpen(false); notifyDemoChanged();
    navigate(u.role === 'admin' ? '/admin' : u.role === 'staff' ? '/admin/canjes' : '/');
  };
  const current = DEMO_USERS.find((u) => u.id === s.user);
  const fmtNow = s.now ? new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(s.now)) : null;

  return (
    <>
      <div className="relative z-40 bg-[#2e1708] px-3 py-2 text-[0.78rem] text-white" role="region" aria-label="Demostración">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center">
          <span className="font-semibold">DEMO · datos ficticios · se ejecuta 100 % en tu navegador</span>
          <span className="flex flex-wrap items-center justify-center gap-1.5">
            <button className="rounded-md bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25" onClick={() => setLoginOpen(true)}>
              {current ? `Usuario: ${current.name}` : 'Entrar como…'}
            </button>
            <button className="rounded-md bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25" onClick={nextWeek} title="Avanza el reloj del servidor 7 días para ver cómo se renueva el giro semanal">
              Semana siguiente
            </button>
            {fmtNow && <button className="rounded-md bg-white/15 px-2.5 py-1 hover:bg-white/25" onClick={realTime}>Simulando {fmtNow} · volver a hoy</button>}
            <button className="rounded-md bg-white/15 px-2.5 py-1 hover:bg-white/25 disabled:opacity-50" disabled={busy} onClick={() => void reset()}>{busy ? 'Reiniciando…' : 'Reiniciar datos'}</button>
            {REPO && <a className="rounded-md bg-white/15 px-2.5 py-1 hover:bg-white/25" href={REPO} target="_blank" rel="noopener noreferrer">Código</a>}
          </span>
        </div>
      </div>

      {s.booting && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-[95] mx-auto w-fit max-w-[90vw] rounded-full bg-[#2e1708] px-4 py-2 text-sm text-white shadow-xl md:bottom-6">
          {s.booting} <span className="opacity-70">(la primera vez tarda unos segundos)</span>
        </div>
      )}

      <Modal open={s.login} onClose={() => setLoginOpen(false)} title="Entrar como…" wide>
        <p className="mb-3 text-sm text-dim">En la versión real se entra con Google. Aquí eliges un usuario ficticio para recorrer cada rol.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {DEMO_USERS.map((u) => (
            <li key={u.id}>
              <button className="card w-full p-3 text-left hover:bg-surface-2" onClick={() => login(u.id)}>
                <span className="font-display block text-base font-bold">{u.name}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--c-primary)]">{ROLE_LABEL[u.role]}</span>
                <span className="mt-1 block text-sm text-dim">{u.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
        {current && <button className="btn btn-ghost mt-3 w-full" onClick={() => { setDemoUser(null); setLoginOpen(false); notifyDemoChanged(); navigate('/'); }}>Cerrar sesión</button>}
      </Modal>
    </>
  );
}
