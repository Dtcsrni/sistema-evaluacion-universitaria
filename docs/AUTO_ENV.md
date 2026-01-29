# Variables de entorno (auto-generado)

Este archivo se genera con `npm run docs:generate`.
No editar a mano: los cambios se pisan al regenerar.

Nota: esto detecta uso por texto (regex). Si agregas una variable nueva en código,
este documento se actualiza automáticamente al regenerar.

## Backend
- `CODIGO_ACCESO_HORAS` (usado en: apps/backend/src/configuracion.ts)
- `CORS_ORIGENES` (usado en: apps/backend/src/configuracion.ts)
- `DOMINIOS_CORREO_PERMITIDOS` (usado en: apps/backend/src/configuracion.ts, apps/backend/tests/setup.ts)
- `EXAMEN_INSTITUCION` (usado en: apps/backend/src/modulos/modulo_generacion_pdf/servicioGeneracionPdf.ts)
- `EXAMEN_LEMA` (usado en: apps/backend/src/modulos/modulo_generacion_pdf/servicioGeneracionPdf.ts)
- `EXAMEN_LOGO_DER_PATH` (usado en: apps/backend/src/modulos/modulo_generacion_pdf/servicioGeneracionPdf.ts)
- `EXAMEN_LOGO_IZQ_PATH` (usado en: apps/backend/src/modulos/modulo_generacion_pdf/servicioGeneracionPdf.ts)
- `GOOGLE_OAUTH_CLIENT_ID` (usado en: apps/backend/src/configuracion.ts)
- `HOST_IP` (usado en: apps/backend/src/compartido/salud/rutasSalud.ts)
- `JWT_EXPIRA_HORAS` (usado en: apps/backend/src/configuracion.ts)
- `JWT_SECRETO` (usado en: apps/backend/src/configuracion.ts)
- `LIMITE_JSON` (usado en: apps/backend/src/configuracion.ts, apps/backend/tests/contrato/limitesPayload.test.ts)
- `MONGO_URI` (usado en: apps/backend/src/configuracion.ts)
- `MONGODB_URI` (usado en: apps/backend/scripts/omr-run.ts, apps/backend/src/configuracion.ts)
- `NODE_ENV` (usado en: apps/backend/scripts/debugCrearPeriodo.ts, apps/backend/src/compartido/errores/manejadorErrores.ts, apps/backend/src/configuracion.ts, apps/backend/src/modulos/modulo_autenticacion/rutasAutenticacion.ts, apps/backend/src/modulos/modulo_autenticacion/seedAdmin.ts, apps/backend/tests/errores.test.ts, apps/backend/tests/setup.ts)
- `OMR_IMAGEN_BASE64_MAX_CHARS` (usado en: apps/backend/src/configuracion.ts, apps/backend/tests/contrato/limitesPayload.test.ts)
- `PORT` (usado en: apps/backend/src/configuracion.ts)
- `PORTAL_ALUMNO_API_KEY` (usado en: apps/backend/src/configuracion.ts)
- `PORTAL_ALUMNO_URL` (usado en: apps/backend/src/configuracion.ts)
- `PUERTO_API` (usado en: apps/backend/src/configuracion.ts)
- `RATE_LIMIT_CREDENCIALES_LIMIT` (usado en: apps/backend/src/configuracion.ts)
- `RATE_LIMIT_LIMIT` (usado en: apps/backend/src/configuracion.ts, apps/backend/tests/rateLimit.test.ts, apps/backend/tests/setup.ts)
- `RATE_LIMIT_REFRESCO_LIMIT` (usado en: apps/backend/src/configuracion.ts)
- `RATE_LIMIT_WINDOW_MS` (usado en: apps/backend/src/configuracion.ts, apps/backend/tests/rateLimit.test.ts)
- `REFRESH_TOKEN_DIAS` (usado en: apps/backend/src/configuracion.ts)
- `SEED_ADMIN_EMAIL` (usado en: apps/backend/src/modulos/modulo_autenticacion/seedAdmin.ts)
- `SEED_ADMIN_FORCE` (usado en: apps/backend/src/modulos/modulo_autenticacion/seedAdmin.ts)
- `SEED_ADMIN_NOMBRE_COMPLETO` (usado en: apps/backend/src/modulos/modulo_autenticacion/seedAdmin.ts)
- `SEED_ADMIN_PASSWORD` (usado en: apps/backend/src/modulos/modulo_autenticacion/seedAdmin.ts)

