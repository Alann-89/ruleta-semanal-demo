import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { adminDiscardDraft, adminGetConfig, adminPublishConfig, adminSaveDraft, ApiError } from '../lib/api';
import type { AdminConfig, HoursRow, Sector, SiteConfig } from '../lib/types';
import { safeUrl } from '../lib/format';
import { DEFAULT_LOGO } from '../lib/defaultConfig';
import { uploadImage } from '../lib/media';
import { Alert, Field, PageLoader, Spinner, Switch } from '../components/ui';
import { Wheel } from '../components/Wheel';
import { SeasonDecor, seasonVars } from '../components/SeasonDecor';
import { SEASONS, effectiveConfig, resolveSeason, seasonById, seasonSectors, suggestedRange, suggestions, ymd, type Season } from '../lib/seasons';
import { themeVars } from '../lib/theme';
import { IconCheck, IconX } from '../components/icons';
import { useToast } from '../context/Toast';
import { useApp } from '../context/AppContext';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function ImageField({ label, hint, value, onChange, folder, maxSide }: { label: string; hint: string; value: string | null; onChange: (v: string | null) => void; folder: 'prizes' | 'branding'; maxSide: number }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const img = safeUrl(value);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="flex items-center gap-3">
          {img ? <img src={img} alt="" className="h-14 w-14 rounded-lg border border-line object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line text-xs text-dim">Sin imagen</span>}
          <input ref={ref} id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setBusy(true);
            try { onChange(await uploadImage(f, folder, maxSide)); toast('Imagen subida y comprimida', 'ok'); }
            catch (err) { toast(err instanceof Error ? err.message : 'No se pudo subir', 'error'); }
            finally { setBusy(false); if (ref.current) ref.current.value = ''; }
          }} />
          <label htmlFor={id} className="btn btn-ghost btn-sm cursor-pointer">{busy ? <Spinner label="Subiendo" /> : img ? 'Cambiar' : 'Subir'}</label>
          {img && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>Quitar</button>}
        </div>
      )}
    </Field>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex items-center gap-2">
          <input id={id} type="color" className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-transparent p-1" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
          <input aria-label={`${label} en hexadecimal`} className="input w-32 font-mono" value={value} maxLength={7} onChange={(e) => onChange(e.target.value)} />
        </div>
      )}
    </Field>
  );
}

function Range({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <Field label={`${label}: ${value}`} hint={hint}>
      {(id) => <input id={id} type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} />}
    </Field>
  );
}

