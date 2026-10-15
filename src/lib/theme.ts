import type { SiteConfig } from './types';
import { contrastInk } from './wheel';
import { safeUrl } from './format';

/** Variables CSS de una apariencia (compartidas por el sitio y la vista previa del panel). */
export function themeVars(t: SiteConfig['theme']): Record<string, string> {
  const bg = safeUrl(t.background_image_url);
  return {
    '--c-primary': t.primary,
    '--c-secondary': t.secondary,
    '--c-accent': t.accent,
    '--c-bg': t.background,
    '--on-primary': contrastInk(t.primary, 3.4),
    '--on-secondary': contrastInk(t.secondary, 3.4),
    '--on-accent': contrastInk(t.accent),
    '--hero-ink': contrastInk(t.secondary, 4.5),
    '--glow': String(Math.max(0, Math.min(100, t.glow)) / 100),
    '--motion': String(Math.max(0, Math.min(100, t.motion)) / 100),
    '--bg-image': bg ? `url("${bg}")` : 'none',
  };
}

/** Aplica la apariencia (ya con la temporada superpuesta) como variables CSS en la raíz. */
export function applyTheme(cfg: SiteConfig, root: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(themeVars(cfg.theme))) root.style.setProperty(k, v);
  document.title = cfg.store.name ? `${cfg.store.name} · Ruleta de premios` : 'Ruleta de premios';
}

export const DEFAULT_THEME = {
  primary: '#ff5a1f', secondary: '#7c3aed', accent: '#ffd23f', background: '#150f2e',
};
