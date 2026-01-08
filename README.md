# MERN Starter

Estructura mínima MERN: backend (Express+TS+Mongo) y frontend (Vite+React+TS).

## Requisitos
- Node.js 18+
- npm 9+
- Docker (opcional para MongoDB local)

## Configuración
1) Duplica `.env.example` a `.env` y ajusta valores.
2) Instala dependencias en el monorepo:
   ```bash
   npm install
   ```
3) Contenedores (Mongo + API + Web):
   ```bash
   docker compose up --build
   ```
   - Web: http://localhost:4173
   - API: http://localhost:4000/api/health

## Scripts
- `npm run dev` – levanta backend + frontend
- `npm run dev:backend` – solo API
- `npm run dev:frontend` – solo web
- `npm run build` – compila ambos
- `npm run status` – dashboard en consola
- `npm start` – producción (API)

## Estructura
```
backend/       Express + TypeScript + MongoDB
frontend/      Vite + React + TypeScript
scripts/       dashboard.mjs para estado
```

Endpoint de prueba: `GET /api/health` devuelve `{ status, uptime, db }`.
