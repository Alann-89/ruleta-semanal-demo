import { memo, useEffect, useId, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import type { Sector } from '../lib/types';
import { contrastInk, spinEase, targetRotation } from '../lib/wheel';
import { initials, safeUrl } from '../lib/format';

export interface SpinOptions {
  /** Preferencia de movimiento reducido: sin giro, salta al resultado. */
  reduced: boolean;
  durationMs: number;
  /** Desplazamiento dentro del sector (fracción), para que no pare siempre al centro. */
  offset: number;
  turns: number;
  onTick: () => void;
}
export interface WheelHandle {
  spinTo(index: number, opts: SpinOptions): Promise<void>;
  /** Cancela cualquier animación en curso. */
  stop(): void;
}

interface Props {
  sectors: Sector[];
  ref?: Ref<WheelHandle>;
  highlight?: number | null;
  logoUrl?: string | null;
  storeName: string;
  /** Rueda decorativa (sin resultados cargados todavía). */
  placeholder?: boolean;
  dimmed?: boolean;
  /** La ruleta está girando: los focos se aceleran. */
  active?: boolean;
}

const C = 200;            // centro del viewBox
const R = 172;            // radio de los sectores
const PEG = 165;          // radio de los clavos (en las divisiones)
const HUB = 40;           // radio del cubo central

const rad = (d: number) => (d * Math.PI) / 180;
const px = (r: number, deg: number) => C + r * Math.sin(rad(deg));
const py = (r: number, deg: number) => C - r * Math.cos(rad(deg));

/** Ajusta una etiqueta al espacio radial disponible (1 o 2 líneas). */
export function fitLabel(label: string, avail: number, chord: number, maxFs: number, W = 0.52) {
  const text = label.trim();
  const one = (fs: number) => text.length * fs * W;
  for (let fs = maxFs; fs >= 10; fs -= 1) {
    if (one(fs) <= avail) return { lines: [text], fs };
    const words = text.split(/\s+/);
    if (words.length > 1 && fs * 2.3 <= chord) {
      let best: string[] | null = null;
      let bestW = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const w = Math.max(a.length, b.length) * fs * W;
        if (w < bestW) { bestW = w; best = [a, b]; }
      }
      if (best && bestW <= avail) return { lines: best, fs };
    }
  }
  return { lines: [text], fs: 10, squeeze: avail };
}

