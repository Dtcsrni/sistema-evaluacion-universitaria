# Instrucciones para agentes (Copilot)

Estas instrucciones describen convenciones y flujos reales del repo. Prioriza seguir los patrones existentes antes de introducir nuevos.

## Big picture (arquitectura y limites)
- Monorepo con npm workspaces (Node >= 24) desde la raiz (ver [package.json](../package.json)). Apps principales:
	- [apps/backend](../apps/backend): API docente (lectura/escritura) en Express + Mongoose + TypeScript.
	- [apps/frontend](../apps/frontend): UI React + Vite; contiene dos “destinos” (docente/alumno) seleccionados por `VITE_APP_DESTINO`.
	- [apps/portal_alumno_cloud](../apps/portal_alumno_cloud): Portal alumno (read-model) para despliegue cloud; enfocado en consulta y sincronizacion.
- Motivacion de separacion: el backend docente opera localmente (Docker) y el portal alumno se despliega como servicio publico separado (ver [docs/ARQUITECTURA.md](../docs/ARQUITECTURA.md) y [docs/DESPLIEGUE.md](../docs/DESPLIEGUE.md)).

## Layout del backend (como navegarlo)
- Capas (ver [docs/ARQUITECTURA.md](../docs/ARQUITECTURA.md)):
	- [apps/backend/src/modulos](../apps/backend/src/modulos): casos de uso por dominio (alumnos, periodos, PDF, OMR, calificacion, analiticas, sincronizacion).
	- [apps/backend/src/infraestructura](../apps/backend/src/infraestructura): adaptadores (DB, logging, seguridad, archivos, correo).
	- [apps/backend/src/compartido](../apps/backend/src/compartido): errores, validaciones, utilidades y rutas compartidas.
- Entry points:
	- Servidor: [apps/backend/src/index.ts](../apps/backend/src/index.ts) (conecta DB, hace seed admin y levanta HTTP).
	- App Express: [apps/backend/src/app.ts](../apps/backend/src/app.ts) (helmet, cors, rate limit, sanitizacion Mongo, manejador de errores).
	- Registro central de rutas: [apps/backend/src/rutas.ts](../apps/backend/src/rutas.ts) (orden de middlewares = contrato de seguridad).

## Contratos y convenciones HTTP (importante)
- El router central en [apps/backend/src/rutas.ts](../apps/backend/src/rutas.ts) monta rutas publicas ANTES de autenticacion:
	- Publico: `/api/salud`, `/api/autenticacion/*`
	- Protegido: todo lo demas bajo `requerirDocente` (JWT Bearer)
- No cambies el orden de `router.use(...)` sin revisar impacto: es parte del “boundary” de seguridad.
- Validacion de payload: usa Zod a traves de `validarCuerpo` (ver [apps/backend/src/compartido/validaciones/validar.ts](../apps/backend/src/compartido/validaciones/validar.ts)).
- Errores: usa el envelope central (no respondas JSON “a mano” salvo que el modulo ya lo haga asi). Patrón esperado: lanzar `ErrorAplicacion(...)` y dejar que el middleware forme la respuesta (ver [apps/backend/src/compartido/errores/manejadorErrores.ts](../apps/backend/src/compartido/errores/manejadorErrores.ts)).

## Convenciones (codigo, validacion, errores)
- Idioma y naming: espanol (mex) + `camelCase` en variables/funciones. En HTTP, los paths suelen ir en `kebab-case` (ej. `/banco-preguntas` en [apps/backend/src/rutas.ts](../apps/backend/src/rutas.ts)).
- Router/handlers:
	- Las rutas suelen vivir en `rutas*.ts`, llamar a funciones en `controlador*.ts` y validar con schemas en `validaciones*.ts` (ver ejemplo completo en [apps/backend/src/modulos/modulo_generacion_pdf/rutasGeneracionPdf.ts](../apps/backend/src/modulos/modulo_generacion_pdf/rutasGeneracionPdf.ts)).
	- En rutas que reciben body, se usa `validarCuerpo(esquema, { strict: true })` (ej. [apps/backend/src/modulos/modulo_autenticacion/rutasAutenticacion.ts](../apps/backend/src/modulos/modulo_autenticacion/rutasAutenticacion.ts)).
- Envelope de error (contrato):
	- Forma: `{ error: { codigo, mensaje, detalles? } }` (definicion/guia en [apps/backend/src/compartido/errores/errorAplicacion.ts](../apps/backend/src/compartido/errores/errorAplicacion.ts)).
	- `VALIDACION` incluye `detalles` con `zod.flatten()` (ver [apps/backend/src/compartido/validaciones/validar.ts](../apps/backend/src/compartido/validaciones/validar.ts)).
	- El middleware tambien normaliza errores comunes (IDs invalidos → `DATOS_INVALIDOS`, payload grande → `PAYLOAD_DEMASIADO_GRANDE`) y controla leakage en prod (ver [apps/backend/src/compartido/errores/manejadorErrores.ts](../apps/backend/src/compartido/errores/manejadorErrores.ts)).
