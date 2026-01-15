/**
 * Conexion a MongoDB para portal alumno.
 */
import mongoose from 'mongoose';
import { configuracion } from '../../configuracion';
import { log, logError } from '../logging/logger';

export async function conectarBaseDatos() {
  if (!configuracion.mongoUri) {
    log('warn', 'MONGODB_URI no esta definido; se omite la conexion a MongoDB');
    return;
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(configuracion.mongoUri);
    log('ok', 'Conexion a MongoDB (portal) exitosa');
  } catch (error) {
    logError('Fallo la conexion a MongoDB (portal)', error);
    throw error;
  }
}
