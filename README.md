# Sistema de Evaluación Universitaria (MERN)

Plataforma para diseñar, aplicar y calificar evaluaciones universitarias con foco en operación real: generación de exámenes en PDF, vinculación segura por QR, calificación semi-automatizada (OMR) y un stack local reproducible para desarrollo y pruebas.

Este repositorio está pensado para crecer desde un uso “local/operativo” (docente + DB en Docker) hacia un despliegue más completo (servicios cloud para portal alumno, sincronización, analíticas y control por roles).

## ¿Para qué sirve?
- Reducir el tiempo de preparación y calificación de evaluaciones (PDF + plantillas + OMR).
- Mantener trazabilidad del flujo del examen: generación → vinculación → captura → calificación → exportación.
- Separar responsabilidades: API docente (escritura/gestión) y portal alumno (lectura/consulta).
- Proveer herramientas de operación local en Windows (dashboard, logs, accesos directos) para equipos no técnicos.

## Qué lo hace “productivo”
- Stack local con Docker listo para levantar/bajar sin fricción.
- Backend modular con validaciones, rate limit, seguridad base (Helmet) y suite de pruebas.
- Frontend moderno (React/Vite) orientado a UX y flujos de docente/alumno.
- Paneles de operación: dashboard local para salud/logs y panel web de Mongo para inspección.

## Arquitectura
- `apps/backend/`: API docente modular en TypeScript (Express + Mongoose).
- `apps/frontend/`: UI React (docente/alumno) construida con Vite.
- `apps/portal_alumno_cloud/`: API del portal alumno (enfoque de solo lectura).
- `docs/`: arquitectura, seguridad, flujo del examen, formato PDF/OMR y despliegue.
- `scripts/`: herramientas de operación local (dashboard, launchers, utilidades).
- `docker-compose.yml`: stack local (MongoDB + API + panel de DB opcional).

## Flujo (alto nivel)
1) Configuras plantillas/bancos y generas exámenes (PDF).
2) Vinculas exámenes a alumnos mediante QR.
3) Capturas respuestas y procesas OMR (cuando aplica).
4) Calificas y exportas resultados (CSV/reportes).

## Requisitos
- Node.js 24+ (LTS)
- npm 9+
- Docker (requerido para backend local)

## Inicio rápido (desarrollo local)
1) Crea `.env` (ver lista más abajo y/o `docs/AUTO_ENV.md`).
2) Instala dependencias:
   ```bash
   npm install
   ```
3) Levanta servicios locales (MongoDB + API) en Docker:
   ```bash
   npm run dev:backend
   ```
4) Levanta la web en modo desarrollo (Vite):
   ```bash
   npm run dev:frontend
   ```

Endpoints comunes:
- Web (prod local): http://localhost:4173
- API: http://localhost:4000/api/salud

Si prefieres levantar todo con Docker Compose directamente:
```bash
docker compose --profile dev up --build
```

## Variables de entorno
- `PUERTO_API` (o `PORT`): puerto de la API (default 4000).
- `PUERTO_PORTAL`: puerto del portal alumno (default 8080).
- `MONGODB_URI`: URI de MongoDB. Si no esta definido, la API no conecta.
- `MONGOEXPRESS_USER`: usuario Basic Auth para el panel web de Mongo (mongo-express). Default: `admin`.
- `MONGOEXPRESS_PASS`: password Basic Auth para el panel web de Mongo (mongo-express). Default: `admin`.
- `CORS_ORIGENES`: lista separada por comas para CORS.
- `LIMITE_JSON`: limite del body JSON en la API docente.
- `VITE_API_BASE_URL`: base URL de la API para el frontend.
- `VITE_APP_DESTINO`: `docente` o `alumno` para seleccionar app.
- `VITE_PORTAL_BASE_URL`: base URL del portal alumno (Cloud Run).
- `VITE_GOOGLE_CLIENT_ID`: client id para habilitar el boton "Continuar con Google" en la app docente.
- `JWT_SECRETO`: secreto para JWT de docentes.
- `JWT_EXPIRA_HORAS`: expiracion de tokens docentes.
- `REFRESH_TOKEN_DIAS`: dias de vigencia del refresh token (cookie httpOnly, rotatorio) para no re-loguear tan seguido.
- `GOOGLE_OAUTH_CLIENT_ID`: client id de Google para validar ID tokens (login opcional en backend).
- `CODIGO_ACCESO_HORAS`: vigencia del codigo de acceso alumno (default 12).
- `PORTAL_ALUMNO_URL`: URL del portal cloud para sincronizacion.
- `PORTAL_ALUMNO_API_KEY`: API key para publicar resultados (backend local).
- `PORTAL_API_KEY`: API key de validacion en el portal cloud.
- `WEB_URL`: usado por `scripts/dashboard.mjs` para verificar la web.

Branding del PDF (opcional):
- `EXAMEN_INSTITUCION`: texto en encabezado.
- `EXAMEN_LEMA`: texto opcional bajo el título.
- `EXAMEN_LOGO_IZQ_PATH`: ruta a logo izquierdo (ej. `logos/cuh.png`) o `data:image/png;base64,...`.
- `EXAMEN_LOGO_DER_PATH`: ruta a logo derecho (ej. `logos/isc.png`) o `data:image/png;base64,...`.

