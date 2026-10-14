/**
 * Geometría de la ruleta. Convención: el sector 0 empieza arriba (donde está
 * el puntero) y los sectores avanzan en sentido horario. La rueda gira con
 * rotación positiva (horaria), así que el ángulo de la rueda que queda bajo el
 * puntero es  (360 - rotación) mod 360.
 */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Índice del sector que queda bajo el puntero para una rotación dada. */
export function sectorAtRotation(rotationDeg: number, n: number): number {
  const slice = 360 / n;
  const under = mod(360 - mod(rotationDeg, 360), 360);
  return Math.min(n - 1, Math.floor(under / slice));
}

/**
 * Rotación final para que el sector `index` quede bajo el puntero.
 * `offset` ∈ (-0.4, 0.4) desplaza el punto de parada dentro del sector
 * (fracción del ancho del sector) para que no pare siempre en el centro,
 * sin acercarse nunca a la línea divisoria. Siempre avanza hacia adelante al
 * menos `turns` vueltas completas desde la rotación actual.
 */
export function targetRotation(current: number, n: number, index: number, turns: number, offset = 0): number {
  const slice = 360 / n;
  const clamped = Math.max(-0.4, Math.min(0.4, offset));
  const pointerAngle = index * slice + slice / 2 + clamped * slice;
  const landing = mod(360 - pointerAngle, 360);
  const base = Math.ceil(current / 360) * 360;
  return base + Math.max(1, Math.floor(turns)) * 360 + landing;
}

/** cubic-bezier(x1,y1,x2,y2) como en CSS: arranca despacio, acelera y frena largo. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    while (lo < hi) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) lo = t; else hi = t;
      t = (hi - lo) / 2 + lo;
      if (hi - lo < 1e-7) break;
    }
    return sy(t);
  };
}

/** Aceleración corta, velocidad máxima y frenado largo. */
export const spinEase = cubicBezier(0.3, 0.0, 0.08, 1.0);

/** Color de texto legible sobre un fondo hexadecimal (WCAG: luminancia relativa). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const v = parseInt(m[1], 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export const DARK_INK = '#3a1606';
export const LIGHT_INK = '#ffffff';
/**
 * Texto legible sobre un fondo: el de mayor contraste. Con `lightMin` se prefiere el blanco
 * mientras alcance esa relación (para texto grande y en negrita: botones, etiquetas de sector),
 * que es lo habitual sobre naranja de marca.
 */
export function contrastInk(bg: string, lightMin = 0): string {
  const l = luminance(bg);
  const withWhite = 1.05 / (l + 0.05);
  const withDark = (l + 0.05) / (luminance(DARK_INK) + 0.05);
  if (lightMin > 0 && withWhite >= lightMin) return LIGHT_INK;
  return withWhite >= withDark ? LIGHT_INK : DARK_INK;
}
