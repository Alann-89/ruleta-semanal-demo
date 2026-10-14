// Cabeceras de la demostración pública: igual de estricta que producción, pero permite WebAssembly
// (PostgreSQL corre en el navegador) y no habla con ningún servidor externo.
import fs from 'node:fs';

const headers = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; worker-src 'self' blob:; media-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
fs.writeFileSync('dist-demo/_headers', headers);
console.log('dist-demo/_headers escrito');
