# Plataforma MERN para examenes

Monorepo MERN con backend docente local (Express + MongoDB) y frontend React.
Incluye generacion de PDFs, vinculacion por QR, escaneo OMR (pipeline base) y
calificacion exacta sin redondeos.

## Arquitectura
- `backend/`: API docente modular en TypeScript con MongoDB.
- `frontend/`: UI React con apps docente y alumno.
- `portal_alumno_cloud/`: API del portal alumno (solo lectura).
- `docs/`: decisiones de arquitectura, flujo de examen, seguridad y PDF.
- `scripts/`: utilidades de consola para revisar estado del stack.
- `docker-compose.yml`: stack local con Mongo, API y Web.

## Requisitos
- Node.js 24+ (LTS)
- npm 9+
- Docker (opcional para MongoDB local)

## Configuracion
1) Crea `.env` con los valores necesarios.
2) Instala dependencias en el monorepo:
   ```bash
   npm install
   ```
3) Contenedores locales (dev):
   ```bash
   docker compose --profile dev up --build
   ```
   - Web: http://localhost:4173
   - API: http://localhost:4000/api/salud

## Variables de entorno
- `PUERTO_API` (o `PORT`): puerto de la API (default 4000).
- `PUERTO_PORTAL`: puerto del portal alumno (default 8080).
- `MONGODB_URI`: URI de MongoDB. Si no esta definido, la API no conecta.
- `CORS_ORIGENES`: lista separada por comas para CORS.
- `LIMITE_JSON`: limite del body JSON en la API docente.
- `VITE_API_BASE_URL`: base URL de la API para el frontend.
- `VITE_APP_DESTINO`: `docente` o `alumno` para seleccionar app.
- `WEB_URL`: usado por `scripts/dashboard.mjs` para verificar la web.

## Scripts principales (raiz)
- Desarrollo full-stack: `npm run dev`
- Solo API: `npm run dev:backend`
- Solo web: `npm run dev:frontend`
- Solo portal alumno: `npm run dev:portal`
- Lint: `npm run lint`
- Build: `npm run build`
- Produccion API: `npm start`
- Produccion portal alumno: `npm run start:portal`
- Estado de servicios: `npm run status`

## API base
- GET `/api/salud` devuelve `{ estado, tiempoActivo, db }`.

## Documentacion
- Arquitectura: `docs/ARQUITECTURA.md`
- Flujo del examen: `docs/FLUJO_EXAMEN.md`
- Despliegue local y cloud: `docs/DESPLIEGUE.md`
- Seguridad: `docs/SEGURIDAD.md`
- Formato PDF y OMR: `docs/FORMATO_PDF.md`
- Mapa de archivos: `docs/FILES.md`
