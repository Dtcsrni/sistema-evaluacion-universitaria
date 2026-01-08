# Despliegue

## Local (docente)
- Usa Docker Compose con perfil dev:
  ```bash
  docker compose --profile dev up --build
  ```
- Servicios:
  - `mongo_local`
  - `api_docente_local`
  - `web_docente_local`

## Produccion local (perfil prod)
- Usa el perfil prod para probar build optimizado:
  ```bash
  docker compose --profile prod up --build
  ```

## Cloud Run (portal alumno)
- Servicio separado: `portal_alumno_cloud`.
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

## Sincronizacion
- Desde local: boton "Publicar resultados" ejecuta push a cloud.
- Cloud Scheduler llama endpoint de limpieza de datos vencidos.

## Retencion en nube
- Retencion minima: 1 mes + 1 mes post-ciclo.
- Purga anticipada si el almacenamiento free tier lo exige.
- Respaldo local antes de eliminar (CSV/JSON + PDFs/imagenes).
