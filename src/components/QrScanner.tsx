import { useEffect, useRef, useState } from 'react';
import { IconX } from './icons';

/** Extrae el código del contenido de un QR (URL con ?codigo=… o texto plano). */
export function codeFromQr(text: string): string | null {
  try {
    const u = new URL(text);
    const c = u.searchParams.get('codigo');
    if (c) return c.toUpperCase().replace(/[^A-Z0-9]/g, '');
  } catch { /* no es URL */ }
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-HJ-NP-Z2-9]{12}$/.test(raw) ? raw : null;
}

interface BarcodeDetectorLike { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }

export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState('Apunta la cámara al QR del cliente.');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let raf = 0;
    const canvas = document.createElement('canvas');

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setError('La cámara solo funciona con conexión segura (https). Escribe el código a mano.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      } catch {
        setError('No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el código a mano.');
        return;
      }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});

      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
      const native = BD ? new BD({ formats: ['qr_code'] }) : null;
      const jsQR = native ? null : (await import('jsqr')).default;

      const tick = async () => {
        if (stopped) return;
        const v = video.current;
        if (v && v.readyState >= 2 && v.videoWidth) {
          try {
            let text: string | null = null;
            if (native) {
              text = (await native.detect(v))[0]?.rawValue ?? null;
            } else if (jsQR) {
              const w = Math.min(640, v.videoWidth), h = Math.round((w / v.videoWidth) * v.videoHeight);
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
              ctx.drawImage(v, 0, 0, w, h);
              text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
            }
            if (text) {
              const code = codeFromQr(text);
              if (code) { stopped = true; onCode(code); return; }
              setHint('Ese QR no es de un premio de esta tienda.');
            }
          } catch { /* fotograma ilegible */ }
        }
        raf = window.setTimeout(tick, 140);
      };
      void tick();
    })();

    return () => { stopped = true; clearTimeout(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video ref={video} muted playsInline className="h-full w-full object-cover" />
        <div className="scan-frame pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/90" aria-hidden="true" />
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-bad">{error}</p> : <p className="text-center text-sm text-dim" aria-live="polite">{hint}</p>}
      <button className="btn btn-ghost w-full" onClick={onClose}><IconX width={16} height={16} /> Cerrar cámara</button>
    </div>
  );
}
