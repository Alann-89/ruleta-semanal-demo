import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { CouponStatus } from '../lib/types';
import { STATUS_LABEL } from '../lib/format';
import { IconCheck, IconChevronLeft, IconChevronRight, IconCopy, IconX } from './icons';
import { useToast } from '../context/Toast';

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-dim">
      <svg className="h-5 w-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}

export function PageLoader({ label }: { label?: string }) {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner label={label} /></div>;
}

export function Alert({ kind = 'info', children, className = '' }: { kind?: 'info' | 'error' | 'warn' | 'ok'; children: ReactNode; className?: string }) {
  const map = {
    info: 'border-sky-400/50 bg-sky-500/10', error: 'border-red-400/60 bg-red-500/10',
    warn: 'border-amber-400/60 bg-amber-500/10', ok: 'border-emerald-400/60 bg-emerald-500/10',
  };
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${map[kind]} ${className}`}>{children}</div>;
}

export function StatusBadge({ status }: { status: CouponStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children(id)}
      {hint && !error && <p className="text-xs text-dim">{hint}</p>}
      {error && <p className="text-xs font-semibold text-bad" role="alert">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-dim">{hint}</span>}
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? 'border-transparent bg-btn' : 'border-line bg-surface-2'}`}>
        <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false, hideClose = false, labelledBy }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean; hideClose?: boolean; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    const root = ref.current;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    (focusables()[0] ?? root)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); body.style.overflow = prevOverflow; prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? (title ? titleId : undefined)} tabIndex={-1}
        className={`card relative max-h-[94dvh] w-full overflow-y-auto rounded-b-none p-5 shadow-2xl sm:rounded-b-[1.25rem] ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        {title && <h2 id={titleId} className="font-display pr-10 text-xl font-semibold">{title}</h2>}
        {!hideClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-sm absolute right-3 top-3 !min-h-10 !w-10 !p-0"><IconX width={18} height={18} /></button>
        )}
        <div className={title ? 'mt-3' : ''}>{children}</div>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = 'Copiar', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      setDone(true); toast('Copiado', 'ok');
      setTimeout(() => setDone(false), 1800);
    } catch { toast('No se pudo copiar. Selecciona el texto manualmente.', 'error'); }
  };
  return (
    <button type="button" onClick={copy} className={`btn btn-ghost btn-sm ${className}`}>
      {done ? <IconCheck width={16} height={16} /> : <IconCopy width={16} height={16} />} {done ? 'Copiado' : label}
    </button>
  );
}

export function QrImage({ value, size = 220, className = '' }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode').then((m) => m.toDataURL(value, { margin: 2, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }))
      .then((u) => { if (alive) setSrc(u); }).catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [value, size]);
  return src
    ? <img src={src} width={size} height={size} alt="Código QR del premio" className={`rounded-xl bg-white ${className}`} style={{ width: size, height: size }} />
    : <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Pagination({ total, offset, limit, onChange }: { total: number; offset: number; limit: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Paginación">
      <button className="btn btn-ghost btn-sm" disabled={offset <= 0} onClick={() => onChange(Math.max(0, offset - limit))}><IconChevronLeft width={16} height={16} /> Anterior</button>
      <span className="text-sm text-dim" aria-live="polite">Página {page} de {pages} · {total} en total</span>
      <button className="btn btn-ghost btn-sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Siguiente <IconChevronRight width={16} height={16} /></button>
    </nav>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-dim">{children}</div>}
    </div>
  );
}

/** Texto sencillo con títulos (## ), viñetas (- ) y listas numeradas, sin HTML (a prueba de inyección). */
export function SimpleText({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    out.push(<Tag key={out.length}>{list.items.map((it, i) => <li key={i}>{it}</li>)}</Tag>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if (!line) { flush(); continue; }
    if ((m = /^#{1,3}\s+(.*)$/.exec(line))) { flush(); out.push(<h2 key={out.length}>{m[1]}</h2>); }
    else if ((m = /^[-*•]\s+(.*)$/.exec(line))) { if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; } list.items.push(m[1]); }
    else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) { if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; } list.items.push(m[1]); }
    else { flush(); out.push(<p key={out.length}>{line}</p>); }
  }
  flush();
  return <div className={`prose-lite ${className}`}>{out}</div>;
}

export function Avatar({ url, name, size = 36 }: { url?: string | null; name?: string | null; size?: number }) {
  const initial = (name?.trim()[0] ?? '?').toUpperCase();
  const safe = url && /^https:\/\//.test(url) ? url : null;
  return safe
    ? <img src={safe} alt="" referrerPolicy="no-referrer" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <span aria-hidden="true" className="inline-flex items-center justify-center rounded-full bg-[color:var(--c-secondary)] font-bold text-[color:var(--on-secondary)]" style={{ width: size, height: size }}>{initial}</span>;
}
