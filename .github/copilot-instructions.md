# Instrucciones para agentes (Copilot)

## 1) Panorama (que es cada app y por que)
- `apps/backend/`: API docente local (Express + MongoDB, TypeScript) en forma de monolito modular.
	- Motivo: menos complejidad operativa; todo lo del docente vive local.
	- Capas: `src/modulos/` (negocio), `src/infraestructura/` (adaptadores), `src/compartido/` (errores/validaciones/utilidades).
- `apps/frontend/`: UI React + Vite. Contiene 2 “apps” internas (docente y alumno).
	- Selecciona cual montar con `VITE_APP_DESTINO` (ver `apps/frontend/src/App.tsx`).
- `apps/portal_alumno_cloud/`: API del portal alumno (solo lectura + endpoints de sync) pensada para desplegarse aparte (Cloud Run).
	- Motivo: disponibilidad para alumnos sin exponer la red local.
- Documentacion fuente de verdad:
	- Arquitectura: `docs/ARQUITECTURA.md`, `docs/ARQUITECTURA_C4.md`
	- Flujo de datos de examen: `docs/FLUJO_EXAMEN.md`
	- Pruebas/Despliegue: `docs/PRUEBAS.md`, `docs/DESPLIEGUE.md`

## 2) Workflows (comandos que se usan aqui)
- Requisito: Node >= 24 (npm workspaces, ver `package.json`).
- Dev principal:
	- `npm run dev` = API+Mongo por Docker + frontend por Vite.
	- Puertos esperados: frontend dev `5173`, web prod `4173`, API docente `4000`.

### URLs y prefijos utiles

- API docente (backend): `http://localhost:4000`  
	- Salud: `GET /api/salud`  
	- Prefijo: `/api/*`
- Web docente:
	- Dev: `http://localhost:5173`  
	- Prod: `http://localhost:4173`
- Portal alumno (cloud/local): `http://localhost:8080`  
	- Salud: `GET /api/portal/salud`  
	- Prefijo: `/api/portal/*`
- Backend (Docker, recomendado): `npm run dev:backend` (levanta `mongo_local` + `api_docente_local`).
- Frontend (local): `npm run dev:frontend`.
- Portal cloud (local): `npm run dev:portal`.
- Verificacion rapida: `npm run status` (usa `scripts/dashboard.mjs` para checar salud de API/Web).
- Windows dashboard (UI local para controlar procesos):
	- `scripts/launch-dev.cmd` / `scripts/launch-prod.cmd` ejecutan `scripts/launcher-dashboard.mjs`.
	- Nota: el launcher filtra ruido (especialmente de Mongo) a menos que se use `--full-logs`.

## 3) Convenciones de codigo 
- Idioma/nombres: rutas, variables y modulos en espanol mexicano y `camelCase`.
- Backend: las rutas se registran en un “router central” (ver `apps/backend/src/rutas.ts`).
	- Publicas: `/api/salud`, `/api/autenticacion/*`.
	- Protegidas: el resto pasa por `requerirDocente` (JWT Bearer).
- Validacion de requests:
	- Se usa Zod en middleware: `validarCuerpo(esquemaZod)` (ver `apps/backend/src/compartido/validaciones/validar.ts`).
	- El contrato de error de validacion usa `ErrorAplicacion('VALIDACION', ..., detallesFlatten)`.
- Errores del API docente:
	- Para errores controlados, lanza `ErrorAplicacion`.
	- La respuesta estandar es: `{ error: { codigo, mensaje, detalles? } }` (ver `apps/backend/src/compartido/errores/manejadorErrores.ts`).
	- Para errores inesperados se devuelve `ERROR_INTERNO`.

## 4) Auth y seguridad (patrones existentes)
- Docente (backend): JWT Bearer.
	- Middleware: `requerirDocente` (ver `apps/backend/src/modulos/modulo_autenticacion/middlewareAutenticacion.ts`).
	- Tokens: `crearTokenDocente` / `verificarTokenDocente` (ver `apps/backend/src/modulos/modulo_autenticacion/servicioTokens.ts`).
- Alumno (portal cloud): token Bearer, pero almacenado como hash (no en texto plano).
	- Middleware: `requerirSesionAlumno` (ver `apps/portal_alumno_cloud/src/servicios/middlewareSesion.ts`).
- Endpoints sensibles del portal:
	- `/api/portal/sincronizar` y `/api/portal/limpiar` requieren `x-api-key` (variable `PORTAL_API_KEY`).
- Hardening en Express ya configurado (helmet, rate limit, mongo sanitize) en `apps/backend/src/app.ts` y `apps/portal_alumno_cloud/src/app.ts`.

## 5) Integraciones y datos (puntos que rompen facil)
- Mongo (Mongoose):
	- Backend omite conexion si falta `MONGODB_URI` (ver `apps/backend/src/infraestructura/baseDatos/mongoose.ts`). No asumas DB siempre disponible en dev.
- PDFs/artefactos locales:
	- PDFs generados y datos de examenes se guardan en `apps/backend/data/examenes/` (no versionar, se usa en flujo/pruebas).
- Sincronizacion local -> cloud:
	- Backend publica a `PORTAL_ALUMNO_URL` autenticando con `PORTAL_ALUMNO_API_KEY`.

## 6) Pruebas (lo que hay y como correrlas)
- Runner: Vitest en las 3 apps (configs en `apps/*/vitest.config.ts`).
- Estructura:
	- Backend: `apps/backend/tests/` (unitarias + contrato + integracion).
	- Portal: `apps/portal_alumno_cloud/tests/` (integracion de sync/ingreso/resultados/PDF).
	- Frontend: `apps/frontend/tests/` (render basico de app docente/alumno).
- Mongo en memoria para integracion: `apps/**/tests/utils/mongo.ts`.
- Comandos:
	- Backend: `npm run test` (o `npm run test:backend`)
	- Portal: `npm run test:portal`
	- Frontend: `npm run test:frontend`

## 7) Recetas rapidas (como encajar cambios)
- Agregar un endpoint nuevo en API docente:
	1) Crear `rutasX.ts` + `controladorX.ts` + `validacionesX.ts` dentro de `apps/backend/src/modulos/<tu_modulo>/`.
	2) En el router del modulo, usar `validarCuerpo(esquema)` en POST/PUT.
	3) Registrar el router en `apps/backend/src/rutas.ts`.
		 - Si debe ser publico: antes de `router.use(requerirDocente)`.
		 - Si debe ser protegido: despues de `router.use(requerirDocente)`.
- Manejo de errores:
	- Preferir `throw new ErrorAplicacion('CODIGO', 'Mensaje', httpStatus, detalles?)` en lugar de `res.status(...).json(...)` en el backend (para mantener el contrato y el middleware).

## 8) Dependencias
- Evitar nuevas dependencias salvo necesidad clara. Ya existen y se usan: `zod`, `mongoose`, `pdf-lib`, `sharp`, `jsqr`, `jsonwebtoken`.
