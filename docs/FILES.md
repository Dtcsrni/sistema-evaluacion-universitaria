# Mapa de archivos

Este documento describe cada archivo del repositorio. Los archivos
generados o lockfiles no deben editarse manualmente.

## Raiz
- `.gitignore`: artefactos y archivos ignorados.
- `.github/copilot-instructions.md`: guias de estilo para el repo.
- `apps/`: aplicaciones del monorepo (backend, frontend, portal).
- `CHANGELOG.md`: historial de cambios (SemVer).
- `docker-compose.yml`: stack local con perfiles dev/prod.
- `package.json`: scripts y workspaces.
- `package-lock.json`: lockfile de npm (generado).
- `README.md`: guia principal del proyecto.

## docs/
- `docs/ARQUITECTURA.md`: decisiones, responsabilidades y diagramas texto.
- `docs/FLUJO_EXAMEN.md`: flujo completo de examen.
- `docs/DESPLIEGUE.md`: Docker Compose local y Cloud Run.
- `docs/SEGURIDAD.md`: checklist OWASP API 2023.
- `docs/FORMATO_PDF.md`: reglas de PDF carta y OMR.
- `docs/PRUEBAS.md`: alcance y ejecucion de pruebas.
- `docs/VERSIONADO.md`: convenciones alpha/beta/estable y releases.
- `docs/AUTO_ENV.md`: variables de entorno detectadas (auto-generado).
- `docs/AUTO_DOCS_INDEX.md`: indice de docs (auto-generado).
- `docs/FILES.md`: este mapa de archivos.
- `docs/diagramas/src/`: fuentes Mermaid (codigo).
- `docs/diagramas/rendered/`: SVG renderizados.

## scripts/
- `scripts/dashboard.mjs`: verificacion rapida de API y web.
- `scripts/docs.mjs`: genera/verifica docs autoactualizables (`docs:generate`, `docs:check`).

## apps/backend/
- `apps/backend/.eslintrc.cjs`: reglas ESLint backend.
- `apps/backend/Dockerfile`: imagen Docker API.
- `apps/backend/package.json`: dependencias y scripts backend.
- `apps/backend/tsconfig.json`: configuracion TypeScript backend.
- `apps/backend/vitest.config.ts`: configuracion de pruebas Vitest.

### apps/backend/src
- `apps/backend/src/index.ts`: entrypoint del servidor.
- `apps/backend/src/app.ts`: configuracion Express y middlewares.
- `apps/backend/src/configuracion.ts`: lectura de env y defaults.
- `apps/backend/src/rutas.ts`: registro de rutas API.

### apps/backend/src/infraestructura
- `apps/backend/src/infraestructura/baseDatos/mongoose.ts`: conexion Mongo.
- `apps/backend/src/infraestructura/archivos/almacenLocal.ts`: guardado local de PDFs.
- `apps/backend/src/infraestructura/correo/servicioCorreo.ts`: placeholder envio de correo.

### apps/backend/src/compartido/errores
- `apps/backend/src/compartido/errores/errorAplicacion.ts`: error tipado de dominio.
- `apps/backend/src/compartido/errores/manejadorErrores.ts`: middleware de errores.

### apps/backend/src/compartido/salud
- `apps/backend/src/compartido/salud/rutasSalud.ts`: endpoint de salud.

### apps/backend/src/compartido/tipos
- `apps/backend/src/compartido/tipos/dominio.ts`: tipos compartidos de dominio.
- `apps/backend/src/compartido/tipos/jsqr.d.ts`: tipos para jsQR.

### apps/backend/src/compartido/utilidades
- `apps/backend/src/compartido/utilidades/aleatoriedad.ts`: helpers de aleatoriedad.
- `apps/backend/src/compartido/utilidades/calculoCalificacion.ts`: fracciones y Decimal.

### apps/backend/src/compartido/validaciones
- `apps/backend/src/compartido/validaciones/validar.ts`: helpers Zod.

### apps/backend/src/modulos/modulo_autenticacion
- `apps/backend/src/modulos/modulo_autenticacion/controladorAutenticacion.ts`: registro, login y perfil.
- `apps/backend/src/modulos/modulo_autenticacion/middlewareAutenticacion.ts`: JWT y helper de docente.
- `apps/backend/src/modulos/modulo_autenticacion/modeloDocente.ts`: esquema Docente.
- `apps/backend/src/modulos/modulo_autenticacion/rutasAutenticacion.ts`: rutas de auth.
- `apps/backend/src/modulos/modulo_autenticacion/servicioHash.ts`: hash de contrasena.
- `apps/backend/src/modulos/modulo_autenticacion/servicioTokens.ts`: JWT docente.
- `apps/backend/src/modulos/modulo_autenticacion/validacionesAutenticacion.ts`: validaciones Zod.

