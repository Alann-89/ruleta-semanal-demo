import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PageTitle } from '../components/Layout';
import { SimpleText } from '../components/ui';

export function RulesPage() {
  const { config } = useApp();
  return (
    <>
      <PageTitle sub={config.store.name}>Reglas de participación</PageTitle>
      <article className="card p-5 sm:p-7">
        <SimpleText text={config.rules_text || 'Las reglas se publicarán pronto.'} />
      </article>
    </>
  );
}

export function PrivacyPage() {
  const { config } = useApp();
  return (
    <>
      <PageTitle sub={config.store.name}>Aviso de privacidad</PageTitle>
      <article className="card p-5 sm:p-7">
        <SimpleText text={config.privacy_text || 'El aviso de privacidad se publicará pronto.'} />
      </article>
    </>
  );
}

export function NotFoundPage() {
  return (
    <div className="card mx-auto mt-10 max-w-md px-6 py-12 text-center">
      <p className="font-display text-5xl font-bold text-[color:var(--c-primary)]">404</p>
      <p className="mt-2 text-dim">No encontramos esta página.</p>
      <Link to="/" className="btn btn-primary mt-5">Volver a la ruleta</Link>
    </div>
  );
}

export function SetupMissingPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-5 py-10">
      <h1 className="font-display text-3xl font-semibold">Falta configurar Supabase</h1>
      <p className="text-dim">
        Esta aplicación necesita las variables <code className="rounded bg-surface-2 px-1.5 py-0.5">VITE_SUPABASE_URL</code> y{' '}
        <code className="rounded bg-surface-2 px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code>.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
        <li>Copia <code>.env.example</code> a <code>.env.local</code>.</li>
        <li>Pega la URL y la clave pública (anon/publishable) de tu proyecto.</li>
        <li>Reinicia <code>npm run dev</code> (o vuelve a desplegar en Cloudflare Pages con esas variables).</li>
      </ol>
      <p className="text-sm text-dim">Guía completa: <code>docs/SETUP.md</code>.</p>
    </div>
  );
}
