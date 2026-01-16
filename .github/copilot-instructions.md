# Instrucciones para agentes (Copilot)

## Panorama
- [apps/backend](apps/backend): API docente modular (Express + MongoDB + TypeScript) pensada para correr local en Docker; capas en [src/modulos](apps/backend/src/modulos), [src/infraestructura](apps/backend/src/infraestructura) y [src/compartido](apps/backend/src/compartido).
- [apps/frontend](apps/frontend): React + Vite con dos apps internas (docente/alumno); se elige en [App.tsx](apps/frontend/src/App.tsx) via `VITE_APP_DESTINO`.
- [apps/portal_alumno_cloud](apps/portal_alumno_cloud): API de solo lectura/sincronizacion para alumnos, desplegable aparte (Cloud Run).
- Documentacion clave: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md), [docs/ARQUITECTURA_C4.md](docs/ARQUITECTURA_C4.md), [docs/FLUJO_EXAMEN.md](docs/FLUJO_EXAMEN.md), [docs/PRUEBAS.md](docs/PRUEBAS.md), [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md), [docs/AUTO_ENV.md](docs/AUTO_ENV.md).

## Workflows frecuentes
- Requiere Node 24+ y npm workspaces desde raiz. Desarrollo completo: `npm run dev` (Mongo+API en Docker + Vite). Alternativas: `npm run dev:backend`, `npm run dev:frontend`, `npm run dev:portal`.
- Puertos esperados: API 4000 (`/api/*`, salud en `/api/salud`), frontend dev 5173 (prod local 4173), portal 8080 (`/api/portal/*`, salud en `/api/portal/salud`).
- Compose directo: `docker compose --profile dev up --build`. Estado rapido: `npm run status` (usa [scripts/dashboard.mjs](scripts/dashboard.mjs)); lanzadores Windows en [scripts/launch-dev.cmd](scripts/launch-dev.cmd) y [scripts/launch-prod.cmd](scripts/launch-prod.cmd).
- Otros scripts utiles: `npm run reset:local`, `npm run routes:check`, `npm run docs:generate`, `npm run diagramas:generate`, `npm run docs:sync`.

## Convecciones y patrones
- Nombres en espanol mexicano y camelCase. Router central en [apps/backend/src/rutas.ts](apps/backend/src/rutas.ts): publica `/api/salud` y `/api/autenticacion/*`; el resto pasa por `requerirDocente` (JWT Bearer).
- Validaciones con Zod via `validarCuerpo` en [apps/backend/src/compartido/validaciones/validar.ts](apps/backend/src/compartido/validaciones/validar.ts). Errores estandar mediante `ErrorAplicacion` y middleware de respuesta en [apps/backend/src/compartido/errores/manejadorErrores.ts](apps/backend/src/compartido/errores/manejadorErrores.ts).
- Auth docente en [apps/backend/src/modulos/modulo_autenticacion/middlewareAutenticacion.ts](apps/backend/src/modulos/modulo_autenticacion/middlewareAutenticacion.ts) y [servicioTokens.ts](apps/backend/src/modulos/modulo_autenticacion/servicioTokens.ts). Portal valida sesiones alumno con hash en [apps/portal_alumno_cloud/src/servicios/middlewareSesion.ts](apps/portal_alumno_cloud/src/servicios/middlewareSesion.ts); endpoints `/api/portal/sincronizar` y `/api/portal/limpiar` exigen header `x-api-key` (`PORTAL_API_KEY`).
- Hardening Express ya aplicado (helmet, rate limit, mongo sanitize) en [apps/backend/src/app.ts](apps/backend/src/app.ts) y [apps/portal_alumno_cloud/src/app.ts](apps/portal_alumno_cloud/src/app.ts).

## Datos e integraciones
- Conexion Mongo se omite si falta `MONGODB_URI` (ver [apps/backend/src/infraestructura/baseDatos/mongoose.ts](apps/backend/src/infraestructura/baseDatos/mongoose.ts)); no asumir DB en dev. Artefactos/PDF de examenes viven en [apps/backend/data/examenes](apps/backend/data/examenes) (no versionar).
- Sincronizacion local→cloud: backend publica a `PORTAL_ALUMNO_URL` con `PORTAL_ALUMNO_API_KEY`. Branding PDF opcional via variables `EXAMEN_*` (ver [docs/AUTO_ENV.md](docs/AUTO_ENV.md)).

## Pruebas
- Vitest en las tres apps ([apps/*/vitest.config.ts](apps/backend/vitest.config.ts)). Suites: backend en [apps/backend/tests](apps/backend/tests), portal en [apps/portal_alumno_cloud/tests](apps/portal_alumno_cloud/tests), frontend en [apps/frontend/tests](apps/frontend/tests). Mongo en memoria en [apps/**/tests/utils/mongo.ts](apps/backend/tests/utils/mongo.ts).
- Comandos: `npm run test` (backend), `npm run test:portal`, `npm run test:frontend`, `npm run test:ci` (incluye lint/reintentos). Guardia de rutas: `npm run routes:check`.

## Recetas
- Endpoint nuevo (API docente): crear router/controlador/validaciones en [apps/backend/src/modulos](apps/backend/src/modulos), usar `validarCuerpo` en POST/PUT y registrar en [apps/backend/src/rutas.ts](apps/backend/src/rutas.ts) antes/despues de `router.use(requerirDocente)` segun publico/protegido.
- Manejo de errores: lanzar `ErrorAplicacion('CODIGO','Mensaje',httpStatus,detalles?)` en lugar de responder manualmente para respetar contrato JSON.
- Evitar dependencias nuevas salvo necesidad; ya estan `zod`, `mongoose`, `pdf-lib`, `sharp`, `jsqr`, `jsonwebtoken`.
