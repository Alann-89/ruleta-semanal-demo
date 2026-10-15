import type { CSSProperties, ReactNode } from 'react';
import type { MotifItem, PatternKind, Season, ShapeKind } from '../lib/seasons';

/** Posiciones fijas (en % del encabezado) para que la decoración sea estable y no tape el título. */
type Slot = { x: number; y: number; s: number; r: number; far?: boolean };
const SLOTS: Slot[] = [
  { x: 4, y: 14, s: 3.4, r: -14 }, { x: 89, y: 12, s: 3.8, r: 12 }, { x: 2, y: 40, s: 3.6, r: 10 }, { x: 92, y: 37, s: 3.4, r: -12 },
  { x: 7, y: 64, s: 4.2, r: -8 }, { x: 88, y: 62, s: 4, r: 16 }, { x: 2, y: 85, s: 3.2, r: 14 }, { x: 92, y: 86, s: 3.6, r: -10 },
  { x: 20, y: 6, s: 2.2, r: 20 }, { x: 77, y: 7, s: 2.4, r: -18 }, { x: 24, y: 90, s: 2.6, r: 8 }, { x: 74, y: 92, s: 2.8, r: -14 },
  { x: 15, y: 50, s: 2.2, r: -6 }, { x: 83, y: 50, s: 2.2, r: 8 },
  { x: 31, y: 16, s: 1.5, r: 24, far: true }, { x: 66, y: 15, s: 1.6, r: -22, far: true }, { x: 11, y: 27, s: 1.4, r: 10, far: true },
  { x: 86, y: 26, s: 1.5, r: -8, far: true }, { x: 12, y: 76, s: 1.6, r: 14, far: true }, { x: 85, y: 75, s: 1.6, r: -16, far: true },
  { x: 36, y: 94, s: 1.3, r: 6, far: true }, { x: 63, y: 95, s: 1.4, r: -6, far: true },
];

