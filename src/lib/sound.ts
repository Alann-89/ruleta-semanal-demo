/**
 * Sonidos sintetizados con Web Audio (sin archivos que descargar).
 * El AudioContext se crea tras un gesto del usuario, como exigen los navegadores.
 */
const KEY = 'ruleta.muted';

let ctx: AudioContext | null = null;
let volume = 0.6;
let muted = false;
const listeners = new Set<() => void>();

export function initSound(defaultOn: boolean, vol: number) {
  volume = Math.max(0, Math.min(1, vol / 100));
  try {
    const stored = localStorage.getItem(KEY);
    muted = stored === null ? !defaultOn : stored === '1';
  } catch { muted = !defaultOn; }
  listeners.forEach((l) => l());
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* sin almacenamiento */ }
  listeners.forEach((l) => l());
}
export function subscribeSound(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Debe llamarse dentro de un clic/toque. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* sin audio */ }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  if (!ctx || muted || volume <= 0) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * volume), t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  tick() { tone(1250 + Math.random() * 120, 0, 0.045, 'square', 0.1); },
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.35, 'triangle', 0.32)); },
  extra() { [440, 660, 880].forEach((f, i) => tone(f, i * 0.09, 0.25, 'sine', 0.3)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.3, 'sine', 0.22)); },
  click() { tone(660, 0, 0.06, 'sine', 0.2); },
};
