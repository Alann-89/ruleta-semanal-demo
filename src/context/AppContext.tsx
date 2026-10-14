import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ApiError, getMyStatus, getPublicState } from '../lib/api';
import type { MyStatus, PublicState, SiteConfig } from '../lib/types';
import { DEFAULT_CONFIG } from '../lib/defaultConfig';
import { applyTheme } from '../lib/theme';
import { initSound } from '../lib/sound';

interface AppCtx {
  /** Configuración publicada (o valores por omisión mientras carga). */
  config: SiteConfig;
  pub: PublicState | null;
  pubLoading: boolean;
  pubError: ApiError | null;
  authReady: boolean;
  session: Session | null;
  /** Estado de participación de la cuenta (null si no hay sesión). */
  me: MyStatus | null;
  meError: string | null;
  /** Diferencia (ms) entre el reloj del servidor y el del dispositivo, solo para mostrar tiempos relativos. */
  clockOffset: number;
  refreshPublic: () => Promise<void>;
  refreshMe: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fuera de AppProvider');
  return v;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [pub, setPub] = useState<PublicState | null>(null);
  const [pubLoading, setPubLoading] = useState(true);
  const [pubError, setPubError] = useState<ApiError | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [me, setMe] = useState<MyStatus | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const soundInit = useRef(false);

  const refreshPublic = useCallback(async () => {
    try {
      const s = await getPublicState();
      setPub(s);
      setPubError(null);
      setClockOffset(Date.parse(s.server_time) - Date.now());
      if (s.config?.theme) applyTheme(s.config);
      if (!soundInit.current && s.config?.sound) {
        soundInit.current = true;
        initSound(s.config.sound.enabled_by_default, s.config.sound.volume);
      }
    } catch (e) {
      setPubError(e instanceof ApiError ? e : new ApiError('Error inesperado.', 'unknown', 'unknown'));
    } finally {
      setPubLoading(false);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setMe(null); setMeError(null); return; }
    try {
      const r = await getMyStatus();
      if (r.ok) { setMe(r); setMeError(null); setClockOffset(Date.parse(r.server_time) - Date.now()); }
      else { setMe(null); setMeError(r.error); }
    } catch (e) {
      setMeError(e instanceof ApiError ? e.code : 'unknown');
    }
  }, []);

  // Sesión
  useEffect(() => {
    if (!supabase) { setAuthReady(true); setPubLoading(false); return; }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      // No se llama a la API aquí dentro (evita bloqueos de supabase-js); se reacciona por estado.
      setSession(s);
      setAuthReady(true);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { void refreshPublic(); }, [refreshPublic]);

  // Demostración: al cambiar de usuario, la hora simulada o reiniciar los datos, se vuelve a consultar todo.
  useEffect(() => {
    const h = () => { void refreshPublic(); void refreshMe(); };
    window.addEventListener('demo:changed', h);
    return () => window.removeEventListener('demo:changed', h);
  }, [refreshPublic, refreshMe]);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!authReady) return;
    if (!userId) { setMe(null); setMeError(null); return; }
    void refreshMe();
  }, [authReady, userId, refreshMe]);

  // Al volver a la pestaña, refresca (con límite de frecuencia).
  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 20_000) return;
      last = Date.now();
      void refreshPublic();
      void refreshMe();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshPublic, refreshMe]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}`, queryParams: { prompt: 'select_account' } },
    });
  }, []);

  const signOut = useCallback(async () => {
    try { localStorage.removeItem('ruleta.pendingSpin'); } catch { /* sin almacenamiento */ }
    await supabase?.auth.signOut();
    setMe(null);
  }, []);

  const value = useMemo<AppCtx>(() => ({
    config: pub?.config ?? DEFAULT_CONFIG, pub, pubLoading, pubError, authReady, session, me, meError, clockOffset,
    refreshPublic, refreshMe, signInWithGoogle, signOut,
  }), [pub, pubLoading, pubError, authReady, session, me, meError, clockOffset, refreshPublic, refreshMe, signInWithGoogle, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