### apps/backend/src/modulos/modulo_alumnos
- `apps/backend/src/modulos/modulo_alumnos/controladorAlumnos.ts`: CRUD alumnos.
- `apps/backend/src/modulos/modulo_alumnos/controladorPeriodos.ts`: CRUD periodos.
- `apps/backend/src/modulos/modulo_alumnos/modeloAlumno.ts`: esquema Alumno.
- `apps/backend/src/modulos/modulo_alumnos/modeloPeriodo.ts`: esquema Periodo.
- `apps/backend/src/modulos/modulo_alumnos/rutasAlumnos.ts`: rutas alumnos.
- `apps/backend/src/modulos/modulo_alumnos/rutasPeriodos.ts`: rutas periodos.
- `apps/backend/src/modulos/modulo_alumnos/validacionesAlumnos.ts`: validaciones Zod alumnos.
- `apps/backend/src/modulos/modulo_alumnos/validacionesPeriodos.ts`: validaciones Zod periodos.

### apps/backend/src/modulos/modulo_banco_preguntas
- `apps/backend/src/modulos/modulo_banco_preguntas/controladorBancoPreguntas.ts`: CRUD banco preguntas.
- `apps/backend/src/modulos/modulo_banco_preguntas/modeloBancoPregunta.ts`: esquema BancoPregunta.
- `apps/backend/src/modulos/modulo_banco_preguntas/rutasBancoPreguntas.ts`: rutas banco preguntas.
- `apps/backend/src/modulos/modulo_banco_preguntas/validacionesBancoPreguntas.ts`: validaciones Zod banco.

### apps/backend/src/modulos/modulo_generacion_pdf
- `apps/backend/src/modulos/modulo_generacion_pdf/controladorGeneracionPdf.ts`: CRUD plantillas y generar.
- `apps/backend/src/modulos/modulo_generacion_pdf/controladorListadoGenerados.ts`: listados y descarga.
- `apps/backend/src/modulos/modulo_generacion_pdf/modeloExamenGenerado.ts`: esquema ExamenGenerado.
- `apps/backend/src/modulos/modulo_generacion_pdf/modeloExamenPlantilla.ts`: esquema ExamenPlantilla.
- `apps/backend/src/modulos/modulo_generacion_pdf/rutasGeneracionPdf.ts`: rutas de generacion.
- `apps/backend/src/modulos/modulo_generacion_pdf/servicioGeneracionPdf.ts`: render PDF + mapa OMR.
- `apps/backend/src/modulos/modulo_generacion_pdf/servicioVariantes.ts`: variantes y ordenamientos.
- `apps/backend/src/modulos/modulo_generacion_pdf/validacionesExamenes.ts`: validaciones Zod.

### apps/backend/src/modulos/modulo_vinculacion_entrega
- `apps/backend/src/modulos/modulo_vinculacion_entrega/controladorVinculacionEntrega.ts`: vincular examen/alumno.
- `apps/backend/src/modulos/modulo_vinculacion_entrega/modeloEntrega.ts`: esquema Entrega.
- `apps/backend/src/modulos/modulo_vinculacion_entrega/rutasVinculacionEntrega.ts`: rutas vinculacion.
- `apps/backend/src/modulos/modulo_vinculacion_entrega/validacionesVinculacion.ts`: validaciones Zod.

### apps/backend/src/modulos/modulo_escaneo_omr
- `apps/backend/src/modulos/modulo_escaneo_omr/controladorEscaneoOmr.ts`: escaneo y revision OMR.
- `apps/backend/src/modulos/modulo_escaneo_omr/rutasEscaneoOmr.ts`: rutas OMR.
- `apps/backend/src/modulos/modulo_escaneo_omr/servicioOmr.ts`: pipeline QR + marcas + burbujas.
- `apps/backend/src/modulos/modulo_escaneo_omr/validacionesOmr.ts`: validaciones Zod OMR.

### apps/backend/src/modulos/modulo_calificacion
- `apps/backend/src/modulos/modulo_calificacion/controladorCalificacion.ts`: calcular y guardar.
- `apps/backend/src/modulos/modulo_calificacion/modeloCalificacion.ts`: esquema Calificacion.
- `apps/backend/src/modulos/modulo_calificacion/rutasCalificaciones.ts`: rutas calificacion.
- `apps/backend/src/modulos/modulo_calificacion/servicioCalificacion.ts`: calculo exacto y topes.
- `apps/backend/src/modulos/modulo_calificacion/validacionesCalificacion.ts`: validaciones Zod.

### apps/backend/src/modulos/modulo_analiticas
- `apps/backend/src/modulos/modulo_analiticas/controladorAnaliticas.ts`: banderas y exportaciones.
- `apps/backend/src/modulos/modulo_analiticas/modeloBanderaRevision.ts`: esquema BanderaRevision.
- `apps/backend/src/modulos/modulo_analiticas/rutasAnaliticas.ts`: rutas analiticas.
- `apps/backend/src/modulos/modulo_analiticas/servicioExportacionCsv.ts`: CSV generico.
- `apps/backend/src/modulos/modulo_analiticas/validacionesAnaliticas.ts`: validaciones Zod.