- Estilo de cambios: respeta el estilo del archivo (tabs/espacios y orden de imports) y evita refactors masivos; este repo usa checks de rutas y CI estricto.

## Mapa de features → modulos concretos
- Autenticacion docente (JWT/refresh/Google opcional):
	- Rutas: [apps/backend/src/modulos/modulo_autenticacion/rutasAutenticacion.ts](../apps/backend/src/modulos/modulo_autenticacion/rutasAutenticacion.ts)
	- Controlador: [apps/backend/src/modulos/modulo_autenticacion/controladorAutenticacion.ts](../apps/backend/src/modulos/modulo_autenticacion/controladorAutenticacion.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_autenticacion/validacionesAutenticacion.ts](../apps/backend/src/modulos/modulo_autenticacion/validacionesAutenticacion.ts)
	- Seed de admin al iniciar: [apps/backend/src/index.ts](../apps/backend/src/index.ts)
- Alumnos y periodos:
	- [apps/backend/src/modulos/modulo_alumnos/rutasAlumnos.ts](../apps/backend/src/modulos/modulo_alumnos/rutasAlumnos.ts)
	- Controlador: [apps/backend/src/modulos/modulo_alumnos/controladorAlumnos.ts](../apps/backend/src/modulos/modulo_alumnos/controladorAlumnos.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_alumnos/validacionesAlumnos.ts](../apps/backend/src/modulos/modulo_alumnos/validacionesAlumnos.ts)
	- [apps/backend/src/modulos/modulo_alumnos/rutasPeriodos.ts](../apps/backend/src/modulos/modulo_alumnos/rutasPeriodos.ts)
	- Controlador: [apps/backend/src/modulos/modulo_alumnos/controladorPeriodos.ts](../apps/backend/src/modulos/modulo_alumnos/controladorPeriodos.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_alumnos/validacionesPeriodos.ts](../apps/backend/src/modulos/modulo_alumnos/validacionesPeriodos.ts)
- Banco de preguntas / reactivos:
	- [apps/backend/src/modulos/modulo_banco_preguntas/rutasBancoPreguntas.ts](../apps/backend/src/modulos/modulo_banco_preguntas/rutasBancoPreguntas.ts)
	- Controlador: [apps/backend/src/modulos/modulo_banco_preguntas/controladorBancoPreguntas.ts](../apps/backend/src/modulos/modulo_banco_preguntas/controladorBancoPreguntas.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_banco_preguntas/validacionesBancoPreguntas.ts](../apps/backend/src/modulos/modulo_banco_preguntas/validacionesBancoPreguntas.ts)
- Generacion de examenes (plantillas + PDFs + lote + descargas):
	- [apps/backend/src/modulos/modulo_generacion_pdf/rutasGeneracionPdf.ts](../apps/backend/src/modulos/modulo_generacion_pdf/rutasGeneracionPdf.ts)
	- Controlador (plantillas/generacion): [apps/backend/src/modulos/modulo_generacion_pdf/controladorGeneracionPdf.ts](../apps/backend/src/modulos/modulo_generacion_pdf/controladorGeneracionPdf.ts)
	- Controlador (listado/descargas): [apps/backend/src/modulos/modulo_generacion_pdf/controladorListadoGenerados.ts](../apps/backend/src/modulos/modulo_generacion_pdf/controladorListadoGenerados.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_generacion_pdf/validacionesExamenes.ts](../apps/backend/src/modulos/modulo_generacion_pdf/validacionesExamenes.ts)
	- Los PDFs se escriben bajo [apps/backend/data/examenes](../apps/backend/data/examenes)
- Vinculacion / entregas (QR/folios):
	- [apps/backend/src/modulos/modulo_vinculacion_entrega/rutasVinculacionEntrega.ts](../apps/backend/src/modulos/modulo_vinculacion_entrega/rutasVinculacionEntrega.ts)
	- Controlador: [apps/backend/src/modulos/modulo_vinculacion_entrega/controladorVinculacionEntrega.ts](../apps/backend/src/modulos/modulo_vinculacion_entrega/controladorVinculacionEntrega.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_vinculacion_entrega/validacionesVinculacion.ts](../apps/backend/src/modulos/modulo_vinculacion_entrega/validacionesVinculacion.ts)
- OMR (escaneo/procesamiento):
	- [apps/backend/src/modulos/modulo_escaneo_omr/rutasEscaneoOmr.ts](../apps/backend/src/modulos/modulo_escaneo_omr/rutasEscaneoOmr.ts)
	- Controlador: [apps/backend/src/modulos/modulo_escaneo_omr/controladorEscaneoOmr.ts](../apps/backend/src/modulos/modulo_escaneo_omr/controladorEscaneoOmr.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_escaneo_omr/validacionesOmr.ts](../apps/backend/src/modulos/modulo_escaneo_omr/validacionesOmr.ts)
