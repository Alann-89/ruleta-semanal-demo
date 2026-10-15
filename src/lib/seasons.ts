import type { Sector, SiteConfig } from './types';

/**
 * Diseños de temporada. Se aplican POR ENCIMA del diseño de marca (no lo sobrescriben):
 * al quitar la temporada, o al terminar sus fechas, el sitio vuelve solo a los colores de marca.
 */
export type ShapeKind =
  | 'heart' | 'sparkle' | 'star' | 'snowflake' | 'confetti' | 'dot' | 'ribbon' | 'flower' | 'bat' | 'pumpkin'
  | 'skull' | 'balloon' | 'sun' | 'pencil' | 'gift' | 'tag' | 'crown' | 'tie';

export type PatternKind = 'dots' | 'stripes' | 'stars' | 'hearts' | 'flowers' | 'diamonds' | 'grid';
export type SceneKind = 'moon' | 'cobweb' | 'fireworks' | 'snowhill' | 'twinkle' | 'bigsun';

export interface MotifItem { k: ShapeKind; a: string; b?: string; c?: string }

type Md = [month: number, day: number];

export interface Season {
  id: string;
  name: string;
  emoji: string;
  /** Texto para el selector (fechas típicas). */
  dates: string;
  /** Ventana típica (con unos días de anticipación) para sugerirla. */
  window?: { from: Md; to: Md };
  colors: { primary: string; secondary: string; accent: string; background: string };
  /** Paleta que se alterna en los sectores de la ruleta. */
  wheel: string[];
  /** Figuras flotantes; se reparten en orden por la cabecera. */
  motif: MotifItem[];
  /** Si es true, las figuras caen (nieve, confeti) en lugar de flotar. */
  fall?: boolean;
  /** Trama sutil sobre el tejado de la cabecera. */
  pattern: PatternKind;
  /** Elementos grandes de escena (luna, telarañas, fuegos artificiales…). */
  scene?: SceneKind[];
  /** Banderines (papel picado) en la parte superior. */
  bunting?: string[];
  copy: {
    welcome_title: string; welcome_text: string; button_text: string;
    celebration_message: string; no_prize_message: string;
  };
}

