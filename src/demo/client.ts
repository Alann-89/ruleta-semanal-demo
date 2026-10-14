/**
 * Cliente de demostración con la misma forma que usa la aplicación de supabase-js
 * (rpc, auth, storage, functions). Ejecuta las funciones SQL reales sobre PGlite.
 */
import { getDemoNow, getDemoUser, demoSubscribe, setBooting, setDemoUser, setLoginOpen, notifyDemoChanged } from './bus';
import type { DemoUser } from './users';

type Err = { message: string; code: string; details: string | null; hint: string | null };

let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
};

async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: Err | null }> {
  if (!/^[a-z0-9_]+$/.test(fn)) return { data: null, error: { message: 'función inválida', code: '42883', details: null, hint: null } };
  return serial(async () => {
    const { getDb } = await import('./db');
    const db = await getDb();
    setBooting(null);
    const user = getDemoUser();
    const keys = Object.keys(args);
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    try {
      await db.exec('begin');
      await db.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('app.test_now', $2, true)", [user?.id ?? '', getDemoNow()]);
      const res = await db.query<{ r: unknown }>(sql, keys.map((k) => args[k]));
      await db.exec('commit');
      return { data: res.rows[0]?.r ?? null, error: null };
    } catch (e) {
      await db.exec('rollback').catch(() => undefined);
      const x = e as { message?: string; code?: string; detail?: string; hint?: string };
      return { data: null, error: { message: x.message ?? 'error', code: x.code ?? '', details: x.detail ?? null, hint: x.hint ?? null } };
    }
  });
}

const session = (u: DemoUser | null) => (u ? {
  access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'demo' }, user_metadata: { full_name: u.name, avatar_url: null }, created_at: new Date().toISOString() },
} : null);

export function createDemoClient() {
  return {
    rpc,
    auth: {
      getSession: async () => ({ data: { session: session(getDemoUser()) }, error: null }),
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        let last = getDemoUser()?.id ?? null;
        const unsub = demoSubscribe(() => {
          const now = getDemoUser();
          if ((now?.id ?? null) !== last) { last = now?.id ?? null; cb(now ? 'SIGNED_IN' : 'SIGNED_OUT', session(now)); }
        });
        return { data: { subscription: { unsubscribe: unsub } } };
      },
      /** En la demo no hay Google: se abre el selector de usuarios ficticios. */
      signInWithOAuth: async () => { setLoginOpen(true); return { data: {}, error: null }; },
      signOut: async () => { setDemoUser(null); notifyDemoChanged(); return { error: null }; },
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: { message: 'La subida de imágenes no está disponible en la demostración.' } }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: p } }),
      }),
    },
    functions: { invoke: async () => ({ data: null, error: { message: 'No disponible en la demostración.' } }) },
  };
}