function Shape({ k, a, b, c }: MotifItem) {
  const b2 = b ?? a;
  const c2 = c ?? '#000';
  const shapes: Record<ShapeKind, ReactNode> = {
    heart: (<>
      <path d="M24 43C10 32 4 24 4 16.5a10.5 10.5 0 0 1 20-4.4 10.5 10.5 0 0 1 20 4.4C44 24 38 32 24 43Z" fill={a} />
      <ellipse cx="14" cy="14" rx="4.5" ry="3" fill="#fff" opacity=".4" transform="rotate(-30 14 14)" />
    </>),
    sparkle: <path d="M24 2C26 17 31 22 46 24 31 26 26 31 24 46 22 31 17 26 2 24 17 22 22 17 24 2Z" fill={a} />,
    star: <path d="m24 3 6.2 13.6 14.8 1.6-11 10 3.2 14.6L24 34.8 10.8 42.8 14 28.2 3 18.2l14.8-1.6Z" fill={a} />,
    snowflake: (
      <g stroke={a} strokeWidth="3" strokeLinecap="round" fill="none">
        {[0, 60, 120].map((r) => (
          <g key={r} transform={`rotate(${r} 24 24)`}>
            <path d="M24 4v40M18 10l6 6 6-6M18 38l6-6 6 6" />
          </g>
        ))}
      </g>
    ),
    confetti: <rect x="17" y="5" width="13" height="38" rx="3" fill={a} transform="rotate(28 24 24)" />,
    dot: <circle cx="24" cy="24" r="14" fill={a} />,
    ribbon: <path d="M5 30c6-18 12-18 14-6s8 12 14-6 8-6 10-2" fill="none" stroke={a} strokeWidth="5" strokeLinecap="round" />,
    flower: (<>
      {Array.from({ length: 10 }, (_, i) => <ellipse key={i} cx="24" cy="10.5" rx="5.6" ry="9.5" fill={a} transform={`rotate(${i * 36} 24 24)`} />)}
      <circle cx="24" cy="24" r="7" fill={b2} />
      <circle cx="24" cy="24" r="3" fill="#fff" opacity=".45" />
    </>),
    bat: <path d="M24 17c-3 0-4-4-5-7-1 3-2 5-4 6-5-4-10-3-13 1 4 1 7 3 8 7 2-2 5-2 7 1 2-2 5 0 7 4 2-4 5-6 7-4 2-3 5-3 7-1 1-4 4-6 8-7-3-4-8-5-13-1-2-1-3-3-4-6-1 3-2 7-5 7Z" fill={a} transform="translate(0 4)" />,
    pumpkin: (<>
      <rect x="22" y="5" width="4.5" height="9" rx="2" fill={b2} />
      <ellipse cx="14.5" cy="29" rx="10" ry="14" fill={a} />
      <ellipse cx="33.5" cy="29" rx="10" ry="14" fill={a} />
      <ellipse cx="24" cy="29" rx="9" ry="15" fill={a} stroke="rgba(0,0,0,.18)" strokeWidth="1.5" />
      <path d="M13 25l4-5 3 5ZM28 25l3-5 4 5ZM15 35c3 4 15 4 18 0-3 1-5-1-9 0-4-1-6 1-9 0Z" fill={c2} />
    </>),
    skull: (<>
      <path d="M24 4C13 4 7 12 7 21c0 6 3 9 6 11v8h22v-8c3-2 6-5 6-11C41 12 35 4 24 4Z" fill={a} />
      <circle cx="16.5" cy="22" r="6" fill={b2} /><circle cx="31.5" cy="22" r="6" fill={b2} />
      <circle cx="16.5" cy="22" r="2.4" fill={c2} /><circle cx="31.5" cy="22" r="2.4" fill={c2} />
      <path d="M24 28l-3.2 4.5h6.4Z" fill={b2} />
      <path d="M17 36v4M21 36v4M25 36v4M29 36v4" stroke={b2} strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="10" r="2" fill={c2} /><circle cx="18" cy="12" r="1.4" fill={c2} /><circle cx="30" cy="12" r="1.4" fill={c2} />
    </>),
    balloon: (<>
      <path d="M24 35c-1 4 3 6 0 11" fill="none" stroke={a} strokeWidth="1.6" opacity=".7" />
      <ellipse cx="24" cy="18" rx="13" ry="16" fill={a} />
      <path d="M21.5 33h5l-2.5 4Z" fill={a} />
      <ellipse cx="18" cy="11" rx="3.2" ry="5" fill="#fff" opacity=".4" transform="rotate(25 18 11)" />
    </>),
    sun: (<>
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x="22.6" y="2" width="2.8" height="9" rx="1.4" fill={a} transform={`rotate(${i * 30} 24 24)`} />)}
      <circle cx="24" cy="24" r="11" fill={a} />
      <circle cx="20.5" cy="20.5" r="3.4" fill={b2} opacity=".5" />
    </>),
    pencil: (
      <g transform="rotate(40 24 24)">
        <rect x="19" y="3" width="10" height="7" rx="2" fill={c ?? '#ff7d9c'} />
        <rect x="19" y="9" width="10" height="4" fill="#cfd4dc" />
        <rect x="19" y="13" width="10" height="21" fill={a} />
        <path d="M19 34h10l-5 11Z" fill={b2} />
        <path d="M22 40h4l-2 5Z" fill="#33363d" />
      </g>
    ),
    gift: (<>
      <rect x="6" y="19" width="36" height="24" rx="2" fill={a} />
      <rect x="4" y="13" width="40" height="9" rx="2" fill={a} />
      <rect x="21" y="13" width="6" height="30" fill={b2} />
      <path d="M24 13c-9-9-15-3-9 0Zm0 0c9-9 15-3 9 0Z" fill="none" stroke={b2} strokeWidth="3.4" strokeLinejoin="round" />
    </>),
    tag: (<>
      <path d="M4 25 25 4h18v18L22 43Z" fill={a} />
      <circle cx="35" cy="12" r="3.2" fill="#fff" opacity=".85" />
      <text x="20" y="31" fontSize="17" fontWeight="900" fill={b2} transform="rotate(-45 20 31)" textAnchor="middle" fontFamily="sans-serif">%</text>
    </>),
    crown: (<>
      <path d="M5 36 8 13l10 10 6-14 6 14 10-10 3 23Z" fill={a} />
      <rect x="5" y="36" width="38" height="7" rx="2" fill={a} />
      <circle cx="24" cy="39.5" r="2" fill={b2} /><circle cx="14" cy="39.5" r="1.6" fill={b2} /><circle cx="34" cy="39.5" r="1.6" fill={b2} />
    </>),
    tie: (<>
      <path d="M19 4h10l-2 9h-6Z" fill={a} />
      <path d="M21 13h6l6 27-9 6-9-6Z" fill={a} />
      <path d="M24 16v26" stroke={b2} strokeWidth="2" opacity=".5" />
    </>),
  };
  return <svg viewBox="0 0 48 48" className="h-full w-full" focusable="false">{shapes[k]}</svg>;
}