### apps/backend/src/modulos/modulo_sincronizacion_nube
- `apps/backend/src/modulos/modulo_sincronizacion_nube/controladorSincronizacion.ts`: publicacion cloud.
- `apps/backend/src/modulos/modulo_sincronizacion_nube/modeloCodigoAcceso.ts`: esquema CodigoAcceso.
- `apps/backend/src/modulos/modulo_sincronizacion_nube/modeloSincronizacion.ts`: esquema Sincronizacion.
- `apps/backend/src/modulos/modulo_sincronizacion_nube/rutasSincronizacionNube.ts`: rutas sync.
- `apps/backend/src/modulos/modulo_sincronizacion_nube/validacionesSincronizacion.ts`: validaciones Zod.

### apps/backend/tests
- `apps/backend/tests/setup.ts`: setup de entorno para pruebas.
- `apps/backend/tests/calificacion.test.ts`: pruebas de calculo exacto y topes.
- `apps/backend/tests/csv.test.ts`: pruebas de exportacion CSV.
- `apps/backend/tests/variantes.test.ts`: pruebas de variantes aleatorias.
- `apps/backend/tests/salud.test.ts`: prueba de salud API.
- `apps/backend/tests/contrato/validaciones.test.ts`: validaciones de payload.
- `apps/backend/tests/integracion/flujoExamen.test.ts`: flujo completo de examen.
- `apps/backend/tests/integracion/autorizacion.test.ts`: seguridad de tokens.
- `apps/backend/tests/integracion/aislamientoDocente.test.ts`: aislamiento por docente.
- `apps/backend/tests/utils/mongo.ts`: Mongo en memoria para pruebas.
- `apps/backend/tests/utils/token.ts`: helper para token de docente.

## apps/frontend/
- `apps/frontend/Dockerfile`: build y runtime del frontend.
- `apps/frontend/index.html`: HTML base.
- `apps/frontend/package.json`: dependencias y scripts.
- `apps/frontend/tsconfig.json`: config TS React.
- `apps/frontend/tsconfig.node.json`: config TS tooling.
- `apps/frontend/vite.config.ts`: config Vite.
- `apps/frontend/vitest.config.ts`: configuracion de pruebas frontend.

### apps/frontend/src
- `apps/frontend/src/App.tsx`: selector de app docente/alumno.
- `apps/frontend/src/main.tsx`: bootstrap React.
- `apps/frontend/src/styles.css`: estilos globales.
- `apps/frontend/src/apps/app_docente/AppDocente.tsx`: UI docente.
- `apps/frontend/src/apps/app_alumno/AppAlumno.tsx`: portal alumno.
- `apps/frontend/src/servicios_api/clienteApi.ts`: cliente HTTP docente (JWT).
- `apps/frontend/src/servicios_api/clientePortal.ts`: cliente HTTP portal (token).
- `apps/frontend/src/componentes/`: carpeta preparada para componentes.
- `apps/frontend/src/estado/`: carpeta preparada para estado global.
- `apps/frontend/src/rutas/`: carpeta preparada para rutas.
- `apps/frontend/src/pwa/`: carpeta preparada para PWA.

### apps/frontend/tests
- `apps/frontend/tests/setup.ts`: setup de pruebas React.
- `apps/frontend/tests/appDocente.test.tsx`: render basico app docente.
- `apps/frontend/tests/appAlumno.test.tsx`: render basico app alumno.

## apps/portal_alumno_cloud/
- `apps/portal_alumno_cloud/Dockerfile`: imagen Docker portal alumno.
- `apps/portal_alumno_cloud/package.json`: dependencias y scripts.
- `apps/portal_alumno_cloud/tsconfig.json`: configuracion TypeScript.
- `apps/portal_alumno_cloud/vitest.config.ts`: configuracion de pruebas portal alumno.

### apps/portal_alumno_cloud/src
- `apps/portal_alumno_cloud/src/index.ts`: entrypoint del portal.
- `apps/portal_alumno_cloud/src/app.ts`: middlewares del portal.
- `apps/portal_alumno_cloud/src/configuracion.ts`: lectura de env y defaults.
- `apps/portal_alumno_cloud/src/rutas.ts`: rutas de consulta y sync.
- `apps/portal_alumno_cloud/src/infraestructura/baseDatos/mongoose.ts`: conexion Mongo cloud.
- `apps/portal_alumno_cloud/src/modelos/modeloCodigoAcceso.ts`: esquema CodigoAcceso cloud.
- `apps/portal_alumno_cloud/src/modelos/modeloResultadoAlumno.ts`: esquema ResultadoAlumno.
- `apps/portal_alumno_cloud/src/modelos/modeloSesionAlumno.ts`: esquema SesionAlumno.
- `apps/portal_alumno_cloud/src/servicios/middlewareSesion.ts`: middleware token alumno.
- `apps/portal_alumno_cloud/src/servicios/servicioSesion.ts`: hash y tokens de sesion.

### apps/portal_alumno_cloud/tests
- `apps/portal_alumno_cloud/tests/setup.ts`: setup de entorno portal.
- `apps/portal_alumno_cloud/tests/utils/mongo.ts`: Mongo en memoria para pruebas.
- `apps/portal_alumno_cloud/tests/integracion/portal.test.ts`: flujo de portal alumno.


