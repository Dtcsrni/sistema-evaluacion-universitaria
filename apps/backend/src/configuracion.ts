/**
 * Configuracion centralizada del backend.
 */
import dotenv from 'dotenv';

dotenv.config();

const puerto = Number(process.env.PUERTO_API ?? process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? '';
const entorno = process.env.NODE_ENV ?? 'development';
const limiteJson = process.env.LIMITE_JSON ?? '10mb';
const corsOrigenes = (process.env.CORS_ORIGENES ?? 'http://localhost:5173')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);
const jwtSecreto = process.env.JWT_SECRETO ?? 'cambia-este-secreto';
const jwtExpiraHoras = Number(process.env.JWT_EXPIRA_HORAS ?? 8);
const codigoAccesoHoras = Number(process.env.CODIGO_ACCESO_HORAS ?? 12);
const portalAlumnoUrl = process.env.PORTAL_ALUMNO_URL ?? '';
const portalApiKey = process.env.PORTAL_ALUMNO_API_KEY ?? '';

export const configuracion = {
  puerto,
  mongoUri,
  entorno,
  limiteJson,
  corsOrigenes,
  jwtSecreto,
  jwtExpiraHoras,
  codigoAccesoHoras,
  portalAlumnoUrl,
  portalApiKey
};