export const SEASONS: Season[] = [
  {
    id: 'reyes', name: 'Día de Reyes', emoji: '👑', dates: '1 – 6 de enero', window: { from: [1, 1], to: [1, 6] },
    pattern: 'stars', scene: ['twinkle'],
    colors: { primary: '#7c3aed', secondary: '#3b1a78', accent: '#ffd23f', background: '#faf5ff' },
    wheel: ['#7c3aed', '#ffffff', '#ffd23f', '#3b1a78', '#e5d5ff'],
    motif: [{ k: 'crown', a: '#ffd23f', b: '#ff5d8f', c: '#7c3aed' }, { k: 'star', a: '#ffe58a' }, { k: 'sparkle', a: '#ffffff' }, { k: 'gift', a: '#ffd23f', b: '#ffffff' }],
    copy: {
      welcome_title: '¡Que los Reyes te traigan suerte!', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Los Reyes te trajeron un premio! Muéstralo en la tienda.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'san_valentin', name: 'San Valentín', emoji: '💝', dates: '1 – 14 de febrero', window: { from: [2, 1], to: [2, 14] },
    pattern: 'hearts',
    colors: { primary: '#e0245e', secondary: '#8f0f3a', accent: '#ffb3c7', background: '#fff5f7' },
    wheel: ['#e0245e', '#ffffff', '#ff8fb1', '#8f0f3a', '#ffe0e8'],
    motif: [{ k: 'heart', a: '#ffffff' }, { k: 'heart', a: '#ffb3c7' }, { k: 'sparkle', a: '#ffffff' }, { k: 'heart', a: '#ff5c8a' }],
    copy: {
      welcome_title: 'Gira y comparte el amor', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Regala o regálate: los premios se canjean en la tienda.',
      button_text: '¡Girar con amor!', celebration_message: '¡Te enamoraste de un premio! Pásalo a recoger a la tienda.',
      no_prize_message: 'Esta vez no hubo premio, pero el amor sigue. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'dia_del_nino', name: 'Día del Niño', emoji: '🎈', dates: '15 – 30 de abril', window: { from: [4, 15], to: [4, 30] },
    pattern: 'dots', scene: ['fireworks'],
    colors: { primary: '#ff7a1a', secondary: '#3a35b8', accent: '#ffd23f', background: '#fffaf0' },
    wheel: ['#ff7a1a', '#ffffff', '#3bb6ff', '#3a35b8', '#ffd23f', '#ff5d8f'],
    motif: [{ k: 'balloon', a: '#ff5d8f' }, { k: 'confetti', a: '#ffd23f' }, { k: 'balloon', a: '#3bb6ff' }, { k: 'star', a: '#ffd23f' }, { k: 'balloon', a: '#ffd23f' }],
    copy: {
      welcome_title: '¡Que viva la diversión!', welcome_text: 'Inicia sesión con Google y gira una vez por semana. ¡Hay premios para jugar y sonreír!',
      button_text: '¡Girar y jugar!', celebration_message: '¡Ganaste un premio! Pasa por él a la tienda.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana y juega otra vez!',
    },
  },
  {
    id: 'dia_de_las_madres', name: 'Día de las Madres', emoji: '🌸', dates: '1 – 10 de mayo', window: { from: [5, 1], to: [5, 10] },
    pattern: 'flowers',
    colors: { primary: '#d6458f', secondary: '#7a1f55', accent: '#ffd166', background: '#fff6fb' },
    wheel: ['#d6458f', '#ffffff', '#f7a8d0', '#7a1f55', '#ffe3f1'],
    motif: [{ k: 'flower', a: '#ffffff', b: '#ffd166' }, { k: 'heart', a: '#ffd1e8' }, { k: 'flower', a: '#ffc2e0', b: '#ffffff' }, { k: 'sparkle', a: '#ffffff' }],
    copy: {
      welcome_title: 'Mamá, hoy giras tú', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Felicidades! Un premio muy especial para una persona muy especial.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'dia_del_padre', name: 'Día del Padre', emoji: '👔', dates: '1 – 21 de junio (aprox.)', window: { from: [6, 1], to: [6, 21] },
    pattern: 'stripes',
    colors: { primary: '#0e7490', secondary: '#083344', accent: '#fbbf24', background: '#f0fbff' },
    wheel: ['#0e7490', '#ffffff', '#7dd3e8', '#083344', '#d6f3fa'],
    motif: [{ k: 'tie', a: '#fbbf24', b: '#ffffff' }, { k: 'star', a: '#fbbf24' }, { k: 'tie', a: '#ffffff', b: '#7dd3e8' }, { k: 'sparkle', a: '#ffffff' }],
    copy: {
      welcome_title: 'Papá merece ganar', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Felicidades! Un premio digno del mejor papá.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'verano', name: 'Vacaciones de verano', emoji: '☀️', dates: '5 de julio – 20 de agosto', window: { from: [7, 5], to: [8, 20] },
    pattern: 'dots', scene: ['bigsun'],
    colors: { primary: '#ff8a00', secondary: '#0b6bcb', accent: '#ffe066', background: '#f2fbff' },
    wheel: ['#ff8a00', '#ffffff', '#19b5fe', '#0b6bcb', '#ffe066', '#ffd9a3'],
    motif: [{ k: 'sun', a: '#ffe066', b: '#ffffff' }, { k: 'dot', a: '#ffffff' }, { k: 'balloon', a: '#19b5fe' }, { k: 'sparkle', a: '#ffffff' }],
    copy: {
      welcome_title: '¡Gira y que siga el verano!', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Felicidades! Ganaste un premio de verano.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'regreso_a_clases', name: 'Regreso a clases', emoji: '✏️', dates: '10 de agosto – 3 de septiembre', window: { from: [8, 10], to: [9, 3] },
    pattern: 'grid',
    colors: { primary: '#2f6df6', secondary: '#14307a', accent: '#ffcf3d', background: '#f4f8ff' },
    wheel: ['#2f6df6', '#ffffff', '#ffcf3d', '#14307a', '#cfe0ff'],
    motif: [{ k: 'pencil', a: '#ffcf3d', b: '#f6d9a8', c: '#ff7d9c' }, { k: 'star', a: '#ffcf3d' }, { k: 'pencil', a: '#ffffff', b: '#f6d9a8', c: '#ff7d9c' }, { k: 'sparkle', a: '#ffffff' }],
    copy: {
      welcome_title: '¡Regreso a clases con premio!', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Excelente! Ganaste un premio. Canjéalo en la tienda.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'independencia', name: 'Independencia de México', emoji: '🇲🇽', dates: '5 – 16 de septiembre', window: { from: [9, 5], to: [9, 16] },
    pattern: 'stripes', scene: ['fireworks'],
    colors: { primary: '#c8102e', secondary: '#0a4d31', accent: '#f2c14e', background: '#fffaf0' },
    wheel: ['#0b7a4b', '#ffffff', '#c8102e'],
    motif: [{ k: 'star', a: '#f2c14e' }, { k: 'confetti', a: '#ffffff' }, { k: 'sparkle', a: '#f2c14e' }, { k: 'dot', a: '#ffffff' }],
    bunting: ['#0b7a4b', '#ffffff', '#c8102e'],
    copy: {
      welcome_title: '¡Viva México! Gira y gana', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Viva México! Ganaste un premio. Pasa por él a la tienda.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'halloween', name: 'Halloween', emoji: '🎃', dates: '15 – 31 de octubre', window: { from: [10, 15], to: [10, 31] },
    pattern: 'diamonds', scene: ['moon', 'cobweb', 'twinkle'],
    colors: { primary: '#f26a0f', secondary: '#2a0d45', accent: '#ffb347', background: '#fdf6ff' },
    wheel: ['#f26a0f', '#ffffff', '#4b1d78', '#ffd8b0', '#1c0b30', '#ff9a3d'],
    motif: [{ k: 'bat', a: '#1c0b30' }, { k: 'pumpkin', a: '#ff8a1f', b: '#2f9e44', c: '#2a0d45' }, { k: 'bat', a: '#2a0d45' }, { k: 'sparkle', a: '#ffd8b0' }, { k: 'pumpkin', a: '#ffb347', b: '#7a4b12', c: '#2a0d45' }],
    copy: {
      welcome_title: '¡Truco o trato! Gira y gana', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda… ¡si te atreves!',
      button_text: '¡Girar si te atreves!', celebration_message: '¡Trato! Ganaste un premio. Recógelo en la tienda.',
      no_prize_message: '¡Truco! Esta vez no hubo premio. Vuelve la próxima semana.',
    },
  },
  {
    id: 'dia_de_muertos', name: 'Día de Muertos', emoji: '💀', dates: '25 de octubre – 2 de noviembre', window: { from: [10, 25], to: [11, 2] },
    pattern: 'flowers', scene: ['twinkle'],
    colors: { primary: '#f58a07', secondary: '#5c1a6b', accent: '#ff4fa3', background: '#fff7ea' },
    wheel: ['#f58a07', '#ffffff', '#d6338a', '#5c1a6b', '#ffd166', '#fff0cf'],
    motif: [{ k: 'flower', a: '#ffc233', b: '#f58a07' }, { k: 'skull', a: '#ffffff', b: '#5c1a6b', c: '#ff4fa3' }, { k: 'flower', a: '#ff9a1f', b: '#ffe08a' }, { k: 'sparkle', a: '#ffe08a' }],
    bunting: ['#ff4fa3', '#f58a07', '#ffd166', '#8e44ad', '#ffffff'],
    copy: {
      welcome_title: 'Honremos la tradición', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Felicidades! Ganaste un premio. Canjéalo en la tienda.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'buen_fin', name: 'Buen Fin / Ofertas', emoji: '🏷️', dates: '10 – 23 de noviembre (aprox.)', window: { from: [11, 10], to: [11, 23] },
    pattern: 'stripes', scene: ['twinkle'],
    colors: { primary: '#e11d2f', secondary: '#5a0711', accent: '#ffd60a', background: '#fff8e6' },
    wheel: ['#e11d2f', '#ffffff', '#ffd60a', '#5a0711', '#ffe9a8'],
    motif: [{ k: 'tag', a: '#ffd60a', b: '#5a0711' }, { k: 'sparkle', a: '#ffffff' }, { k: 'tag', a: '#ffffff', b: '#e11d2f' }, { k: 'star', a: '#ffd60a' }],
    copy: {
      welcome_title: '¡Ofertas y premios en grande!', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Oferta ganadora! Canjea tu premio en la tienda.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana!',
    },
  },
  {
    id: 'navidad', name: 'Navidad', emoji: '🎄', dates: '1 – 25 de diciembre', window: { from: [12, 1], to: [12, 25] },
    pattern: 'dots', scene: ['snowhill', 'twinkle'],
    colors: { primary: '#c8102e', secondary: '#7a0c1e', accent: '#ffd36b', background: '#fff7f5' },
    wheel: ['#c8102e', '#ffffff', '#e8b84a', '#7a0c1e', '#f6e7c8'],
    motif: [{ k: 'snowflake', a: '#ffffff' }, { k: 'gift', a: '#ffd36b', b: '#ffffff' }, { k: 'star', a: '#ffd36b' }, { k: 'snowflake', a: '#ffe9ef' }, { k: 'dot', a: '#ffffff' }],
    fall: true,
    copy: {
      welcome_title: '¡Feliz Navidad! Gira y gana', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Felices fiestas! Ganaste un premio. Recógelo en la tienda.',
      no_prize_message: 'Esta vez no hubo premio. ¡Felices fiestas y vuelve la próxima semana!',
    },
  },
  {
    id: 'ano_nuevo', name: 'Año Nuevo', emoji: '🎆', dates: '26 de diciembre – 1 de enero', window: { from: [12, 26], to: [1, 1] },
    pattern: 'stars', scene: ['fireworks', 'twinkle'],
    colors: { primary: '#d4a017', secondary: '#111827', accent: '#ffe27a', background: '#fbf8ef' },
    wheel: ['#111827', '#f0c24b', '#ffffff', '#7a5c08', '#2b3548', '#fff0b8'],
    motif: [{ k: 'confetti', a: '#ffe27a' }, { k: 'sparkle', a: '#ffffff' }, { k: 'ribbon', a: '#ffffff' }, { k: 'star', a: '#ffe27a' }, { k: 'dot', a: '#111827' }],
    fall: true,
    copy: {
      welcome_title: '¡Feliz Año Nuevo! Gira y gana', welcome_text: 'Inicia sesión con Google y gira una vez por semana. Empieza el año con un premio.',
      button_text: '¡Girar y ganar!', celebration_message: '¡Empiezas el año ganando! Canjea tu premio en la tienda.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana y empieza el año con suerte!',
    },
  },
  {
    id: 'aniversario', name: 'Aniversario de la tienda', emoji: '🎉', dates: 'Cuando tú quieras',
    pattern: 'dots', scene: ['fireworks'],
    colors: { primary: '#ec5b1f', secondary: '#3b1204', accent: '#ffd166', background: '#fff8f1' },
    wheel: ['#ec5b1f', '#ffffff', '#ffd166', '#7a2208', '#ffe3cf'],
    motif: [{ k: 'balloon', a: '#ffd166' }, { k: 'confetti', a: '#ffffff' }, { k: 'sparkle', a: '#ffffff' }, { k: 'balloon', a: '#ffffff' }, { k: 'ribbon', a: '#ffd166' }],
    bunting: ['#ffd166', '#ffffff', '#ec5b1f', '#ffe3cf'],
    copy: {
      welcome_title: '¡Estamos de aniversario!', welcome_text: 'Celebra con nosotros: inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
      button_text: '¡Girar y celebrar!', celebration_message: '¡A celebrar! Ganaste un premio de aniversario.',
      no_prize_message: 'Esta vez no hubo premio. ¡Vuelve la próxima semana a seguir la fiesta!',
    },
  },
];

const BY_ID = new Map(SEASONS.map((s) => [s.id, s]));
export const seasonById = (id: string | null | undefined) => (id ? BY_ID.get(id) ?? null : null);

// ---------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY = 86_400_000;

/** Próxima (o actual) ocurrencia de la ventana típica, como fechas YYYY-MM-DD. */
export function suggestedRange(s: Season, now = new Date()): { from: string; to: string } | null {
  if (!s.window) return null;
  const today = ymd(now);
  const [fm, fd] = s.window.from;
  const [tm, td] = s.window.to;
  const wraps = tm < fm;
  for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const from = `${y}-${pad(fm)}-${pad(fd)}`;
    const to = `${y + (wraps ? 1 : 0)}-${pad(tm)}-${pad(td)}`;
    if (to >= today) return { from, to };
  }
  return null;
}

/** Estado de la temporada respecto a hoy: activa en su ventana típica o días que faltan. */
export function seasonTiming(s: Season, now = new Date()): { inWindow: boolean; daysUntil: number } | null {
  const r = suggestedRange(s, now);
  if (!r) return null;
  const today = ymd(now);
  if (r.from <= today && today <= r.to) return { inWindow: true, daysUntil: 0 };
  const start = new Date(`${r.from}T00:00:00`);
  const t0 = new Date(`${today}T00:00:00`);
  return { inWindow: false, daysUntil: Math.round((start.getTime() - t0.getTime()) / DAY) };
}

/** Temporadas para sugerir: las que están en su ventana y la más próxima en los siguientes 45 días. */
export function suggestions(now = new Date()): Array<{ season: Season; inWindow: boolean; daysUntil: number }> {
  return SEASONS
    .map((season) => ({ season, t: seasonTiming(season, now) }))
    .filter((x): x is { season: Season; t: { inWindow: boolean; daysUntil: number } } => !!x.t && (x.t.inWindow || x.t.daysUntil <= 45))
    .sort((a, b) => a.t.daysUntil - b.t.daysUntil)
    .map((x) => ({ season: x.season, ...x.t }));
}

// ---------------------------------------------------------------------
// Aplicación sobre la configuración publicada
// ---------------------------------------------------------------------
export interface SeasonFx { wheel: boolean; decor: boolean }
export interface Effective { config: SiteConfig; season: Season | null; fx: SeasonFx }

/** ¿Está activa la temporada elegida? Con `force` ignora las fechas (vista previa del panel). */
export function resolveSeason(theme: SiteConfig['theme'], now = new Date(), force = false): Season | null {
  const s = seasonById(theme.preset);
  if (!s) return null;
  if (!force) {
    const today = ymd(now);
    if (theme.preset_from && today < theme.preset_from) return null;
    if (theme.preset_until && today > theme.preset_until) return null;
  }
  return s;
}

export function effectiveConfig(cfg: SiteConfig, opts: { now?: Date; force?: boolean } = {}): Effective {
  const season = resolveSeason(cfg.theme, opts.now, opts.force);
  if (!season) return { config: cfg, season: null, fx: { wheel: false, decor: false } };
  const t = cfg.theme;
  return {
    season,
    fx: { wheel: t.preset_wheel !== false, decor: t.preset_decor !== false },
    config: {
      ...cfg,
      theme: { ...t, ...season.colors },
      copy: t.preset_copy !== false ? { ...cfg.copy, ...season.copy } : cfg.copy,
    },
  };
}

/** Recolorea los sectores con la paleta de la temporada (solo visual; no toca los premios). */
export function seasonSectors(sectors: Sector[], season: Season | null, enabled: boolean): Sector[] {
  if (!season || !enabled || sectors.length < 2) return sectors;
  const pal = season.wheel;
  const col = sectors.map((_, i) => pal[i % pal.length]);
  const n = col.length;
  // Evita que el último sector tenga el mismo color que el primero.
  if (n > 2 && col[n - 1] === col[0]) {
    col[n - 1] = pal.find((c) => c !== col[0] && c !== col[n - 2]) ?? col[n - 1];
  }
  return sectors.map((s, i) => ({ ...s, color: col[i] }));
}