## Portal alumno cloud
- `CODIGO_ACCESO_HORAS` (usado en: apps/portal_alumno_cloud/src/configuracion.ts)
- `CORS_ORIGENES` (usado en: apps/portal_alumno_cloud/src/configuracion.ts)
- `MONGODB_URI` (usado en: apps/portal_alumno_cloud/src/configuracion.ts)
- `NODE_ENV` (usado en: apps/portal_alumno_cloud/src/compartido/errores/manejadorErrores.ts, apps/portal_alumno_cloud/src/configuracion.ts, apps/portal_alumno_cloud/tests/errores.test.ts, apps/portal_alumno_cloud/tests/setup.ts)
- `PORT` (usado en: apps/portal_alumno_cloud/src/configuracion.ts)
- `PORTAL_API_KEY` (usado en: apps/portal_alumno_cloud/src/configuracion.ts, apps/portal_alumno_cloud/tests/contrato/validaciones.test.ts, apps/portal_alumno_cloud/tests/integracion/portal.test.ts, apps/portal_alumno_cloud/tests/setup.ts)
- `PUERTO_PORTAL` (usado en: apps/portal_alumno_cloud/src/configuracion.ts)
- `RATE_LIMIT_LIMIT` (usado en: apps/portal_alumno_cloud/src/configuracion.ts, apps/portal_alumno_cloud/tests/rateLimit.test.ts)
- `RATE_LIMIT_WINDOW_MS` (usado en: apps/portal_alumno_cloud/src/configuracion.ts, apps/portal_alumno_cloud/tests/rateLimit.test.ts)

## Frontend
- `DEV` (usado en: apps/frontend/src/apps/app_docente/AppDocente.tsx, apps/frontend/src/ui/errores/ErrorBoundary.tsx)
- `PROD` (usado en: apps/frontend/src/pwa.ts)
- `VITE_API_BASE_URL` (usado en: apps/frontend/src/servicios_api/clienteApi.ts)
- `VITE_APP_DESTINO` (usado en: apps/frontend/src/App.tsx, apps/frontend/src/pwa.ts)
- `VITE_DOMINIOS_CORREO_PERMITIDOS` (usado en: apps/frontend/src/apps/app_docente/AppDocente.tsx)
- `VITE_GOOGLE_CLIENT_ID` (usado en: apps/frontend/src/App.tsx, apps/frontend/src/apps/app_docente/AppDocente.tsx)
- `VITE_HTTPS` (usado en: apps/frontend/src/apps/app_docente/AppDocente.tsx)
- `VITE_PORTAL_BASE_URL` (usado en: apps/frontend/src/apps/app_alumno/AppAlumno.tsx, apps/frontend/src/servicios_api/clientePortal.ts)

## Scripts
- `API_HEALTHCHECK_INTERVAL_MS` (usado en: scripts/wait-api.mjs)
- `API_HEALTHCHECK_PATH` (usado en: scripts/wait-api.mjs)
- `API_HEALTHCHECK_STRICT` (usado en: scripts/wait-api.mjs)
- `API_HEALTHCHECK_TIMEOUT_MS` (usado en: scripts/wait-api.mjs)
- `APPDATA` (usado en: scripts/detect-host-ip.mjs, scripts/vscode-tune.mjs)
- `DASHBOARD_DOCKER_TIMEOUT_MS` (usado en: scripts/launcher-dashboard.mjs)
- `DASHBOARD_LOG_FLUSH_MS` (usado en: scripts/launcher-dashboard.mjs)
- `DASHBOARD_LOG_KEEP` (usado en: scripts/launcher-dashboard.mjs)
- `DASHBOARD_LOG_MAX_BYTES` (usado en: scripts/launcher-dashboard.mjs)
- `DASHBOARD_TRAY_AUTOSTART` (usado en: scripts/launcher-dashboard.mjs, scripts/start-tray.mjs)
- `DIAGRAMAS_RENDER_CHECK` (usado en: scripts/diagramas-render.mjs)
- `LOCALAPPDATA` (usado en: scripts/detect-host-ip.mjs, scripts/launcher-dashboard.mjs, scripts/vscode-prune-extensions.mjs)
- `P` (usado en: scripts/launcher-dashboard.mjs)
- `S` (usado en: scripts/detect-host-ip.mjs)
- `VITE_API_BASE_URL` (usado en: scripts/dashboard.mjs)
- `VITE_API_PROXY_TARGET` (usado en: scripts/wait-api.mjs)
- `VSCODE_CLI` (usado en: scripts/vscode-prune-extensions.mjs)
- `WEB_URL` (usado en: scripts/dashboard.mjs)
- `WINDIR` (usado en: scripts/launcher-dashboard.mjs, scripts/start-tray.mjs)

## Tests
- `ALLOW_NODE_WARNINGS` (usado en: test-utils/vitestStrict.ts)
- `ALLOW_TEST_CONSOLE` (usado en: test-utils/vitestStrict.ts)
