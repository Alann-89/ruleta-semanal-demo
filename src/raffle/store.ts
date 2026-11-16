import { useEffect, useSyncExternalStore } from 'react';
import { getRaffleState } from '../lib/api';
import type { RaffleInfo, RafflePhase, RaffleState } from '../lib/types';

/**
 * Estado del sorteo compartido por la pestaña, la franja, el boleto junto a la ruleta y el menú.
 * El servidor es la fuente de verdad; entre consultas, la fase se calcula con la hora del servidor.
 */
interface Snapshot { state: RaffleState | null; loaded: boolean; offset: number }

let snap: Snapshot = { state: null, loaded: false, offset: 0 };
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function refreshRaffle(): Promise<void> {
  inflight ??= getRaffleState()
    .then((state) => { snap = { state, loaded: true, offset: Date.parse(state.server_time) - Date.now() }; })
    .catch(() => { snap = { ...snap, loaded: true }; })
    .finally(() => { inflight = null; emit(); });
  return inflight;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useRaffleStore = (): Snapshot => useSyncExternalStore(subscribe, () => snap, () => snap);

/** Fase en este instante (la de la respuesta puede haber cambiado por la hora). */
export function phaseAt(r: RaffleInfo, serverNowMs: number): RafflePhase {
  if (r.winner) return 'drawn';
  return serverNowMs < Date.parse(r.unlock_at) ? 'locked' : 'open';
}

/**
 * Mantiene el estado al día: al montar, al cambiar de sesión, cada minuto y al volver a la pestaña.
 * Se usa una sola vez, en el diseño del sitio de clientes.
 */
export function useRaffleSync(sessionUserId: string | null) {
  useEffect(() => { void refreshRaffle(); }, [sessionUserId]);
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshRaffle(); }, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') void refreshRaffle(); };
    const onDemo = () => { void refreshRaffle(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('demo:changed', onDemo);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('demo:changed', onDemo); };
  }, []);
}
