# Changelog

Este archivo sigue el formato "Keep a Changelog" (alto nivel) y SemVer.

## [0.1.0] - 2026-01-15

- Monorepo inicial (backend, frontend, portal alumno cloud)
- Hardening base: Helmet, rate limit, sanitizacion NoSQL, no leakage de mensajes internos en produccion
- Pruebas robustas: `test:ci` con reintentos + harness estricto para warnings/errores
