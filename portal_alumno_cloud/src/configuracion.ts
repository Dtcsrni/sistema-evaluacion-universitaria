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

export const configuracion = {
  puerto,
  mongoUri,
  corsOrigenes
};
