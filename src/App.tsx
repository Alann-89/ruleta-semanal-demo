import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { env } from './lib/env';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import HomePage from './pages/HomePage';
import MyPrizesPage from './pages/MyPrizesPage';
import HistoryPage from './pages/HistoryPage';
import { NotFoundPage, PrivacyPage, RulesPage, SetupMissingPage } from './pages/TextPages';

// La interfaz de demostración solo existe en la compilación de demo.
const DemoUI = import.meta.env.VITE_DEMO === '1' ? lazy(() => import('./demo/DemoUI').then((m) => ({ default: m.DemoUI }))) : null;

const AdminApp = lazy(() => import('./admin/AdminApp'));
const DevLogin = lazy(() => import('./pages/DevLogin'));

export default function App() {
  if (!env.isConfigured) return <SetupMissingPage />;
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <ToastProvider>
            {DemoUI && <Suspense fallback={null}><DemoUI /></Suspense>}
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="premios" element={<MyPrizesPage />} />
                  <Route path="historial" element={<HistoryPage />} />
                  <Route path="reglas" element={<RulesPage />} />
                  <Route path="privacidad" element={<PrivacyPage />} />
                  {env.devLogin && <Route path="dev-login" element={<DevLogin />} />}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                <Route path="admin/*" element={<AdminApp />} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
