import type { SiteConfig } from './types';
import { contrastInk } from './wheel';
import { safeUrl } from './format';

/** Aplica la apariencia publicada como variables CSS (colores, brillos, fondo). */
export function applyTheme(cfg: SiteConfig, root: HTMLElement = document.documentElement) {
  const t = cfg.theme;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set('--c-primary', t.primary);
  set('--c-secondary', t.secondary);
  set('--c-accent', t.accent);
  set('--c-bg', t.background);
  set('--on-primary', contrastInk(t.primary, 3.4));
  set('--on-secondary', contrastInk(t.secondary, 3.4));
  set('--on-accent', contrastInk(t.accent));
  set('--hero-ink', contrastInk(t.secondary, 4.5));
  set('--glow', String(Math.max(0, Math.min(100, t.glow)) / 100));
  set('--motion', String(Math.max(0, Math.min(100, t.motion)) / 100));
  const bg = safeUrl(t.background_image_url);
  set('--bg-image', bg ? `url("${bg}")` : 'none');
  document.title = cfg.store.name ? `${cfg.store.name} · Ruleta de premios` : 'Ruleta de premios';
}

export const DEFAULT_THEME = {
  primary: '#ff5a1f', secondary: '#7c3aed', accent: '#ffd23f', background: '#150f2e',
};
