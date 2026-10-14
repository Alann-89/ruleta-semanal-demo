import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/** Solo en la compilación de demostración se carga el cliente de demo (la condición se resuelve al compilar). */
const demo = import.meta.env.VITE_DEMO === '1' ? await import('../demo/client') : null;

/**
 * Cliente de Supabase con la clave pública (anon/publishable). Es seguro en el
 * navegador: toda escritura pasa por funciones del servidor y las tablas
 * están protegidas por RLS. La service_role key jamás se usa aquí.
 */
export const supabase: SupabaseClient | null = demo
  ? (demo.createDemoClient() as unknown as SupabaseClient)
  : env.isConfigured
  ? createClient(env.supabaseUrl!, env.anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;

/** Clave de localStorage donde supabase-js guarda la sesión (para el acceso de demostración local). */
export function authStorageKey(): string {
  const host = new URL(env.supabaseUrl ?? 'http://localhost').hostname.split('.')[0];
  return `sb-${host}-auth-token`;
}