/** Banderines de papel picado / fiesta a lo largo de la parte superior. */
function Bunting({ colors }: { colors: string[] }) {
  const flags = Array.from({ length: 22 }, (_, i) => i);
  return (
    <svg className="sd-bunting" viewBox="0 0 880 64" preserveAspectRatio="xMidYMin slice" focusable="false">
      <path d="M-10 6Q440 30 890 6" fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="2" />
      {flags.map((i) => {
        const x = i * 40 + 2;
        const y = 6 + 24 * Math.sin((x / 880) * Math.PI) * 0.88;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d="M0 0h36l-18 40Z" fill={colors[i % colors.length]} />
            <circle cx="18" cy="12" r="3.2" fill="rgba(0,0,0,.16)" />
            <path d="M9 4h18" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeDasharray="3 3" />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------
// Tramas, escenas y capas grandes
// ---------------------------------------------------------------------
const enc = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const PATTERNS: Record<PatternKind, { size: number; svg: string }> = {
  dots: { size: 30, svg: `<svg ${NS} width="30" height="30"><circle cx="15" cy="15" r="2.6" fill="#fff" fill-opacity=".16"/></svg>` },
  stripes: { size: 34, svg: `<svg ${NS} width="34" height="34"><path d="M-4 38 38-4M-4 21 21-4M13 38 38 13" stroke="#fff" stroke-opacity=".13" stroke-width="7"/></svg>` },
  stars: { size: 46, svg: `<svg ${NS} width="46" height="46"><path d="M23 14l2.2 5.4 5.8.5-4.4 3.8 1.4 5.6-5-3.1-5 3.1 1.4-5.6-4.4-3.8 5.8-.5Z" fill="#fff" fill-opacity=".18"/></svg>` },
  hearts: { size: 44, svg: `<svg ${NS} width="44" height="44"><path d="M22 31c-6-4.6-8.5-8-8.5-11a4.7 4.7 0 0 1 8.5-2.8A4.7 4.7 0 0 1 30.500 20c0 3-2.500 6.400-8.500 11Z" fill="#fff" fill-opacity=".17"/></svg>` },
  flowers: {
    size: 48,
    svg: `<svg ${NS} width="48" height="48"><g fill="#fff" fill-opacity=".17">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="24" cy="17" rx="3.6" ry="5.5" transform="rotate(${r} 24 24)"/>`).join('')}<circle cx="24" cy="24" r="2.8"/></g></svg>`,
  },
  diamonds: { size: 36, svg: `<svg ${NS} width="36" height="36"><path d="M18 8l8 10-8 10-8-10Z" fill="none" stroke="#fff" stroke-opacity=".17" stroke-width="2"/></svg>` },
  grid: { size: 32, svg: `<svg ${NS} width="32" height="32"><path d="M0 .5h32M.5 0v32" stroke="#fff" stroke-opacity=".16" stroke-width="1.5"/></svg>` },
};

function Cobweb({ side }: { side: 'l' | 'r' }) {
  const spokes = [0, 22.5, 45, 67.5, 90];
  const pt = (r: number, a: number): [number, number] => [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)];
  return (
    <svg className={`sd-scene sd-cobweb sd-cobweb-${side}`} viewBox="0 0 110 110" focusable="false">
      <g fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.3" strokeLinecap="round">
        {spokes.map((a) => { const [x, y] = pt(106, a); return <path key={a} d={`M0 0L${x} ${y}`} />; })}
        {[26, 50, 74, 98].map((r) => {
          const [sx, sy] = pt(r, spokes[0]);
          const d = spokes.slice(1).map((a, i) => {
            const [x1, y1] = pt(r, a);
            const [cx, cy] = pt(r * 0.86, (a + spokes[i]) / 2);
            return `Q${cx} ${cy} ${x1} ${y1}`;
          }).join('');
          return <path key={r} d={`M${sx} ${sy}${d}`} />;
        })}
      </g>
      {side === 'l' && (
        <g className="sd-spider">
          <path d="M70 0V34" stroke="#fff" strokeOpacity=".6" strokeWidth="1" />
          <g stroke="#14081f" strokeWidth="1.6" strokeLinecap="round" fill="none"><path d="M64 38l-8-5M64 42l-9 1M65 46l-8 6M76 38l8-5M76 42l9 1M75 46l8 6" /></g>
          <ellipse cx="70" cy="42" rx="6.5" ry="7.5" fill="#14081f" /><circle cx="67.8" cy="40" r="1.3" fill="#ff5d5d" /><circle cx="72.2" cy="40" r="1.3" fill="#ff5d5d" />
        </g>
      )}
    </svg>
  );
}

function Moon() {
  return (
    <svg className="sd-scene sd-moon" viewBox="0 0 100 100" focusable="false">
      <circle cx="50" cy="50" r="40" fill="#fff1b8" />
      <circle cx="36" cy="38" r="8" fill="#f2dc8c" /><circle cx="62" cy="58" r="10.5" fill="#f2dc8c" /><circle cx="44" cy="68" r="5" fill="#f2dc8c" /><circle cx="64" cy="31" r="4.5" fill="#f2dc8c" />
      <path d="M50 10a40 40 0 0 0 0 80 30 40 0 0 1 0-80Z" fill="#fff" opacity=".35" />
    </svg>
  );
}

function BigSun() {
  return (
    <svg className="sd-scene sd-bigsun" viewBox="0 0 100 100" focusable="false">
      <g className="sd-sunrays" fill="#ffe066">{Array.from({ length: 14 }, (_, i) => <path key={i} d="M50 2l5 16h-10Z" transform={`rotate(${i * (360 / 14)} 50 50)`} />)}</g>
      <circle cx="50" cy="50" r="24" fill="#ffd23f" /><circle cx="43" cy="43" r="8" fill="#fff" opacity=".4" />
    </svg>
  );
}

function Burst({ colors, style }: { colors: string[]; style: CSSProperties }) {
  return (
    <svg className="sd-scene sd-fw" viewBox="0 0 100 100" style={style} focusable="false">
      {Array.from({ length: 14 }, (_, i) => {
        const c = colors[i % colors.length];
        return (
          <g key={i} transform={`rotate(${(i * 360) / 14} 50 50)`}>
            <path d="M50 30V14" stroke={c} strokeWidth="3.4" strokeLinecap="round" /><circle cx="50" cy="8" r="3.4" fill={c} />
          </g>
        );
      })}
      <circle cx="50" cy="50" r="4" fill="#fff" />
    </svg>
  );
}

function SnowHill() {
  return (
    <svg className="sd-scene sd-snowhill" viewBox="0 0 400 70" preserveAspectRatio="none" focusable="false">
      <path d="M0 40C60 14 120 14 190 34S330 54 400 22V70H0Z" fill="#fff" opacity=".55" />
      <path d="M0 52C70 30 150 34 220 48S340 60 400 42V70H0Z" fill="#fff" />
    </svg>
  );
}

const TWINKLES: Array<[number, number, number]> = [[9, 7, 1.1], [23, 14, 0.8], [14, 24, 0.9], [34, 5, 0.7], [88, 6, 1], [75, 11, 0.8], [94, 21, 0.9], [66, 4, 0.7], [4, 30, 0.7], [97, 33, 0.8]];

/** Variables CSS que dependen de la temporada (focos de colores). Se aplican al encabezado. */
export function seasonVars(season: Season | null): CSSProperties | undefined {
  if (!season) return undefined;
  return { '--bulb-1': season.colors.accent, '--bulb-2': season.colors.secondary } as CSSProperties;
}

/** Capa decorativa del encabezado. No es interactiva ni se anuncia a lectores de pantalla. */
export function SeasonDecor({ season }: { season: Season }) {
  const slots = season.bunting ? SLOTS.filter((s) => s.y > 12 || s.x < 12 || s.x > 88) : SLOTS;
  const scene = season.scene ?? [];
  const pat = PATTERNS[season.pattern];
  const fw = [season.colors.accent, '#ffffff', season.wheel[2] ?? season.colors.primary];
  return (
    <div className="season-decor" aria-hidden="true">
      <div className="sd-rays" />
      <div className="sd-pattern" style={{ backgroundImage: enc(pat.svg), backgroundSize: `${pat.size}px` }} />
      {scene.includes('twinkle') && TWINKLES.map(([x, y, z], i) => (
        <svg key={i} className="sd-scene sd-twinkle" viewBox="0 0 48 48" focusable="false"
          style={{ left: `${x}%`, top: `${y}%`, width: `${z * 1.4}rem`, '--d': `${-i * 0.55}s` } as CSSProperties}>
          <path d="M24 2C26 17 31 22 46 24 31 26 26 31 24 46 22 31 17 26 2 24 17 22 22 17 24 2Z" fill={i % 3 === 0 ? season.colors.accent : '#fff'} />
        </svg>
      ))}
      {scene.includes('moon') && <Moon />}
      {scene.includes('bigsun') && <BigSun />}
      {scene.includes('cobweb') && <><Cobweb side="l" /><Cobweb side="r" /></>}
      {scene.includes('fireworks') && (
        <>
          <Burst colors={fw} style={{ left: '3%', top: '8%', '--d': '0s' } as CSSProperties} />
          <Burst colors={[fw[1], fw[0], fw[2]]} style={{ right: '4%', top: '4%', '--d': '-1.4s' } as CSSProperties} />
          <Burst colors={[fw[2], fw[1], fw[0]]} style={{ left: '14%', top: '30%', width: '3.4rem', '--d': '-2.3s' } as CSSProperties} />
        </>
      )}
      {scene.includes('snowhill') && <SnowHill />}
      {season.bunting && <Bunting colors={season.bunting} />}
      {slots.map((p, i) => {
        const m = season.motif[i % season.motif.length];
        const style = {
          '--x': p.x, '--y': p.y, '--s': `${p.s}rem`, '--r': `${p.r}deg`,
          '--d': `${-((i * 1.7) % 9).toFixed(2)}s`, '--t': `${(season.fall ? 9 : 5) + (i % 5) * 1.3}s`,
        } as CSSProperties;
        return (
          <span key={i} className={`sd ${season.fall ? 'sd-fall' : 'sd-float'} ${p.far ? 'sd-far' : ''}`} style={style}>
            <Shape {...m} />
          </span>
        );
      })}
    </div>
  );
}
