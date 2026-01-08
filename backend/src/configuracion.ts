/**
 * Configuracion centralizada del backend.
 */
import dotenv from 'dotenv';

dotenv.config();

const puerto = Number(process.env.PUERTO_API ?? process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? '';
const entorno = process.env.NODE_ENV ?? 'development';
const limiteJson = process.env.LIMITE_JSON ?? '1mb';
const corsOrigenes = (process.env.CORS_ORIGENES ?? 'http://localhost:5173')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);

export const configuracion = {
  puerto,
  mongoUri,
  entorno,
  limiteJson,
  corsOrigenes
};
