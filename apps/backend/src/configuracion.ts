/**
 * Configuracion centralizada del backend.
 */
import dotenv from 'dotenv';

// Dotenv v17 puede emitir logs informativos; se silencian para mantener
// pruebas y consola limpias.
dotenv.config({ quiet: true });

const puerto = Number(process.env.PUERTO_API ?? process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? '';
const entorno = process.env.NODE_ENV ?? 'development';
const limiteJson = process.env.LIMITE_JSON ?? '10mb';
const corsOrigenes = (process.env.CORS_ORIGENES ?? 'http://localhost:5173')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);

function parsearNumeroSeguro(valor: unknown, porDefecto: number, { min, max }: { min?: number; max?: number } = {}) {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  const clampedMax = typeof max === 'number' ? Math.min(max, n) : n;
  const clamped = typeof min === 'number' ? Math.max(min, clampedMax) : clampedMax;
  return clamped;
}
// En producción, el secreto JWT debe ser proporcionado por entorno.
// En desarrollo/test se permite un valor por defecto para facilitar el setup.
const jwtSecreto = process.env.JWT_SECRETO ?? '';
if (entorno === 'production' && !jwtSecreto) {
  throw new Error('JWT_SECRETO es requerido en producción');
}
const jwtSecretoEfectivo = jwtSecreto || 'cambia-este-secreto';
const jwtExpiraHoras = Number(process.env.JWT_EXPIRA_HORAS ?? 8);
const codigoAccesoHoras = Number(process.env.CODIGO_ACCESO_HORAS ?? 12);
const portalAlumnoUrl = process.env.PORTAL_ALUMNO_URL ?? '';
const portalApiKey = process.env.PORTAL_ALUMNO_API_KEY ?? '';

// Rate limit: configurable por entorno para tuning y para pruebas deterministas.
// Defaults conservan el comportamiento anterior.
const rateLimitWindowMs = parsearNumeroSeguro(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, {
  min: 1_000,
  max: 24 * 60 * 60 * 1000
});
const rateLimitLimit = parsearNumeroSeguro(process.env.RATE_LIMIT_LIMIT, 300, { min: 1, max: 10_000 });

// OMR: limite del tamaño de la imagen en base64 (en caracteres) para evitar payloads abusivos.
// Nota: base64 suele inflar ~33%, por eso se controla por longitud de string.
const omrImagenBase64MaxChars = parsearNumeroSeguro(process.env.OMR_IMAGEN_BASE64_MAX_CHARS, 2_000_000, {
  min: 1_000,
  max: 50_000_000
});

export const configuracion = {
  puerto,
  mongoUri,
  entorno,
  limiteJson,
  corsOrigenes,
  jwtSecreto: jwtSecretoEfectivo,
  jwtExpiraHoras,
  codigoAccesoHoras,
  portalAlumnoUrl,
  portalApiKey,
  rateLimitWindowMs,
  rateLimitLimit,
  omrImagenBase64MaxChars
};
