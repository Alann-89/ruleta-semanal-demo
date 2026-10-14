const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const DEMO = import.meta.env.VITE_DEMO === '1';

export const env = {
  /** Demostración autónoma (sin servidor): base de datos en el navegador y usuarios ficticios. */
  demo: DEMO,
  supabaseUrl: url,
  anonKey,
  isConfigured: DEMO || Boolean(url && anonKey && !url.includes('TU-PROYECTO')),
  /** Origen público del sitio: se incrusta en el QR de los cupones. */
  siteUrl: ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim() || window.location.origin).replace(/\/$/, ''),
  /** Pantalla de acceso de demostración (solo con el servidor local de desarrollo). */
  devLogin: import.meta.env.VITE_DEV_LOGIN === '1',
};