- Calificacion:
	- [apps/backend/src/modulos/modulo_calificacion/rutasCalificaciones.ts](../apps/backend/src/modulos/modulo_calificacion/rutasCalificaciones.ts)
	- Controlador: [apps/backend/src/modulos/modulo_calificacion/controladorCalificacion.ts](../apps/backend/src/modulos/modulo_calificacion/controladorCalificacion.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_calificacion/validacionesCalificacion.ts](../apps/backend/src/modulos/modulo_calificacion/validacionesCalificacion.ts)
- Analiticas / exportaciones (CSV):
	- [apps/backend/src/modulos/modulo_analiticas/rutasAnaliticas.ts](../apps/backend/src/modulos/modulo_analiticas/rutasAnaliticas.ts)
	- Controlador: [apps/backend/src/modulos/modulo_analiticas/controladorAnaliticas.ts](../apps/backend/src/modulos/modulo_analiticas/controladorAnaliticas.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_analiticas/validacionesAnaliticas.ts](../apps/backend/src/modulos/modulo_analiticas/validacionesAnaliticas.ts)
- Sincronizacion (publicar a cloud + codigo acceso + paquete export/import):
	- [apps/backend/src/modulos/modulo_sincronizacion_nube/rutasSincronizacionNube.ts](../apps/backend/src/modulos/modulo_sincronizacion_nube/rutasSincronizacionNube.ts)
	- Controlador: [apps/backend/src/modulos/modulo_sincronizacion_nube/controladorSincronizacion.ts](../apps/backend/src/modulos/modulo_sincronizacion_nube/controladorSincronizacion.ts)
	- Validaciones (Zod): [apps/backend/src/modulos/modulo_sincronizacion_nube/validacionesSincronizacion.ts](../apps/backend/src/modulos/modulo_sincronizacion_nube/validacionesSincronizacion.ts)
- Portal alumno (read-model + sync + sesiones):
	- Router principal: [apps/portal_alumno_cloud/src/rutas.ts](../apps/portal_alumno_cloud/src/rutas.ts)
	- App/middlewares base: [apps/portal_alumno_cloud/src/app.ts](../apps/portal_alumno_cloud/src/app.ts)
	- Sesiones alumno (token hash SHA-256): [apps/portal_alumno_cloud/src/servicios/servicioSesion.ts](../apps/portal_alumno_cloud/src/servicios/servicioSesion.ts)
	- Middleware de sesion (Bearer): [apps/portal_alumno_cloud/src/servicios/middlewareSesion.ts](../apps/portal_alumno_cloud/src/servicios/middlewareSesion.ts)
- Frontend (selector docente/alumno):
	- Seleccion por `VITE_APP_DESTINO`: [apps/frontend/src/App.tsx](../apps/frontend/src/App.tsx)
	- Apps internas: [apps/frontend/src/apps/app_docente](../apps/frontend/src/apps/app_docente) y [apps/frontend/src/apps/app_alumno](../apps/frontend/src/apps/app_alumno)

## Portal alumno (read-model) y sincronizacion
- El portal es una vista derivada (read-model) y su API vive bajo `/api/portal/*` (ver [apps/portal_alumno_cloud/src/app.ts](../apps/portal_alumno_cloud/src/app.ts) y [apps/portal_alumno_cloud/src/rutas.ts](../apps/portal_alumno_cloud/src/rutas.ts)).
- Superficies de acceso:
	- Internas (sync/limpieza): requieren `x-api-key` (`PORTAL_API_KEY`). Ej: `POST /api/portal/sincronizar`.
	- Alumno: requieren sesion (Bearer) emitida tras validar `codigo + matricula`.
- El endpoint de sync es idempotente y hace upsert por `folio` (ver comentario “Upsert por folio” en [apps/portal_alumno_cloud/src/rutas.ts](../apps/portal_alumno_cloud/src/rutas.ts)). Mantener esta propiedad al modificarlo.
- El portal aplica defensas “por defecto” (helmet, rate limit, sanitizacion Mongo) igual que el backend (ver [apps/portal_alumno_cloud/src/app.ts](../apps/portal_alumno_cloud/src/app.ts)).