function WheelBase({ sectors, ref, highlight = null, logoUrl, storeName, placeholder = false, dimmed = false, active = false }: Props) {
  const uid = useId().replace(/:/g, '');
  const rotorRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const rotation = useRef(0);
  const raf = useRef<number | null>(null);
  const finish = useRef<(() => void) | null>(null);

  const list: Sector[] = useMemo(() => {
    if (!placeholder && sectors.length >= 2) return sectors;
    const tones = ['#ffffff', '#ec5b1f', '#ffe3cf', '#a8340e'];
    return Array.from({ length: 12 }, (_, i): Sector => ({
      id: String(i), name: '', label: '', color: tones[i % 4], image_url: null, kind: 'product',
    }));
  }, [sectors, placeholder]);

  const n = list.length;
  const slice = 360 / n;

  const stop = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    finish.current?.();
    finish.current = null;
  };

  useImperativeHandle(ref, () => ({
    stop,
    spinTo(index, opts) {
      stop();
      const rotor = rotorRef.current;
      const pointer = pointerRef.current;
      return new Promise<void>((resolve) => {
        if (!rotor) { resolve(); return; }
        const from = rotation.current;
        const to = targetRotation(from, n, index, opts.turns, opts.offset);
        const apply = (deg: number) => { rotor.style.transform = `rotate(${deg}deg)`; };
        if (opts.reduced) {
          rotation.current = to; apply(to); resolve(); return;
        }
        finish.current = () => { rotation.current = to; apply(to); if (pointer) pointer.style.transform = ''; resolve(); };
        const t0 = performance.now();
        let last = Math.floor(from / slice);
        let lastTick = 0;
        let kick = 0;
        let prev = t0;
        const frame = (now: number) => {
          const t = Math.min(1, (now - t0) / opts.durationMs);
          const rot = from + (to - from) * spinEase(t);
          apply(rot);
          const s = Math.floor(rot / slice);
          if (s !== last) {
            last = s;
            kick = 1;
            if (now - lastTick > 38) { lastTick = now; opts.onTick(); }
          }
          const dt = now - prev; prev = now;
          kick = Math.max(0, kick - dt / 140);
          if (pointer) pointer.style.transform = kick > 0 ? `rotate(${-kick * 24}deg)` : '';
          if (t < 1) raf.current = requestAnimationFrame(frame);
          else { raf.current = null; const f = finish.current; finish.current = null; f?.(); }
        };
        raf.current = requestAnimationFrame(frame);
      });
    },
  }), [n, slice]);

  useEffect(() => () => stop(), []);

  // Mantiene el ángulo si cambia la lista (por ejemplo, un sector que se agotó).
  useEffect(() => {
    if (rotorRef.current) rotorRef.current.style.transform = `rotate(${rotation.current}deg)`;
  }, [n]);

  const bulbs = useMemo(() => Array.from({ length: 30 }, (_, i) => i), []);
  const logo = safeUrl(logoUrl);
  const hasImages = n <= 12 && list.some((s) => safeUrl(s.image_url));
  const baseFs = n <= 6 ? 32 : n <= 8 ? 29 : n <= 10 ? 26 : n <= 12 ? 23 : 19;
  const ariaLabel = placeholder ? 'Ruleta de premios' : `Ruleta con ${n} resultados: ${list.map((s) => s.name || s.label).join(', ')}.`;

  return (
    <div className={`wheel-root mx-auto aspect-square w-full select-none ${active ? 'wheel-active' : ''} ${dimmed ? 'opacity-70 saturate-50' : ''}`} role="img" aria-label={ariaLabel}>
      <div className="wheel-lift absolute inset-0">
        {/* Bisel blanco con anillo naranja (estático) */}
        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <circle cx={C} cy={C} r="199" fill="#ffffff" />
          <circle cx={C} cy={C} r="199" fill="none" stroke="rgba(58,22,6,.14)" strokeWidth="1.2" />
          <circle cx={C} cy={C} r="178" fill="var(--c-primary)" />
          <circle cx={C} cy={C} r="174" fill="#ffffff" />
        </svg>

        {/* Focos naranja: tres capas desfasadas, la luz recorre el aro */}
        {[0, 1, 2].map((g) => (
          <svg key={g} viewBox="0 0 400 400" className={`bulbs bulbs-${g} pointer-events-none absolute inset-0 h-full w-full`} aria-hidden="true">
            {bulbs.filter((i) => i % 3 === g).map((i) => {
              const a = i * (360 / bulbs.length);
              return <circle key={i} cx={px(188.5, a)} cy={py(188.5, a)} r="5.6" fill="var(--c-primary)" />;
            })}
          </svg>
        ))}

        {/* Sectores (giratorio) */}
        <div ref={rotorRef} className="wheel-rotor absolute inset-0">
          <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontStretch: '78%' }}>
            <defs>
              <clipPath id={`clip${uid}`} clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5" /></clipPath>
              <radialGradient id={`shade${uid}`} cx=".5" cy=".5" r=".5">
                <stop offset="0" stopColor="#000" stopOpacity=".12" /><stop offset=".34" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity="0" />
              </radialGradient>
            </defs>
            {list.map((s, i) => {
              const a0 = i * slice, a1 = (i + 1) * slice, mid = a0 + slice / 2;
              const big = slice > 180 ? 1 : 0;
              const d = `M${C} ${C} L${px(R, a0)} ${py(R, a0)} A${R} ${R} 0 ${big} 1 ${px(R, a1)} ${py(R, a1)} Z`;
              const color = s.color.startsWith('#') ? s.color : '#7c3aed';
              const ink = contrastInk(color, 3.2);
              const img = hasImages ? safeUrl(s.image_url) : null;
              const right = Math.sin(rad(mid)) >= 0;
              const outer = img ? 124 : 152;
              const inner = HUB + 14;
              const avail = outer - inner;
              const chord = 2 * ((outer + inner) / 2) * Math.sin(rad(slice / 2)) * 0.8;
              const label = s.label.toUpperCase();
              const fit = label ? fitLabel(label, avail, chord, baseFs) : null;
              const imgSize = n <= 8 ? 42 : 34;
              const rot = right ? mid - 90 : mid + 90;
              const tx = right ? C + outer : C - outer;
              const light = ink === '#ffffff';
              return (
                <g key={s.id} className={highlight === i ? 'sector-win' : undefined}>
                  <path d={d} fill={color} />
                  {fit && (
                    <text
                      transform={`rotate(${rot} ${C} ${C})`} x={tx} y={C} textAnchor={right ? 'end' : 'start'}
                      fill={ink} fontSize={fit.fs} fontWeight="800" letterSpacing=".3"
                      stroke={light ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.5)'} strokeWidth="2" paintOrder="stroke" strokeLinejoin="round"
                      {...('squeeze' in fit && fit.squeeze ? { textLength: fit.squeeze, lengthAdjust: 'spacingAndGlyphs' as const } : {})}
                    >
                      {fit.lines.map((ln, k) => (
                        <tspan key={k} x={tx} dy={fit.lines.length === 1 ? '0.35em' : k === 0 ? '-0.22em' : '1.02em'}>{ln}</tspan>
                      ))}
                    </text>
                  )}
                  {img && (
                    <g transform={`rotate(${mid} ${C} ${C})`}>
                      <circle cx={C} cy={C - 142} r={imgSize / 2 + 3} fill="#fff" stroke="rgba(58,22,6,.16)" strokeWidth="1.5" />
                      <image href={img} x={C - imgSize / 2} y={C - 142 - imgSize / 2} width={imgSize} height={imgSize} clipPath={`url(#clip${uid})`} preserveAspectRatio="xMidYMid slice" />
                    </g>
                  )}
                </g>
              );
            })}
            {/* Divisiones finas */}
            {list.map((_, i) => {
              const a = i * slice;
              return <line key={`d${i}`} x1={px(HUB, a)} y1={py(HUB, a)} x2={px(R, a)} y2={py(R, a)} stroke="rgba(255,255,255,.95)" strokeWidth="2.4" />;
            })}
            <circle cx={C} cy={C} r={R} fill={`url(#shade${uid})`} pointerEvents="none" />
            {/* Clavos: los golpea el puntero */}
            {list.map((_, i) => {
              const a = i * slice;
              return <circle key={`p${i}`} cx={px(PEG, a)} cy={py(PEG, a)} r="3.8" fill="#ffffff" stroke="rgba(58,22,6,.3)" strokeWidth="1" />;
            })}
          </svg>
        </div>

        {/* Cubo central blanco */}
        <svg viewBox="0 0 400 400" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <clipPath id={`hubclip${uid}`}><circle cx={C} cy={C} r={HUB - 8} /></clipPath>
          </defs>
          <circle cx={C} cy={C + 2.5} r={HUB + 3} fill="rgba(0,0,0,.2)" />
          <circle cx={C} cy={C} r={HUB + 2} fill="#ffffff" />
          <circle cx={C} cy={C} r={HUB - 3} fill="none" stroke="var(--c-primary)" strokeWidth="3" />
          <circle cx={C} cy={C} r={HUB - 8} fill="var(--c-secondary)" />
          {logo ? (
            <image href={logo} x={C - (HUB - 8)} y={C - (HUB - 8)} width={(HUB - 8) * 2} height={(HUB - 8) * 2} clipPath={`url(#hubclip${uid})`} preserveAspectRatio="xMidYMid slice" />
          ) : (
            <text x={C} y={C} textAnchor="middle" dominantBaseline="central" fontSize="21" fontWeight="800" fill="var(--on-secondary)" style={{ fontFamily: 'var(--font-display)', fontStretch: '112%' }}>
              {initials(storeName)}
            </text>
          )}
        </svg>

        {/* Puntero: pasador plano naranja profundo con borde blanco */}
        <div className="pointer-events-none absolute left-1/2 z-10 w-[14%] -translate-x-1/2" style={{ top: '-10.2%' }} aria-hidden="true">
          <div ref={pointerRef} className="pointer">
            <svg viewBox="0 0 60 80" className="block h-auto w-full">
              <path d="M30 79 C30 79 4 46 4 28 a26 26 0 1 1 52 0 C56 46 30 79 30 79Z" fill="#ffffff" />
              <path d="M30 72 C30 72 10 44 10 28 a20 20 0 1 1 40 0 C50 44 30 72 30 72Z" fill="var(--c-secondary)" />
              <circle cx="30" cy="27" r="8.5" fill="#ffffff" />
              <circle cx="30" cy="27" r="3.6" fill="var(--c-primary)" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Wheel = memo(WheelBase);