Seed de cuenta admin/docente (solo para entornos locales o controlados):
- `SEED_ADMIN_EMAIL`: correo del docente a crear/asegurar.
- `SEED_ADMIN_PASSWORD`: password inicial (se guarda hasheado).
- `SEED_ADMIN_NOMBRE_COMPLETO`: nombre a mostrar (opcional).
- `SEED_ADMIN_FORCE`: si es `true`, permite ejecutar el seed aun si `NODE_ENV=production`.

Panel web de Mongo (mongo-express):
- Si levantas el stack con Docker, se expone en http://127.0.0.1:8081/ (protegido por Basic Auth).
- El dashboard local incluye una pestaña "Base de datos" para abrirlo o embeberlo en un iframe.

Nota: para una lista más completa (y actualizada automáticamente), revisa `docs/AUTO_ENV.md`.

## Scripts principales (raiz)
- Desarrollo full-stack: `npm run dev` (API en Docker + web local)
- Solo API (Docker): `npm run dev:backend`
- Solo web: `npm run dev:frontend`
- Solo portal alumno: `npm run dev:portal`
- Reset local (DB + PDFs + logs + build): `npm run reset:local`
- Pruebas backend: `npm run test`
- Pruebas portal alumno: `npm run test:portal`
- Pruebas frontend: `npm run test:frontend`
- Pruebas CI (con reintentos + lint): `npm run test:ci`
- Guardarrail de rutas (anti-regresion validacion/auth): `npm run routes:check`
- Docs auto (generar): `npm run docs:generate`
- Docs auto (validar en CI): `npm run docs:check`
- Diagramas (actualizar fuentes Mermaid): `npm run diagramas:generate`
- Diagramas (validar en CI): `npm run diagramas:check`
- Diagramas (render SVG): `npm run diagramas:render`
- Diagramas (validar SVG en CI): `npm run diagramas:render:check`
- Diagramas (validar consistencia de rutas): `npm run diagramas:consistencia:check`
- Sync docs+diagramas (recomendado antes de push): `npm run docs:sync`
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
- Asegúrate de tener Docker Desktop iniciado antes de ejecutar.

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

Opcional (flags para diagramas):
- `DIAGRAMAS_RENDER_CHECK=0`: desactiva temporalmente `npm run diagramas:render:check` (si el entorno no puede ejecutar Chromium/Puppeteer).

Estos flags son utiles si necesitas una excepcion temporal (idealmente, mantenerlos encendidos en CI).

## Login opcional con Google (docente)

Si configuras `GOOGLE_OAUTH_CLIENT_ID` (backend) y `VITE_GOOGLE_CLIENT_ID` (frontend), la app docente muestra un boton
de acceso con Google. El backend emite un JWT de acceso y un refresh token rotatorio en cookie httpOnly para mantener
sesion sin pedir login tan seguido (sin exponer el refresh token a JavaScript).

Tambien hay registro con Google: el correo se toma desde Google (verificado). La contrasena es opcional en ese flujo;
si no la defines al registrarte, puedes definirla despues desde la seccion "Cuenta" dentro del portal docente.

## API base
- GET `/api/salud` devuelve `{ estado, tiempoActivo, db }`.
- GET `/api/analiticas/calificaciones-csv?periodoId=...` exporta CSV.

## Proyección (roadmap sugerido)
Este repositorio ya cubre el núcleo operativo, pero está diseñado para extenderse sin reescritura completa. Algunas líneas naturales de evolución:
- Roles y permisos (RBAC) más completos: admin/coordinador/docente/lector.
- Auditoría (eventos relevantes) y trazabilidad por período/examen.
- Gestión avanzada de bancos de reactivos, variantes y versionado de plantillas.
- Analíticas y tableros: desempeño por grupo, reactivo, cohorte; exportables.
- Integraciones: SSO institucional, LMS (Moodle/Canvas) y sincronización de listas.
- Mejoras OMR: calibración por plantilla, tolerancias, detección de anomalías.

La idea es que el “modo local” siga funcionando como base sólida incluso si se incorpora un modo cloud/híbrido.

## Documentacion
- Arquitectura: `docs/ARQUITECTURA.md`
- Flujo del examen: `docs/FLUJO_EXAMEN.md`
- Guia para llenar formularios (UI): `docs/GUIA_FORMULARIOS.md`
- Despliegue local y cloud: `docs/DESPLIEGUE.md`
- Seguridad: `docs/SEGURIDAD.md`
- Formato PDF y OMR: `docs/FORMATO_PDF.md`
- Pruebas automatizadas: `docs/PRUEBAS.md`
- Mapa de archivos: `docs/FILES.md`
- Indice auto: `docs/AUTO_DOCS_INDEX.md`
- Variables de entorno auto: `docs/AUTO_ENV.md`
- Catalogo de diagramas: `docs/DIAGRAMAS.md`
- Versionado: `docs/VERSIONADO.md`







