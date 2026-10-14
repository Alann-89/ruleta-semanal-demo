import { lazy, Suspense } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Avatar, PageLoader } from '../components/ui';
import { Logo } from '../components/Layout';
import { IconChart, IconGoogle, IconList, IconLogout, IconPalette, IconScan, IconSliders, IconTicket, IconUsers, IconGift, IconHome } from '../components/icons';
import RedeemPage from './RedeemPage';

const Dashboard = lazy(() => import('./DashboardPage'));
const Prizes = lazy(() => import('./PrizesPage'));
const CampaignPage = lazy(() => import('./CampaignPage'));
const Extras = lazy(() => import('./ExtrasPage'));
const Appearance = lazy(() => import('./AppearancePage'));
const UsersPage = lazy(() => import('./UsersPage'));
const AuditPage = lazy(() => import('./AuditPage'));

type NavItem = { to: string; label: string; icon: (p: React.SVGProps<SVGSVGElement>) => React.JSX.Element; end?: boolean };
const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Resumen', icon: IconChart, end: true },
  { to: '/admin/canjes', label: 'Canjes', icon: IconScan },
  { to: '/admin/resultados', label: 'Resultados', icon: IconGift },
  { to: '/admin/campana', label: 'Campaña', icon: IconSliders },
  { to: '/admin/giros', label: 'Giros extra y códigos', icon: IconTicket },
  { to: '/admin/apariencia', label: 'Apariencia', icon: IconPalette },
  { to: '/admin/usuarios', label: 'Usuarios', icon: IconUsers },
  { to: '/admin/auditoria', label: 'Auditoría', icon: IconList },
];
const STAFF_NAV: NavItem[] = [{ to: '/admin/canjes', label: 'Canjes', icon: IconScan }];

export default function AdminApp() {
  const { authReady, session, me, meError, config, signInWithGoogle, signOut } = useApp();
  const loc = useLocation();

  let body;
  if (!authReady || (session && !me && !meError)) body = <PageLoader />;
  else if (!session) {
    body = (
      <div className="mx-auto mt-16 max-w-sm space-y-4 text-center">
        <h1 className="font-display text-2xl font-semibold">Panel de la tienda</h1>
        <p className="text-dim">Inicia sesión con tu cuenta autorizada para continuar.</p>
        <button className="btn !min-h-12 w-full border border-line bg-white text-[#1f1f1f]" onClick={() => void signInWithGoogle()}><IconGoogle /> Continuar con Google</button>
        <Link to="/" className="block text-sm text-dim underline">Volver al sitio</Link>
      </div>
    );
  } else if (!me || (me.user.role !== 'admin' && me.user.role !== 'staff')) {
    body = (
      <div className="mx-auto mt-16 max-w-sm space-y-3 text-center" role="alert">
        <h1 className="font-display text-2xl font-semibold">Sin acceso</h1>
        <p className="text-dim">Tu cuenta ({me?.user.email ?? session.user.email}) no tiene permisos para el panel. Si deberías tenerlos, pide a un administrador que te asigne el rol.</p>
        <Link to="/" className="btn btn-primary">Volver al sitio</Link>
      </div>
    );
  } else {
    const isAdmin = me.user.role === 'admin';
    const nav = isAdmin ? ADMIN_NAV : STAFF_NAV;
    body = (
      <div className="mx-auto flex w-full max-w-[88rem] flex-1 flex-col md:flex-row">
        <aside className="md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:w-60 md:shrink-0 md:overflow-y-auto md:border-r md:border-line md:p-3">
          <nav aria-label="Panel" className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-2 md:flex-col md:border-0 md:bg-transparent md:p-0">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-semibold ${isActive ? 'bg-btn text-on-btn' : 'text-dim hover:bg-surface-2'}`}>
                <n.icon width={18} height={18} /> {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main id="contenido" className="min-w-0 flex-1 p-4 md:p-6">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index element={isAdmin ? <Dashboard /> : <Navigate to="/admin/canjes" replace />} />
              <Route path="canjes" element={<RedeemPage isAdmin={isAdmin} />} />
              {isAdmin && (
                <>
                  <Route path="resultados" element={<Prizes />} />
                  <Route path="campana" element={<CampaignPage />} />
                  <Route path="giros" element={<Extras />} />
                  <Route path="apariencia" element={<Appearance />} />
                  <Route path="usuarios" element={<UsersPage />} />
                  <Route path="auditoria" element={<AuditPage />} />
                </>
              )}
              <Route path="*" element={<Navigate to={isAdmin ? '/admin' : '/admin/canjes'} replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="admin flex min-h-dvh flex-col bg-page text-ink" data-path={loc.pathname}>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-3 md:px-5">
        <Logo size={32} />
        <span className="font-display min-w-0 flex-1 truncate font-semibold">{config.store.name} <span className="text-dim">· Panel</span></span>
        <Link to="/" className="btn btn-ghost btn-sm"><IconHome width={16} height={16} /><span className="hidden sm:inline"> Ver sitio</span></Link>
        {me && <Avatar url={me.user.avatar_url} name={me.user.name ?? me.user.email} size={30} />}
        {session && <button className="btn btn-ghost btn-sm" onClick={() => void signOut()} aria-label="Cerrar sesión"><IconLogout width={16} height={16} /></button>}
      </header>
      {body}
    </div>
  );
}
