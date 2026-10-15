import type { CSSProperties } from 'react';
import type { MotifItem, Season, ShapeKind } from '../lib/seasons';

/** Posiciones fijas (en % del encabezado) para que la decoración sea estable y no tape el título. */
const SLOTS: Array<{ x: number; y: number; s: number; r: number }> = [
  { x: 6, y: 13, s: 2.7, r: -14 }, { x: 91, y: 10, s: 3, r: 12 }, { x: 19, y: 4, s: 1.7, r: 20 }, { x: 79, y: 5, s: 1.9, r: -18 },
  { x: 3, y: 38, s: 2.8, r: 10 }, { x: 94, y: 35, s: 2.6, r: -12 }, { x: 9, y: 62, s: 3.2, r: -8 }, { x: 90, y: 60, s: 3, r: 16 },
  { x: 4, y: 83, s: 2.4, r: 14 }, { x: 94, y: 84, s: 2.8, r: -10 }, { x: 23, y: 90, s: 1.9, r: 8 }, { x: 77, y: 92, s: 2.1, r: -14 },
  { x: 30, y: 15, s: 1.4, r: 24 }, { x: 68, y: 14, s: 1.5, r: -22 }, { x: 14, y: 48, s: 1.6, r: -6 }, { x: 85, y: 47, s: 1.6, r: 8 },
];

function Shape({ k, a, b, c }: MotifItem) {
  const b2 = b ?? a;
  const c2 = c ?? '#000';
  const shapes: Record<ShapeKind, React.ReactNode> = {
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

/** Capa decorativa del encabezado. No es interactiva ni se anuncia a lectores de pantalla. */
export function SeasonDecor({ season }: { season: Season }) {
  const slots = season.bunting ? SLOTS.filter((s) => s.y > 9 || s.x < 12 || s.x > 88) : SLOTS;
  return (
    <div className="season-decor" aria-hidden="true">
      {season.bunting && <Bunting colors={season.bunting} />}
      {slots.map((p, i) => {
        const m = season.motif[i % season.motif.length];
        const style = {
          '--x': p.x, '--y': p.y, '--s': `${p.s}rem`, '--r': `${p.r}deg`,
          '--d': `${-((i * 1.7) % 9).toFixed(2)}s`, '--t': `${(season.fall ? 9 : 5) + (i % 5) * 1.3}s`,
        } as CSSProperties;
        return (
          <span key={i} className={`sd ${season.fall ? 'sd-fall' : 'sd-float'}`} style={style}>
            <Shape {...m} />
          </span>
        );
      })}
    </div>
  );
}
