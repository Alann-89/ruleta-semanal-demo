import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('Error de interfaz', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Algo salió mal</h1>
        <p className="text-dim">Tus giros y premios están a salvo en el servidor. Recarga la página para continuar.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Recargar</button>
      </div>
    );
  }
}
