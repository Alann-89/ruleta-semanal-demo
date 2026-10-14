import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 600 },
  server: { host: true },
  // PGlite (PostgreSQL en WebAssembly, solo para la demo) carga sus propios archivos .wasm.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
});
