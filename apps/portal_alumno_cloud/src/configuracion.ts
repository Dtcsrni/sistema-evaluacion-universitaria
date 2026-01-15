/**
 * Configuracion del portal alumno cloud.
 */
import dotenv from 'dotenv';

// Dotenv v17 puede emitir logs informativos; se silencian para mantener
// pruebas y consola limpias.
dotenv.config({ quiet: true });

const puerto = Number(process.env.PUERTO_PORTAL ?? process.env.PORT ?? 8080);
const mongoUri = process.env.MONGODB_URI ?? '';
const entorno = process.env.NODE_ENV ?? 'development';
const corsOrigenes = (process.env.CORS_ORIGENES ?? '*')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);
const portalApiKey = process.env.PORTAL_API_KEY ?? '';
const codigoAccesoHoras = Number(process.env.CODIGO_ACCESO_HORAS ?? 12);

function parsearNumeroSeguro(valor: unknown, porDefecto: number, { min, max }: { min?: number; max?: number } = {}) {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  const clampedMax = typeof max === 'number' ? Math.min(max, n) : n;
  const clamped = typeof min === 'number' ? Math.max(min, clampedMax) : clampedMax;
  return clamped;
}

const rateLimitWindowMs = parsearNumeroSeguro(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, {
  min: 1_000,
  max: 24 * 60 * 60 * 1000
});
const rateLimitLimit = parsearNumeroSeguro(process.env.RATE_LIMIT_LIMIT, 200, { min: 1, max: 10_000 });

export const configuracion = {
  puerto,
  mongoUri,
  entorno,
  corsOrigenes,
  portalApiKey,
  codigoAccesoHoras,
  rateLimitWindowMs,
  rateLimitLimit
};
