import { supabase } from './supabase';

export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 480 * 1024;     // el bucket rechaza > 512 KB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** Redimensiona y comprime a WebP en el navegador (límite de tamaño y tipo). */
export async function compressImage(file: File, maxSide = 640): Promise<Blob> {
  if (!ALLOWED.includes(file.type)) throw new Error('Formato no permitido. Usa JPG, PNG o WebP.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('La imagen pesa más de 8 MB.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no puede procesar imágenes.');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  for (const q of [0.86, 0.76, 0.66, 0.55, 0.42]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', q));
    if (blob && blob.size <= MAX_OUTPUT_BYTES) return blob;
  }
  throw new Error('No se pudo comprimir la imagen por debajo de 480 KB. Prueba con una más sencilla.');
}

export async function uploadImage(file: File, folder: 'prizes' | 'branding', maxSide = 640): Promise<string> {
  if (!supabase) throw new Error('Sin conexión con Supabase.');
  const blob = await compressImage(file, maxSide);
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const path = `${folder}/${id}.webp`;
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}
