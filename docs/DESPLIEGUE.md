# Despliegue

## Local (docente)
- Usa Docker Compose con perfil dev:
  ```bash
  npm run stack:dev
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

## Producción local (perfil prod)
- Usa el perfil prod para probar build optimizado:
  ```bash
  npm run stack:prod
  ```

## Cloud Run (portal alumno)
- Servicio separado: `apps/portal_alumno_cloud`.
- API solo lectura y UI `app_alumno`.
- Despliegue recomendado:
  1) Build y push de imagen Docker del portal.
  2) Deploy en Cloud Run con variables de entorno.
  3) Configurar dominio público (HTTPS).
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

## Sincronización
- Desde local: botón "Publicar resultados" ejecuta push a cloud.
- Cloud Scheduler llama endpoint de limpieza de datos vencidos.

## Retención en nube
- Retención mínima: 1 mes + 1 mes post-ciclo.
- Purga anticipada si el almacenamiento free tier lo exige.
- Respaldo local antes de eliminar (CSV/JSON + PDFs/imágenes).
- Endpoint sugerido: `POST /api/portal/limpiar` con API key.
