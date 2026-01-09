# Despliegue

## Local (docente)
- Usa Docker Compose con perfil dev:
  ```bash
  docker compose --profile dev up --build
  ```
- El backend local siempre corre en Docker (API + Mongo).
- Servicios:
  - `mongo_local`
  - `api_docente_local`
  - `web_docente_local`

## Portal alumno (local)
- Levanta el portal cloud localmente:
  ```bash
  npm run dev:portal
  ```

## Produccion local (perfil prod)
- Usa el perfil prod para probar build optimizado:
  ```bash
  docker compose --profile prod up --build
  ```

## Cloud Run (portal alumno)
- Servicio separado: `apps/portal_alumno_cloud`.
- API solo lectura y UI `app_alumno`.
- Despliegue recomendado:
  1) Build y push de imagen Docker del portal.
  2) Deploy en Cloud Run con variables de entorno.
  3) Configurar dominio publico (HTTPS).
  4) Configurar job de limpieza (Cloud Scheduler + endpoint).

Variables sugeridas:
- `MONGODB_URI`
- `PUERTO_PORTAL`
- `CORS_ORIGENES`
- `PORTAL_API_KEY`
- `CODIGO_ACCESO_HORAS`

Variables en backend docente para publicar:
- `PORTAL_ALUMNO_URL`
- `PORTAL_ALUMNO_API_KEY`

## Sincronizacion
- Desde local: boton "Publicar resultados" ejecuta push a cloud.
- Cloud Scheduler llama endpoint de limpieza de datos vencidos.

## Retencion en nube
- Retencion minima: 1 mes + 1 mes post-ciclo.
- Purga anticipada si el almacenamiento free tier lo exige.
- Respaldo local antes de eliminar (CSV/JSON + PDFs/imagenes).
- Endpoint sugerido: `POST /api/portal/limpiar` con API key.
