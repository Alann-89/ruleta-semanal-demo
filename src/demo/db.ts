/**
 * Base de datos de la demostración: PostgreSQL real (PGlite, WebAssembly) en el navegador del
 * visitante, con LAS MISMAS migraciones que producción. Nada sale del navegador.
 */
import { PGlite } from '@electric-sql/pglite';
import stubs from '../../supabase/tests/stubs.sql?raw';
import seed from '../../supabase/seed/demo.sql?raw';
import { DEMO_USERS } from './users';

const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// Solo la demo: la hora del servidor se puede simular (para ver el reinicio semanal).
const NOW_OVERRIDE = `
create or replace function private.now() returns timestamptz language sql volatile as $$
  select coalesce(nullif(current_setting('app.test_now', true), '')::timestamptz, clock_timestamp())
$$;`;

let dbPromise: Promise<PGlite> | null = null;

async function init(): Promise<PGlite> {
  let db: PGlite;
  try { db = new PGlite('idb://ruleta-demo-v1'); await db.waitReady; }
  catch { db = new PGlite(); await db.waitReady; }       // sin IndexedDB (modo privado): en memoria

  const ready = await db.query<{ ok: boolean }>("select to_regclass('public.spins') is not null as ok").catch(() => null);
  if (!ready?.rows[0]?.ok) {
    await db.exec(stubs);
    for (const path of Object.keys(migrations).sort()) await db.exec(migrations[path]);
    await db.exec(NOW_OVERRIDE);
    for (const u of DEMO_USERS) {
      await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [u.id, u.email, { full_name: u.name }]);
      if (u.role !== 'customer') await db.query('update public.profiles set role = $2 where id = $1', [u.id, u.role]);
    }
    await db.exec(seed);
  }
  return db;
}

export const getDb = () => (dbPromise ??= init());

/** Vuelve a los datos de demostración iniciales (borra giros, cupones y auditoría). */
export async function resetDemoData() {
  const db = await getDb();
  await db.exec(seed);
  await db.exec('update public.profiles set is_blocked = false, blocked_reason = null');
}
