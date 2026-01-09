# Pruebas automatizadas

## Objetivo
Garantizar que las reglas criticas y los flujos base se mantengan estables con
pruebas repetibles y aisladas.

## Alcance actual
- Unitarias:
  - Calculo exacto de calificaciones y topes.
  - Exportacion CSV (escape de comas y comillas).
  - Variantes y ordenes de preguntas/opciones.
- Contrato y validaciones:
  - Payloads invalidos retornan error 400 con codigo `VALIDACION`.
- Integracion backend:
  - Flujo completo de examen con base de datos en memoria.
  - Aislamiento por docente y autorizacion por token.
- Integracion portal alumno:
  - Sincronizacion, ingreso, consulta de resultados y PDF.
- Frontend:
  - Render basico de app docente y alumno.
- Smoke:
  - Endpoint `GET /api/salud` del backend.

## Como ejecutar
- Desde la raiz:
  ```bash
  npm run test
  ```
- Portal alumno:
  ```bash
  npm run test:portal
  ```
- Frontend:
  ```bash
  npm run test:frontend
  ```
- Directo en backend:
  ```bash
  npm --prefix apps/backend run test
  ```
- Directo en portal:
  ```bash
  npm --prefix apps/portal_alumno_cloud run test
  ```
- Directo en frontend:
  ```bash
  npm --prefix apps/frontend run test
  ```

## Estructura
- `apps/backend/tests/`: pruebas unitarias y smoke del backend.
- `apps/backend/tests/integracion/`: pruebas de integracion y flujo.
- `apps/backend/tests/contrato/`: pruebas de validacion de payload.
- `apps/backend/tests/utils/`: helpers para Mongo y tokens.
- `apps/backend/vitest.config.ts`: configuracion de pruebas backend.
- `apps/portal_alumno_cloud/tests/`: pruebas del portal alumno.
- `apps/portal_alumno_cloud/vitest.config.ts`: configuracion de pruebas portal.
- `apps/frontend/tests/`: pruebas de componentes React.
- `apps/frontend/vitest.config.ts`: configuracion de pruebas frontend.

## Notas
- Las pruebas de integracion usan MongoDB en memoria.
- El flujo de examen genera PDF local en `data/examenes` durante la prueba.
- El smoke test de salud valida el formato base de respuesta.


