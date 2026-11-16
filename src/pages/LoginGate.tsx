import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { IconGoogle } from '../components/icons';
import { PageTitle } from '../components/Layout';

export function LoginGate({ title, text }: { title: string; text: string }) {
  const { signInWithGoogle } = useApp();
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <div className="card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-10 text-center">
        <p className="text-dim">{text}</p>
        <button type="button" onClick={() => void signInWithGoogle()}
          className="btn !min-h-14 !rounded-full !bg-white !px-6 !text-base !text-[#1f1f1f] shadow-lg hover:!brightness-95">
          <IconGoogle /> Continuar con Google
        </button>
        <p className="text-xs text-dim">Consulta el <Link to="/privacidad" className="underline underline-offset-4">aviso de privacidad</Link>.</p>
      </div>
    </>
  );
}