## Datos, archivos y DB
- MongoDB: el backend puede omitir conexion si falta `MONGODB_URI` (ver [apps/backend/src/infraestructura/baseDatos/mongoose.ts](../apps/backend/src/infraestructura/baseDatos/mongoose.ts)); no asumas DB disponible si estas ejecutando unit tests o scripts aislados.
- PDFs/artefactos: se guardan en [apps/backend/data/examenes](../apps/backend/data/examenes) (operativo; no versionar). Varias pruebas generan PDFs en esa ruta (ver [docs/PRUEBAS.md](../docs/PRUEBAS.md)).
- Sincronizacion local->cloud: backend publica hacia `PORTAL_ALUMNO_URL` con `PORTAL_ALUMNO_API_KEY` (ver variables en [docs/AUTO_ENV.md](../docs/AUTO_ENV.md)).

## Workflows (comandos que realmente se usan)
- Instalar deps desde la raiz: `npm install`
- Desarrollo:
	- Full: `npm run dev` (docker compose dev backend + vite frontend)
	- Solo backend (Docker): `npm run dev:backend`
	- Solo frontend (Vite): `npm run dev:frontend`
	- Portal alumno local: `npm run dev:portal`
- Produccion local (validacion): `npm run verify:prod` (tests + build) y/o `npm run start:prod` (compose profile prod)
- Operacion Windows:
	- Dashboard: `npm run status` (ver [scripts/dashboard.mjs](../scripts/dashboard.mjs))
	- Launchers: [scripts/launch-dev.cmd](../scripts/launch-dev.cmd), [scripts/launch-prod.cmd](../scripts/launch-prod.cmd)
	- Reset operativo: `npm run reset:local` (limpia DB/artefactos/logs/build)

## Depuracion rapida (VS Code / Windows)
- Dashboard local:
	- `npm run status` ejecuta un dashboard de consola que hace health-check a API/Web (ver [scripts/dashboard.mjs](../scripts/dashboard.mjs)).
	- Si usas los accesos directos, los launchers llaman al “launcher-dashboard” en modo dev/prod (ver [scripts/launch-dev.cmd](../scripts/launch-dev.cmd) y [scripts/launch-prod.cmd](../scripts/launch-prod.cmd)).
- Backend dentro de Docker vs local:
	- En el flujo normal, el backend corre en Docker (`npm run dev:backend`), lo cual es ideal para reproducibilidad.
	- Para depurar con breakpoints TS sin pelearte con contenedores, suele ser mas simple correr el backend directo con `npm -C apps/backend run dev` (tsx watch) y levantar solo Mongo en Docker (ej. `docker compose --profile dev up --build mongo_local`).
- Script rapido para reproducir un flujo con DB en memoria (sin Docker):
	- [apps/backend/scripts/debugCrearPeriodo.ts](../apps/backend/scripts/debugCrearPeriodo.ts) crea un docente y un periodo usando `supertest` + `mongodb-memory-server`.
	- Ejecutalo con `npx tsx apps/backend/scripts/debugCrearPeriodo.ts` (o equivalente con `tsx` si ya lo tienes disponible).

## Guardrails del repo (no los rompas)
- `routes:check`: `npm run routes:check` valida convenciones de rutas/auth para evitar regresiones. Si tienes que hacer una excepcion temporal, existen flags:
	- `ROUTES_CHECK_STRICT_PATHS=0`
	- `ROUTES_CHECK_STRICT_PORTAL_METHODS=0`
- Docs/diagramas son “source-of-truth” y se validan en CI (ver scripts en [package.json](../package.json)):
	- `npm run docs:check`, `npm run diagramas:check`, `npm run diagramas:render:check`
	- En entornos sin Chromium/Puppeteer: `DIAGRAMAS_RENDER_CHECK=0` (temporal)

## Pruebas (como se estructuran aqui)
- Runner: Vitest en cada app.
	- Backend: [apps/backend/tests](../apps/backend/tests)
	- Portal: [apps/portal_alumno_cloud/tests](../apps/portal_alumno_cloud/tests)
	- Frontend: [apps/frontend/tests](../apps/frontend/tests)
- Mongo en memoria se usa para integracion (helpers en [apps/backend/tests/utils](../apps/backend/tests/utils)); evita depender de un Mongo real en pruebas.

## Recetas rapidas (patrones preferidos)
- Endpoint nuevo (API docente):
	1) Crear router/controlador/servicios dentro de un modulo en [apps/backend/src/modulos](../apps/backend/src/modulos)
	2) Validar con `validarCuerpo(schema)` en POST/PUT/PATCH
	3) Registrar en [apps/backend/src/rutas.ts](../apps/backend/src/rutas.ts) en la seccion correcta (publico vs protegido)
- Endpoint nuevo en portal: mantener el esquema “payload allowlist + normalizacion + limites” que se ve en [apps/portal_alumno_cloud/src/rutas.ts](../apps/portal_alumno_cloud/src/rutas.ts) (especialmente para sync/telemetria).
- Dependencias: evita introducir libs nuevas si ya existe equivalente (el repo ya usa `zod`, `mongoose`, `pdf-lib`, `sharp`, `jsqr`, `jsonwebtoken`, `decimal.js`).
