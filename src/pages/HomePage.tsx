import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { WheelCard } from '../components/WheelCard';
import { SimpleText } from '../components/ui';
import { IconPin } from '../components/icons';
import { KIND_LABEL, safeUrl } from '../lib/format';

/** Los tres pasos, en una sola franja separada por líneas finas. */
function Steps() {
  const steps = [
    ['1', 'Inicia sesión', 'Continúa con tu cuenta de Google. Sin formularios ni contraseñas.'],
    ['2', 'Gira cada semana', 'Un giro base por semana; se renueva el lunes a las 00:00.'],
    ['3', 'Canjea en la tienda', 'Si ganas, tu código y QR quedan guardados en «Mis premios».'],
  ];
  return (
    <section aria-labelledby="como" className="mx-auto mt-12 max-w-4xl">
      <h2 id="como" className="font-display mb-4 text-2xl font-extrabold">Así de fácil</h2>
      <ol className="grid border-y border-[color:var(--line)] md:grid-cols-3">
        {steps.map(([n, t, d], i) => (
          <li key={n} className={`flex gap-4 py-5 md:px-6 md:py-6 ${i > 0 ? 'border-t border-[color:var(--line)] md:border-l md:border-t-0' : 'md:pl-0'}`}>
            <span className="font-display w-9 shrink-0 text-4xl font-extrabold leading-none text-[color:var(--c-primary)]" aria-hidden="true">{n}</span>
            <div>
              <h3 className="font-display text-lg font-bold leading-tight">{t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-dim">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Lista editorial de premios (no una cuadrícula de tarjetas iguales). */
function PrizeList() {
  const { pub } = useApp();
  const prizes = (pub?.outcomes ?? []).filter((o) => o.kind !== 'no_prize');
  if (prizes.length === 0) return null;
  return (
    <section aria-labelledby="premios-h" className="mx-auto mt-12 max-w-4xl">
      <h2 id="premios-h" className="font-display text-2xl font-extrabold">Premios en juego</h2>
      <p className="mb-4 mt-1 text-sm text-dim">Lo que hoy puedes ganar. Sujeto a existencias y condiciones.</p>
      <ul className="grid gap-x-10 md:grid-cols-2">
        {prizes.map((p) => {
          const img = safeUrl(p.image_url);
          return (
            <li key={p.id} className="flex items-center gap-4 border-b border-[color:var(--line)] py-3.5">
              {img
                ? <img src={img} alt="" loading="lazy" width={44} height={44} className="h-11 w-11 shrink-0 rounded-lg border border-[color:var(--line)] bg-white object-cover" />
                : <span className="h-11 w-11 shrink-0 rounded-lg border border-black/10" style={{ background: p.color }} aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="font-display block text-lg font-bold leading-tight">{p.name}</span>
                <span className="text-xs text-dim">{KIND_LABEL[p.kind]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function digits(s: string) { return s.replace(/\D/g, ''); }

function StoreInfo() {
  const { config } = useApp();
  const c = config.contact;
  const map = safeUrl(c.maps_url);
  const hasAny = c.address || c.hours.length || c.phone || c.whatsapp || c.email || map;
  return (
    <section id="tienda" aria-labelledby="tienda-h" className="mx-auto mt-12 max-w-4xl scroll-mt-24">
      <h2 id="tienda-h" className="font-display mb-4 text-2xl font-extrabold">Visítanos y canjea tu premio</h2>
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        {hasAny && (
          <div className="card space-y-4 p-5">
            <p className="font-display text-xl font-extrabold uppercase tracking-[0.04em]">{config.store.name}</p>
            {c.address && (
              <p className="flex gap-2 text-sm leading-relaxed"><IconPin width={18} height={18} className="mt-0.5 shrink-0 text-[color:var(--c-primary)]" />
                <span>{c.address}</span>
              </p>
            )}
            {map && (
              <a className="btn btn-ghost" href={map} target="_blank" rel="noopener noreferrer"><IconPin width={18} height={18} /> Cómo llegar</a>
            )}
            {c.hours.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                {c.hours.map((h, i) => (<div key={i} className="contents"><dt className="font-semibold">{h.days}</dt><dd className="text-dim">{h.hours}</dd></div>))}
              </dl>
            )}
            <ul className="space-y-1 text-sm">
              {c.phone && <li>Tel.: <a className="font-semibold underline underline-offset-4" href={`tel:${digits(c.phone)}`}>{c.phone}</a></li>}
              {c.whatsapp && <li>WhatsApp: <a className="font-semibold underline underline-offset-4" href={`https://wa.me/${digits(c.whatsapp)}`} target="_blank" rel="noopener noreferrer">{c.whatsapp}</a></li>}
              {c.email && <li>Correo: <a className="font-semibold underline underline-offset-4" href={`mailto:${c.email}`}>{c.email}</a></li>}
            </ul>
          </div>
        )}
        {config.redeem_text && (
          <div className="card p-5">
            <h3 className="font-display text-lg font-bold">Cómo canjear</h3>
            <SimpleText text={config.redeem_text} className="text-sm" />
          </div>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { config } = useApp();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [hash]);
  return (
    <WheelCard title={config.copy.welcome_title}>
      <p className="mx-auto max-w-md text-center text-base leading-relaxed text-dim">{config.copy.welcome_text}</p>
      <Steps />
      <PrizeList />
      <StoreInfo />
    </WheelCard>
  );
}
