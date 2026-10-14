import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { isMuted, setMuted, subscribeSound, unlockAudio, sfx } from '../lib/sound';
import { safeUrl } from '../lib/format';
import { DEFAULT_LOGO } from '../lib/defaultConfig';
import { Avatar } from './ui';
import { IconBook, IconClock, IconGift, IconHome, IconLogout, IconShield, IconVolume, IconVolumeOff } from './icons';

function useMuted() {
  return useSyncExternalStore(subscribeSound, isMuted, () => false);
}

/** Marca: el logo que subas en el panel o, por omisión, el logo incluido en el sitio. */
export function Logo({ size = 40 }: { size?: number }) {
  const { config } = useApp();
  const url = safeUrl(config.store.logo_url) ?? DEFAULT_LOGO;
  return <img src={url} alt="" width={size} height={size} className="rounded-xl object-cover" style={{ width: size, height: size }} />;
}

function SoundToggle() {
  const muted = useMuted();
  return (
    <button type="button" className="btn btn-ghost !min-h-11 !w-11 !p-0" aria-pressed={!muted}
      aria-label={muted ? 'Activar sonidos' : 'Silenciar sonidos'}
      title={muted ? 'Activar sonidos' : 'Silenciar sonidos'}
      onClick={() => { unlockAudio(); setMuted(!muted); if (muted) setTimeout(() => sfx.click(), 30); }}>
      {muted ? <IconVolumeOff /> : <IconVolume />}
    </button>
  );
}

function UserMenu() {
  const { me, session, signInWithGoogle, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  if (!session) {
    return <button type="button" className="btn btn-ghost" onClick={() => void signInWithGoogle()}>Iniciar sesión</button>;
  }
  const name = me?.user.name ?? session.user.user_metadata?.full_name ?? session.user.email ?? '';
  const isStaff = me?.user.role === 'staff' || me?.user.role === 'admin';
  return (
    <div className="relative">
      <button type="button" className="btn btn-ghost !min-h-11 !px-2" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Avatar url={me?.user.avatar_url ?? session.user.user_metadata?.avatar_url} name={name} size={30} />
        <span className="hidden max-w-[10rem] truncate text-sm sm:inline">{name}</span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="card absolute right-0 z-50 mt-2 w-64 overflow-hidden p-1.5 shadow-2xl">
            <div className="px-3 py-2 text-sm">
              <p className="truncate font-semibold">{name}</p>
              <p className="truncate text-xs text-dim">{me?.user.email ?? session.user.email}</p>
            </div>
            {isStaff && (
              <Link role="menuitem" to="/admin" className="btn btn-ghost !w-full !justify-start border-0"><IconShield width={18} height={18} /> Panel de la tienda</Link>
            )}
            <button role="menuitem" type="button" className="btn btn-ghost !w-full !justify-start border-0" onClick={() => void signOut()}>
              <IconLogout width={18} height={18} /> Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Inicio', icon: IconHome, end: true },
  { to: '/premios', label: 'Mis premios', icon: IconGift },
  { to: '/historial', label: 'Historial', icon: IconClock },
  { to: '/reglas', label: 'Reglas', icon: IconBook },
];

export function Layout() {
  const { config, pubError, refreshPublic, me } = useApp();
  const loc = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);
  const pending = me?.pending_coupons ?? 0;
  return (
    <div className="stage flex min-h-dvh flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black">Saltar al contenido</a>
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-white/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
            <Logo />
            <span className="min-w-0">
              <span className="font-display block truncate text-[1.05rem] font-extrabold uppercase leading-none tracking-[0.04em]">{config.store.name}</span>
              {config.store.tagline && <span className="mt-1 hidden truncate text-xs text-dim sm:block">{config.store.tagline}</span>}
            </span>
          </Link>
          <nav className="ml-8 hidden flex-1 items-center gap-1 md:flex" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `relative px-3 py-2 text-sm font-semibold transition-colors after:absolute after:inset-x-3 after:-bottom-[13px] after:h-[3px] after:rounded-full after:transition-opacity ${isActive ? 'text-ink after:bg-[color:var(--c-primary)] after:opacity-100' : 'text-dim after:opacity-0 hover:text-ink'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <SoundToggle />
          <UserMenu />
        </div>
      </header>

      {pubError && (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4">
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-500/15 px-4 py-3 text-sm">
            <span>{pubError.kind === 'network' ? 'No hay conexión con el servidor. Los datos pueden estar desactualizados.' : 'El servicio no está disponible por ahora.'}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => void refreshPublic()}>Reintentar</button>
          </div>
        </div>
      )}

      <main id="contenido" className={`mx-auto w-full flex-1 ${loc.pathname === '/' ? '' : 'max-w-5xl px-4 pb-32 pt-6 md:pb-14'}`}><Outlet /></main>

      <footer className="border-t border-[color:var(--line)] px-4 pb-28 pt-6 text-sm text-dim md:pb-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {config.store.name}. Promoción sujeta a reglas.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link className="underline-offset-4 hover:text-ink hover:underline" to="/reglas">Reglas de participación</Link>
            <Link className="underline-offset-4 hover:text-ink hover:underline" to="/privacidad">Aviso de privacidad</Link>
            <Link className="underline-offset-4 hover:text-ink hover:underline" to="/#tienda">Ubicación y horarios</Link>
          </div>
        </div>
      </footer>

      {/* Navegación inferior en teléfonos */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Principal">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end}
                className={({ isActive }) => `relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.72rem] font-semibold before:absolute before:inset-x-[28%] before:top-0 before:h-[3px] before:rounded-b-full ${isActive ? 'text-ink before:bg-[color:var(--c-primary)]' : 'text-dim before:bg-transparent'}`}>
                <n.icon />
                {n.label}
                {n.to === '/premios' && pending > 0 && (
                  <span className="absolute right-[26%] top-2 min-w-5 rounded-full bg-[color:var(--c-primary)] px-1.5 text-center text-[0.68rem] font-bold leading-5 text-[color:var(--on-primary)]" aria-label={`${pending} premios pendientes`}>{pending}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <span className="mb-3 block h-1.5 w-10 rounded-full bg-[color:var(--c-primary)]" aria-hidden="true" />
      <h1 className="font-display text-[clamp(1.7rem,6vw,2.4rem)] font-extrabold leading-tight">{children}</h1>
      {sub && <p className="mt-2 max-w-prose text-dim">{sub}</p>}
    </div>
  );
}
