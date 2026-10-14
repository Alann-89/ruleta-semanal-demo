# Ruleta semanal de premios — demo

Aplicación web de fidelización para una tienda física: una **ruleta semanal** con un giro por cuenta y semana, premios con código y QR, y un panel para administrar y canjear. Este repositorio es la **versión pública de portafolio** y funciona con **datos ficticios**.

## Qué demuestra
- **El servidor decide el resultado.** El giro es una transacción de PostgreSQL con aleatoriedad segura; el navegador solo anima hasta el sector que devolvió la base de datos.
- **Un giro base por cuenta y semana** (lunes a domingo, zona horaria configurable), garantizado con un índice único e idempotencia: doble clic, reintentos y solicitudes simultáneas no consumen dos oportunidades.
- **Premios** con existencias, límites y presupuesto; **cupones** con código único y QR, y **canje atómico**.
- **Panel** para administración y personal: escáner de QR, estadísticas, apariencia con borrador y publicación, y auditoría.
- **Seguridad en capas:** RLS, permisos SQL mínimos y validación de rol en cada función.

## Cómo funciona la demo
No hay servidor. La base de datos es **PostgreSQL real corriendo en tu navegador** (PGlite, WebAssembly) con las mismas migraciones de la versión de producción y datos de ejemplo. Puedes entrar como administradora, personal de mostrador o clientes ficticios, girar la ruleta, canjear premios y avanzar el reloj a la semana siguiente. Los datos se guardan solo en tu navegador (IndexedDB).

## Stack
React 19 · TypeScript · Vite · Tailwind CSS v4 · PGlite en la demo · Supabase (PostgreSQL, Auth con Google, Storage) en producción · Cloudflare Pages.

## Ejecutar
```bash
npm install
npm run dev:demo      # servidor de desarrollo de la demo
npm run build:demo    # compilación en dist-demo
```

## Estructura
```
src/                  Frontend (React + TypeScript)
src/demo/             Modo demo: PostgreSQL en el navegador y selector de usuarios ficticios
supabase/migrations/  Esquema, funciones de negocio, RLS y almacenamiento
supabase/seed/        Datos ficticios de la demo
```

> Los premios, usuarios y datos de esta demo son ficticios. La versión real de la tienda es privada.
