# Mapa de archivos

Este documento describe cada archivo principal del repositorio. Los archivos
Generados o lockfiles no deben editarse manualmente.

## Raiz
- `.gitignore`: artefactos y archivos ignorados.
- `docker-compose.yml`: stack local con perfiles dev/prod.
- `package.json`: scripts y workspaces.
- `package-lock.json`: lockfile de npm (generado).
- `README.md`: guia principal.
- `scripts/dashboard.mjs`: verificacion de API y web.

## docs/
- `docs/ARQUITECTURA.md`: decisiones y diagramas texto.
- `docs/FLUJO_EXAMEN.md`: flujo completo de examen.
- `docs/DESPLIEGUE.md`: Docker Compose y Cloud Run.
- `docs/SEGURIDAD.md`: checklist OWASP API 2023.
- `docs/FORMATO_PDF.md`: reglas de PDF carta y OMR.
- `docs/FILES.md`: este mapa de archivos.

## backend/
- `backend/.eslintrc.cjs`: reglas ESLint backend.
- `backend/Dockerfile`: imagen Docker API.
- `backend/package.json`: dependencias y scripts backend.
- `backend/tsconfig.json`: configuracion TypeScript backend.
- `backend/src/index.ts`: entrada del servidor.
- `backend/src/app.ts`: configuracion Express.
- `backend/src/configuracion.ts`: lectura de env y defaults.
- `backend/src/rutas.ts`: registro de rutas.
- `backend/src/infraestructura/baseDatos/mongoose.ts`: conexion Mongo.
- `backend/src/infraestructura/archivos/almacenLocal.ts`: guardado local de PDFs.
- `backend/src/infraestructura/correo/servicioCorreo.ts`: placeholder correo.
- `backend/src/compartido/errores/*`: errores y middleware.
- `backend/src/compartido/validaciones/validar.ts`: helpers Zod.
- `backend/src/compartido/tipos/dominio.ts`: tipos compartidos.
- `backend/src/compartido/utilidades/*`: aleatoriedad y calificacion exacta.
- `backend/src/compartido/salud/rutasSalud.ts`: endpoint de salud.
- `backend/src/modulos/modulo_autenticacion/*`: docentes y login.
- `backend/src/modulos/modulo_alumnos/*`: alumnos y periodos.
- `backend/src/modulos/modulo_banco_preguntas/*`: banco y validaciones.
- `backend/src/modulos/modulo_generacion_pdf/*`: plantillas, variantes y PDF.
- `backend/src/modulos/modulo_vinculacion_entrega/*`: vinculacion QR/alumno.
- `backend/src/modulos/modulo_escaneo_omr/*`: pipeline OMR (base).
- `backend/src/modulos/modulo_calificacion/*`: calificacion exacta.
- `backend/src/modulos/modulo_analiticas/*`: banderas de revision.
- `backend/src/modulos/modulo_sincronizacion_nube/*`: sync cloud.

## frontend/
- `frontend/.eslintrc.cjs`: reglas ESLint frontend.
- `frontend/Dockerfile`: build y runtime del frontend.
- `frontend/index.html`: HTML base.
- `frontend/package.json`: dependencias y scripts.
- `frontend/tsconfig.json`: config TS React.
- `frontend/tsconfig.node.json`: config TS tooling.
- `frontend/vite.config.ts`: config Vite.
- `frontend/src/App.tsx`: selector de app docente/alumno.
- `frontend/src/main.tsx`: bootstrap React.
- `frontend/src/styles.css`: estilos globales.
- `frontend/src/apps/app_docente/AppDocente.tsx`: UI docente.
- `frontend/src/apps/app_alumno/AppAlumno.tsx`: portal alumno.
- `frontend/src/servicios_api/clienteApi.ts`: cliente HTTP base.
- `frontend/src/componentes/`: componentes compartidos (placeholder).
- `frontend/src/estado/`: estado global (placeholder).
- `frontend/src/rutas/`: enrutamiento futuro (placeholder).
- `frontend/src/pwa/`: PWA y service worker (placeholder).

## portal_alumno_cloud/
- `portal_alumno_cloud/.eslintrc.cjs`: ESLint portal cloud.
- `portal_alumno_cloud/Dockerfile`: imagen Docker del portal.
- `portal_alumno_cloud/package.json`: dependencias y scripts.
- `portal_alumno_cloud/tsconfig.json`: configuracion TypeScript.
- `portal_alumno_cloud/src/index.ts`: entrada del portal alumno.
- `portal_alumno_cloud/src/app.ts`: middlewares del portal.
- `portal_alumno_cloud/src/configuracion.ts`: lectura de env y defaults.
- `portal_alumno_cloud/src/rutas.ts`: rutas de consulta (solo lectura).
- `portal_alumno_cloud/src/infraestructura/baseDatos/mongoose.ts`: conexion Mongo cloud.