/** Vista previa fiel: usa los mismos componentes y variables CSS que el sitio real. */
function Preview({ cfg: raw, sectors: baseSectors, device }: { cfg: SiteConfig; sectors: Sector[]; device: 'mobile' | 'desktop' }) {
  // La vista previa siempre muestra la temporada elegida, aunque sus fechas aún no lleguen.
  const { config: cfg, season, fx } = effectiveConfig(raw, { force: true });
  const sectors = seasonSectors(baseSectors, season, fx.wheel);
  const style = { ...themeVars(cfg.theme), '--bg-image': 'none', color: 'var(--ink)', fontFamily: 'var(--font-sans)' } as CSSProperties;
  const logo = safeUrl(cfg.store.logo_url);
  return (
    <div className={`mx-auto overflow-hidden rounded-[1.75rem] border-[6px] border-slate-800 shadow-xl ${device === 'mobile' ? 'w-[375px] max-w-full' : 'w-full'}`} aria-label={`Vista previa ${device === 'mobile' ? 'móvil' : 'de escritorio'}`}>
      <div className="theme-scope stage-scope h-[640px] overflow-y-auto" style={style}>
        <header className="flex h-14 items-center gap-3 border-b px-4" style={{ borderColor: 'var(--line)', background: '#fff' }}>
          <img src={logo ?? DEFAULT_LOGO} alt="" className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-display truncate text-base font-extrabold uppercase tracking-[0.04em]">{cfg.store.name}</span>
        </header>
        <section className="hero" style={seasonVars(season)}>
          {season && fx.decor && <SeasonDecor season={season} />}
          <div className={`relative mx-auto px-4 pb-12 pt-6 ${device === 'desktop' ? 'max-w-2xl' : ''}`}>
            <h1 className="font-display mx-auto max-w-[17ch] text-center text-[1.7rem] font-extrabold leading-[1.05]" style={{ color: 'var(--hero-ink)' }}>{cfg.copy.welcome_title}</h1>
            <div className={`mx-auto px-[1.5%] pb-1 pt-[13%] ${device === 'desktop' ? 'max-w-[27rem]' : 'max-w-[19rem]'}`}><Wheel sectors={sectors} placeholder={sectors.length < 2} logoUrl={cfg.store.logo_url} storeName={cfg.store.name} /></div>
          </div>
        </section>
        <div className="sheet">
          <div className={`mx-auto px-4 pb-8 pt-7 text-center ${device === 'desktop' ? 'max-w-2xl' : ''}`}>
            <button type="button" className="btn-spin ready" tabIndex={-1}>{cfg.copy.button_text || '¡Girar y ganar!'}</button>
            <div className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
              {[['Ganas', cfg.copy.celebration_message], ['Sin premio', cfg.copy.no_prize_message], ['Giro extra', cfg.copy.extra_spin_message]].map(([k, v]) => (
                <p key={k} className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}><strong>{k}:</strong> {v}</p>
              ))}
            </div>
            {(cfg.contact.address || cfg.contact.hours.length > 0) && (
              <div className="mx-auto mt-6 max-w-sm rounded-2xl border p-4 text-left text-sm" style={{ borderColor: 'var(--line)', background: '#fff' }}>
                <p className="font-display mb-1 text-base font-extrabold uppercase tracking-[0.04em]">{cfg.store.name}</p>
                {cfg.contact.address && <p>{cfg.contact.address}</p>}
                {cfg.contact.hours.map((h, i) => <p key={i} style={{ color: 'var(--ink-dim)' }}><strong style={{ color: 'var(--ink)' }}>{h.days}:</strong> {h.hours}</p>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Selector de diseños de temporada: se superponen al diseño de marca y pueden programarse por fechas. */
function SeasonPicker({ theme, onChange }: { theme: SiteConfig['theme']; onChange: (fn: (t: SiteConfig['theme']) => void) => void }) {
  const now = useMemo(() => new Date(), []);
  const current = seasonById(theme.preset);
  const hints = useMemo(() => suggestions(now).slice(0, 3), [now]);
  const active = resolveSeason(theme, now);
  const scheduled = !!(theme.preset_from || theme.preset_until);

  const choose = (s: Season | null) => onChange((t) => {
    t.preset = s?.id ?? null;
    if (s) { t.preset_copy = true; t.preset_wheel = true; t.preset_decor = true; t.preset_from = null; t.preset_until = null; }
  });
  const toggleSchedule = (on: boolean) => onChange((t) => {
    if (!on || !current) { t.preset_from = null; t.preset_until = null; return; }
    const r = suggestedRange(current, now);
    const start = ymd(now);
    const end = ymd(new Date(now.getTime() + 14 * 86_400_000));
    t.preset_from = r ? (r.from > start ? r.from : start) : start;
    t.preset_until = r ? r.to : end;
  });
  const when = (d: number, inWin: boolean) => (inWin ? 'es temporada' : d === 1 ? 'empieza mañana' : `empieza en ${d} días`);

  return (
    <section className="card space-y-4 p-4" aria-labelledby="a-temporada">
      <div>
        <h2 id="a-temporada" className="font-display text-lg font-semibold">Diseño de temporada</h2>
        <p className="text-sm text-dim">Viste la ruleta y la cabecera para una fecha especial: colores, decoración animada, colores de los sectores y textos. No borra tus colores de marca; al quitarlo o terminar las fechas, el sitio vuelve a como estaba.</p>
      </div>

      {hints.length > 0 && (
        <div className="rounded-xl border border-line p-3" style={{ background: 'var(--surface-2, #f6f3ef)' }}>
          <p className="mb-2 text-sm font-semibold">Sugerido para estas fechas</p>
          <div className="flex flex-wrap gap-2">
            {hints.map((h) => (
              <button key={h.season.id} type="button" className="btn btn-ghost btn-sm" onClick={() => choose(h.season)}>
                {h.season.emoji} {h.season.name} · <span className="text-dim">{when(h.daysUntil, h.inWindow)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div role="radiogroup" aria-label="Diseño de temporada" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[null, ...SEASONS].map((s) => {
          const on = (s?.id ?? null) === (current?.id ?? null);
          const c1 = s?.colors.primary ?? theme.primary, c2 = s?.colors.secondary ?? theme.secondary;
          const pal = s ? s.wheel : [theme.primary, '#ffffff', theme.secondary, theme.accent];
          const wheel = `conic-gradient(${Array.from({ length: 8 }, (_, i) => `${pal[i % pal.length]} ${i * 12.5}% ${(i + 1) * 12.5}%`).join(',')})`;
          return (
            <button key={s?.id ?? 'marca'} type="button" role="radio" aria-checked={on} onClick={() => choose(s)}
              className="rounded-2xl border-2 bg-surface p-2.5 text-left transition-shadow hover:shadow-md focus-visible:outline-2"
              style={{ borderColor: on ? '#a8340e' : 'var(--line)', boxShadow: on ? '0 0 0 3px rgb(168 52 14 / .15)' : undefined }}>
              <span className="relative mb-2 flex h-20 items-center justify-center overflow-hidden rounded-xl" style={{ background: c2 }} aria-hidden="true">
                <span className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${c1}, ${c1})`, clipPath: 'polygon(0 36%, 50% 0, 100% 36%, 100% 100%, 0 100%)' }} />
                <span className="relative mt-3 h-14 w-14 rounded-full border-[5px] border-white shadow-lg" style={{ background: wheel }} />
                <span className="absolute left-2 top-1 text-lg drop-shadow">{s?.emoji ?? '🏠'}</span>
                <span className="absolute bottom-1 right-2 text-lg opacity-90 drop-shadow">{s?.emoji ?? ''}</span>
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold"><span aria-hidden="true">{s?.emoji ?? '🏠'}</span>{s?.name ?? 'Diseño de marca'}{on && <IconCheck className="ml-auto" width={16} height={16} style={{ color: '#a8340e' }} />}</span>
              <span className="block text-xs text-dim">{s?.dates ?? 'Sin temporada'}</span>
            </button>
          );
        })}
      </div>

      {current && (
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-sm" aria-live="polite">
            {active ? <span className="font-semibold text-ok">Activo hoy en el sitio al publicar.</span>
              : <span className="font-semibold text-warn">Programado: hoy no se muestra (fuera de las fechas).</span>}
          </p>
          <Switch checked={theme.preset_decor !== false} onChange={(v) => onChange((t) => { t.preset_decor = v; })} label="Decoración animada" hint="Figuras flotantes o que caen en la cabecera. Se detienen si el dispositivo pide menos movimiento." />
          <Switch checked={theme.preset_wheel !== false} onChange={(v) => onChange((t) => { t.preset_wheel = v; })} label="Colores de la temporada en los sectores" hint="Solo cambia cómo se ve la ruleta; tus resultados y probabilidades no se tocan." />
          <Switch checked={theme.preset_copy !== false} onChange={(v) => onChange((t) => { t.preset_copy = v; })} label="Usar también los textos de la temporada" hint="Título, texto del botón y mensajes. Si lo apagas, se usan tus textos de la sección «Textos»." />
          <Switch checked={scheduled} onChange={toggleSchedule} label="Activar solo entre fechas" hint="Fuera de ese rango el sitio muestra tu diseño de marca, sin que tengas que volver a publicar." />
          {scheduled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Desde">{(id) => <input id={id} type="date" className="input" value={theme.preset_from ?? ''} onChange={(e) => onChange((t) => { t.preset_from = e.target.value || null; })} />}</Field>
              <Field label="Hasta (inclusive)">{(id) => <input id={id} type="date" className="input" value={theme.preset_until ?? ''} min={theme.preset_from ?? undefined} onChange={(e) => onChange((t) => { t.preset_until = e.target.value || null; })} />}</Field>
            </div>
          )}
          <p className="text-xs text-dim">Las fechas se comparan con la fecha del dispositivo de cada visitante. Los cambios llegan a los clientes al publicar.</p>
        </div>
      )}
    </section>
  );
}

export default function AppearancePage() {
  const toast = useToast();
  const { refreshPublic } = useApp();
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [draft, setDraft] = useState<SiteConfig | null>(null);
  const [serverDraft, setServerDraft] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'discard'>(null);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const c = await adminGetConfig(); setCfg(c); setDraft(clone(c.site.draft)); setServerDraft(JSON.stringify(c.site.draft)); setLoadError(null); }
    catch (e) { setLoadError(e instanceof ApiError ? e.message : 'Error inesperado.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== serverDraft, [draft, serverDraft]);
  const unpublished = useMemo(() => !!cfg && !!draft && JSON.stringify(draft) !== JSON.stringify(cfg.site.published), [cfg, draft]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const sectors: Sector[] = useMemo(() => (cfg?.prizes ?? []).filter((p) => p.is_active && !p.archived_at).sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ id: p.id as string, name: p.name, label: p.sector_label, color: p.color, image_url: p.image_url, kind: p.kind })), [cfg]);

  if (loadError) return <Alert kind="error">{loadError}</Alert>;
  if (!cfg || !draft) return <PageLoader />;

  const upd = (fn: (d: SiteConfig) => void) => setDraft((d) => { if (!d) return d; const n = clone(d); fn(n); return n; });
  const setHours = (fn: (h: HoursRow[]) => HoursRow[]) => upd((d) => { d.contact.hours = fn(d.contact.hours); });

  const saveDraft = async (quiet = false) => {
    setBusy('save');
    try {
      const r = await adminSaveDraft(draft);
      if (!r.ok) { toast('No se pudo guardar el borrador', 'error'); return false; }
      setServerDraft(JSON.stringify(draft)); setErrors((r as { errors: string[] }).errors ?? []);
      if (!quiet) toast('Borrador guardado', 'ok');
      return true;
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); return false; }
    finally { setBusy(null); }
  };

  const publish = async () => {
    if (!(await saveDraft(true))) return;
    setBusy('publish');
    try { await adminPublishConfig(); toast('¡Cambios publicados!', 'ok'); await load(); void refreshPublic(); setErrors([]); }
    catch (e) { if (e instanceof ApiError) { setErrors(e.validation.length ? e.validation : [e.message]); toast('No se publicó: corrige los avisos', 'error'); } }
    finally { setBusy(null); }
  };

  const discard = async () => {
    setBusy('discard');
    try { await adminDiscardDraft(); await load(); toast('Se restauró lo publicado', 'ok'); setErrors([]); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-[80rem] pb-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Apariencia y textos</h1>
          <p className="text-sm text-dim">Guarda borradores con calma; los clientes solo ven lo <strong>publicado</strong>.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" disabled={busy !== null || (!unpublished && !dirty)} onClick={() => void discard()}>Descartar cambios</button>
          <button className="btn btn-ghost" disabled={busy !== null || !dirty} onClick={() => void saveDraft()}>{busy === 'save' ? 'Guardando…' : 'Guardar borrador'}</button>
          <button className="btn btn-primary" disabled={busy !== null || (!dirty && !unpublished)} onClick={() => void publish()}>{busy === 'publish' ? 'Publicando…' : 'Publicar'}</button>
        </div>
      </div>
      <p className="mb-3 text-sm" aria-live="polite">
        {dirty ? <span className="font-semibold text-warn">Cambios sin guardar.</span> : unpublished ? <span className="font-semibold text-warn">Borrador guardado, pendiente de publicar.</span> : <span className="inline-flex items-center gap-1 text-ok"><IconCheck width={16} height={16} /> Todo publicado</span>}
      </p>
      {errors.length > 0 && <Alert kind="error" className="mb-4"><strong>Corrige antes de publicar:</strong><ul className="mt-1 list-disc space-y-1 pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="space-y-4">
          <section className="card space-y-4 p-4" aria-labelledby="a-marca">
            <h2 id="a-marca" className="font-display text-lg font-semibold">Marca</h2>
            <Field label="Nombre de la tienda">{(id) => <input id={id} className="input" maxLength={60} value={draft.store.name} onChange={(e) => upd((d) => { d.store.name = e.target.value; })} />}</Field>
            <Field label="Eslogan" hint="Etiqueta corta sobre el título">{(id) => <input id={id} className="input" maxLength={120} value={draft.store.tagline} onChange={(e) => upd((d) => { d.store.tagline = e.target.value; })} />}</Field>
            <ImageField label="Logo" hint="Cuadrado, de preferencia con fondo transparente o liso. Se comprime a 256 px." value={draft.store.logo_url} folder="branding" maxSide={256} onChange={(v) => upd((d) => { d.store.logo_url = v; })} />
          </section>

          <SeasonPicker theme={draft.theme} onChange={(fn) => upd((d) => { fn(d.theme); })} />

          <section className="card space-y-4 p-4" aria-labelledby="a-color">
            <h2 id="a-color" className="font-display text-lg font-semibold">Colores, fondo y efectos</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Color principal (naranja de marca)" value={draft.theme.primary} onChange={(v) => upd((d) => { d.theme.primary = v; })} />
              <ColorField label="Color secundario (encabezado)" value={draft.theme.secondary} onChange={(v) => upd((d) => { d.theme.secondary = v; })} />
              <ColorField label="Acento (confeti y detalles)" value={draft.theme.accent} onChange={(v) => upd((d) => { d.theme.accent = v; })} />
              <ColorField label="Fondo de la página" value={draft.theme.background} onChange={(v) => upd((d) => { d.theme.background = v; })} />
            </div>
            <p className="text-xs text-dim">{seasonById(draft.theme.preset) ? 'Estos son los colores de marca: se usan cuando no hay temporada activa. ' : ''}El color principal es el naranja de marca (botón, tejado y sectores destacados); el secundario es el fondo del encabezado; el fondo es el de la página (claro). El texto de botones y sectores se elige solo para que tenga buen contraste.</p>
            <ImageField label="Imagen de fondo (opcional)" hint="Se mezcla con un velo del color de fondo para no restar legibilidad. Se comprime a 1280 px." value={draft.theme.background_image_url} folder="branding" maxSide={1280} onChange={(v) => upd((d) => { d.theme.background_image_url = v; })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Range label="Intensidad de brillos" value={draft.theme.glow} onChange={(v) => upd((d) => { d.theme.glow = v; })} hint="Luces del fondo y focos de la ruleta" />
              <Range label="Intensidad de animaciones" value={draft.theme.motion} onChange={(v) => upd((d) => { d.theme.motion = v; })} hint="Duración del giro, parpadeo y pulso. Se desactivan si el dispositivo pide menos movimiento." />
            </div>
            <p className="text-xs text-dim">Los colores e imágenes de cada sector se configuran por resultado en «Resultados».</p>
          </section>

          <section className="card space-y-4 p-4" aria-labelledby="a-textos">
            <h2 id="a-textos" className="font-display text-lg font-semibold">Textos</h2>
            <Field label="Título de bienvenida">{(id) => <input id={id} className="input" maxLength={90} value={draft.copy.welcome_title} onChange={(e) => upd((d) => { d.copy.welcome_title = e.target.value; })} />}</Field>
            <Field label="Texto de bienvenida">{(id) => <textarea id={id} className="input" maxLength={400} value={draft.copy.welcome_text} onChange={(e) => upd((d) => { d.copy.welcome_text = e.target.value; })} />}</Field>
            <Field label="Texto del botón" hint="Por omisión: ¡Girar y ganar!">{(id) => <input id={id} className="input" maxLength={30} value={draft.copy.button_text} onChange={(e) => upd((d) => { d.copy.button_text = e.target.value; })} />}</Field>
            <Field label="Mensaje de celebración (al ganar un premio)">{(id) => <input id={id} className="input" maxLength={160} value={draft.copy.celebration_message} onChange={(e) => upd((d) => { d.copy.celebration_message = e.target.value; })} />}</Field>
            <Field label="Mensaje cuando no hay premio">{(id) => <input id={id} className="input" maxLength={160} value={draft.copy.no_prize_message} onChange={(e) => upd((d) => { d.copy.no_prize_message = e.target.value; })} />}</Field>
            <Field label="Mensaje al ganar un giro extra">{(id) => <input id={id} className="input" maxLength={160} value={draft.copy.extra_spin_message} onChange={(e) => upd((d) => { d.copy.extra_spin_message = e.target.value; })} />}</Field>
          </section>

          <section className="card space-y-4 p-4" aria-labelledby="a-sound">
            <h2 id="a-sound" className="font-display text-lg font-semibold">Sonidos</h2>
            <Switch checked={draft.sound.enabled_by_default} onChange={(v) => upd((d) => { d.sound.enabled_by_default = v; })} label="Sonidos activados por omisión" hint="Cada visitante puede silenciarlos con el botón de volumen. Los sonidos son sintetizados: no pesan nada." />
            <Range label="Volumen" value={draft.sound.volume} onChange={(v) => upd((d) => { d.sound.volume = v; })} />
          </section>

          <section className="card space-y-4 p-4" aria-labelledby="a-contacto">
            <h2 id="a-contacto" className="font-display text-lg font-semibold">Contacto, dirección y horarios</h2>
            <Field label="Dirección">{(id) => <input id={id} className="input" maxLength={200} value={draft.contact.address} onChange={(e) => upd((d) => { d.contact.address = e.target.value; })} />}</Field>
            <Field label="Enlace del mapa (https)" hint="Pega el enlace de Google Maps de tu tienda">{(id) => <input id={id} type="url" className="input" value={draft.contact.maps_url ?? ''} onChange={(e) => upd((d) => { d.contact.maps_url = e.target.value || null; })} placeholder="https://maps.app.goo.gl/…" />}</Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Teléfono">{(id) => <input id={id} className="input" maxLength={30} value={draft.contact.phone} onChange={(e) => upd((d) => { d.contact.phone = e.target.value; })} />}</Field>
              <Field label="WhatsApp" hint="Con lada, solo para enlace de chat">{(id) => <input id={id} className="input" maxLength={30} value={draft.contact.whatsapp} onChange={(e) => upd((d) => { d.contact.whatsapp = e.target.value; })} />}</Field>
              <Field label="Correo">{(id) => <input id={id} type="email" className="input" value={draft.contact.email} onChange={(e) => upd((d) => { d.contact.email = e.target.value; })} />}</Field>
            </div>
            <fieldset className="space-y-2"><legend className="mb-1 text-sm font-semibold">Horarios</legend>
              {draft.contact.hours.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <input aria-label={`Días del renglón ${i + 1}`} className="input" placeholder="Lunes a viernes" value={h.days} maxLength={40} onChange={(e) => setHours((l) => l.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))} />
                  <input aria-label={`Horario del renglón ${i + 1}`} className="input" placeholder="9:00 a 20:00" value={h.hours} maxLength={40} onChange={(e) => setHours((l) => l.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)))} />
                  <button type="button" className="btn btn-ghost" aria-label={`Quitar renglón ${i + 1}`} onClick={() => setHours((l) => l.filter((_, j) => j !== i))}><IconX width={18} height={18} /></button>
                </div>
              ))}
              {draft.contact.hours.length < 10 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHours((l) => [...l, { days: '', hours: '' }])}>+ Agregar renglón</button>}
            </fieldset>
          </section>

          <section className="card space-y-4 p-4" aria-labelledby="a-legal">
            <h2 id="a-legal" className="font-display text-lg font-semibold">Reglas, privacidad e instrucciones de canje</h2>
            <p className="text-xs text-dim">Formato: líneas que empiezan con «## » son títulos, con «- » son viñetas y con «1. » listas numeradas. Una línea en blanco separa párrafos. Revisa estos textos con tu asesor legal.</p>
            <Field label="Reglas de participación" hint="Debe aclarar que el límite es por cuenta y que Google no garantiza una cuenta por persona.">{(id) => <textarea id={id} className="input !min-h-56" value={draft.rules_text} maxLength={8000} onChange={(e) => upd((d) => { d.rules_text = e.target.value; })} />}</Field>
            <Field label="Aviso de privacidad">{(id) => <textarea id={id} className="input !min-h-44" value={draft.privacy_text} maxLength={8000} onChange={(e) => upd((d) => { d.privacy_text = e.target.value; })} />}</Field>
            <Field label="Instrucciones para canjear en la tienda">{(id) => <textarea id={id} className="input" value={draft.redeem_text} maxLength={2000} onChange={(e) => upd((d) => { d.redeem_text = e.target.value; })} />}</Field>
          </section>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start" aria-label="Vista previa">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Vista previa</h2>
            <div className="inline-flex overflow-hidden rounded-xl border border-line" role="group" aria-label="Dispositivo">
              {(['mobile', 'desktop'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={device === d} className={`min-h-10 px-3 text-sm font-semibold ${device === d ? 'bg-btn text-on-btn' : 'bg-surface'}`} onClick={() => setDevice(d)}>{d === 'mobile' ? 'Móvil' : 'Escritorio'}</button>
              ))}
            </div>
          </div>
          <Preview cfg={draft} sectors={sectors} device={device} />
          <p className="mt-2 text-xs text-dim">Muestra el borrador con tus resultados activos. Los cambios llegan a los clientes solo al publicar.</p>
        </aside>
      </div>
    </div>
  );
}
