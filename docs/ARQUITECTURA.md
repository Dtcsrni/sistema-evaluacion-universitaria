# Arquitectura

## Resumen
La plataforma se divide en dos piezas:
1) Backend y frontend docente local (monolito modular).
2) Servicio cloud separado para portal alumno (solo lectura).

## Componentes principales
- Backend docente: Express + MongoDB + TypeScript.
- Frontend docente/alumno: React + Vite + TypeScript.
- Cloud Run: servicio portal alumno (API lectura + UI app_alumno).

## Capas del backend
- `modulos/`: dominio de negocio (alumnos, banco, PDF, OMR, calificacion, etc.).
- `infraestructura/`: adaptadores externos (DB, archivos, correo).
- `compartido/`: errores, validaciones, tipos y utilidades.

## Diagrama (texto)

[Frontend docente] -> /api/* (backend docente) -> [MongoDB local]
                                |\
                                | \-> [almacen local PDFs]
                                |  \-> [sync -> cloud]

[Frontend alumno] -> /api_portal/* (portal cloud) -> [MongoDB cloud]

## Decisiones clave
- Monolito modular local: menos complejidad, facil mantenimiento.
- Servicio cloud separado: alta disponibilidad para alumno sin exponer red local.
- Calificacion exacta: Decimal.js y fraccion almacenada.
- PDF carta: baja tinta, margenes seguros y QR en cada pagina.
- PDFs locales se almacenan en `data/examenes` (ignorado por git).

## Nomenclatura
- Rutas, variables y modulos en espanol mexicano con camelCase.
- Colecciones en plural (docentes, alumnos, etc.).
