/** Estado y eventos de la demostración (sesión simulada, hora simulada, arranque de la base). */
import { DEMO_USERS, type DemoUser } from './users';

const K_USER = 'ruleta.demo.user';
const K_NOW = 'ruleta.demo.now';

type Listener = () => void;
const listeners = new Set<Listener>();
export const demoSubscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
const emit = () => listeners.forEach((l) => l());

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export const demoState = {
  /** Texto de arranque mientras la base de datos se prepara (null = listo). */
  booting: 'Preparando la demostración…' as string | null,
  loginOpen: false,
};

export function getDemoUser(): DemoUser | null {
  const id = read(K_USER);
  return DEMO_USERS.find((u) => u.id === id) ?? null;
}
export function setDemoUser(u: DemoUser | null) { write(K_USER, u?.id ?? null); emit(); }

/** Hora simulada del servidor (ISO) o '' para la hora real. */
export const getDemoNow = () => read(K_NOW) ?? '';
export function setDemoNow(iso: string) { write(K_NOW, iso || null); emit(); }

export function setBooting(v: string | null) { demoState.booting = v; emit(); }
export function setLoginOpen(v: boolean) { demoState.loginOpen = v; emit(); }
export function notifyDemoChanged() { window.dispatchEvent(new Event('demo:changed')); emit(); }
