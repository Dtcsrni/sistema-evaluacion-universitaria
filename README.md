# Sistema de Evaluacion Universitaria

Monorepo MERN del Sistema de Evaluacion Universitaria con backend docente local (Express + MongoDB) y frontend React.
Incluye generacion de PDFs, vinculacion por QR, escaneo OMR (pipeline base) para calificación automatizada.

## Arquitectura
- `apps/backend/`: API docente modular en TypeScript con MongoDB.
- `apps/frontend/`: UI React con apps docente y alumno.
- `apps/portal_alumno_cloud/`: API del portal alumno (solo lectura).
- `docs/`: decisiones de arquitectura, flujo de examen, seguridad y PDF.
- `scripts/`: utilidades de consola para revisar estado del stack.
- `docker-compose.yml`: stack local con Mongo, API y Web.

## Requisitos
- Node.js 24+ (LTS)
- npm 9+
- Docker (requerido para backend local)

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
- `VITE_PORTAL_BASE_URL`: base URL del portal alumno (Cloud Run).
- `JWT_SECRETO`: secreto para JWT de docentes.
- `JWT_EXPIRA_HORAS`: expiracion de tokens docentes.
- `CODIGO_ACCESO_HORAS`: vigencia del codigo de acceso alumno (default 12).
- `PORTAL_ALUMNO_URL`: URL del portal cloud para sincronizacion.
- `PORTAL_ALUMNO_API_KEY`: API key para publicar resultados (backend local).
- `PORTAL_API_KEY`: API key de validacion en el portal cloud.
- `WEB_URL`: usado por `scripts/dashboard.mjs` para verificar la web.

## Scripts principales (raiz)
- Desarrollo full-stack: `npm run dev` (API en Docker + web local)
- Solo API (Docker): `npm run dev:backend`
- Solo web: `npm run dev:frontend`
- Solo portal alumno: `npm run dev:portal`
- Pruebas backend: `npm run test`
- Pruebas portal alumno: `npm run test:portal`
- Pruebas frontend: `npm run test:frontend`
- Pruebas CI (con reintentos + lint): `npm run test:ci`
- Guardarrail de rutas (anti-regresion validacion/auth): `npm run routes:check`
- Docs auto (generar): `npm run docs:generate`
- Docs auto (validar en CI): `npm run docs:check`
- Diagramas (actualizar fuentes Mermaid): `npm run diagramas:generate`
- Diagramas (validar en CI): `npm run diagramas:check`
- Lint: `npm run lint`
- Build: `npm run build`
- Produccion API (Docker): `npm start`
- Produccion portal alumno: `npm run start:portal`
- Estado de servicios: `npm run status`

## Acceso directo (Windows)
- Doble clic en `scripts/launch-dev.cmd` para abrir el dashboard web y levantar dev (Docker + web).
- Doble clic en `scripts/launch-prod.cmd` para abrir el dashboard web y levantar prod (Docker API docente).
- En el dashboard web puedes iniciar/detener servicios, abrir URLs y ver logs.
- Genera accesos con icono: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-shortcuts.ps1` (usa el dashboard web).
- Los `.lnk` quedan en `accesos-directos/`; puedes moverlos al escritorio o anclar a Inicio.
- Asegurate de tener Docker Desktop iniciado antes de ejecutar.

## Pruebas automatizadas
- Backend (unitarias + smoke): `npm run test`
- Backend directo: `npm --prefix apps/backend run test`
- CI (robusto en Windows, con reintentos): `npm run test:ci`

Nota CI:
- `test:frontend:ci` reintenta y, si detecta fallo intermitente con `--pool=forks`,
  reintenta usando `--pool=threads` como fallback.

Opcional (flags para `routes:check`):
- `ROUTES_CHECK_STRICT_PATHS=0`: desactiva la regla que exige paths literales (string) en `router.post/put/patch`.
- `ROUTES_CHECK_STRICT_PORTAL_METHODS=0`: desactiva la regla "solo POST" para endpoints sensibles del portal (`/sincronizar`, `/limpiar`, `/eventos-uso`).

Estos flags son utiles si necesitas una excepcion temporal (idealmente, mantenerlos encendidos en CI).

## API base
- GET `/api/salud` devuelve `{ estado, tiempoActivo, db }`.
- GET `/api/analiticas/calificaciones-csv?periodoId=...` exporta CSV.

## Documentacion
- Arquitectura: `docs/ARQUITECTURA.md`
- Flujo del examen: `docs/FLUJO_EXAMEN.md`
- Despliegue local y cloud: `docs/DESPLIEGUE.md`
- Seguridad: `docs/SEGURIDAD.md`
- Formato PDF y OMR: `docs/FORMATO_PDF.md`
- Pruebas automatizadas: `docs/PRUEBAS.md`
- Mapa de archivos: `docs/FILES.md`
- Indice auto: `docs/AUTO_DOCS_INDEX.md`
- Variables de entorno auto: `docs/AUTO_ENV.md`
- Catalogo de diagramas: `docs/DIAGRAMAS.md`
- Versionado: `docs/VERSIONADO.md`







