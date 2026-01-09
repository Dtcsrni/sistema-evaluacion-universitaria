/**
 * Configuracion del portal alumno cloud.
 */
import dotenv from 'dotenv';

dotenv.config();

const puerto = Number(process.env.PUERTO_PORTAL ?? process.env.PORT ?? 8080);
const mongoUri = process.env.MONGODB_URI ?? '';
const corsOrigenes = (process.env.CORS_ORIGENES ?? '*')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);
const portalApiKey = process.env.PORTAL_API_KEY ?? '';
const codigoAccesoHoras = Number(process.env.CODIGO_ACCESO_HORAS ?? 12);

export const configuracion = {
  puerto,
  mongoUri,
  corsOrigenes,
  portalApiKey,
  codigoAccesoHoras
};
