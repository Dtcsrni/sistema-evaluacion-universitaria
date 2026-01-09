/**
 * Conexion a MongoDB con Mongoose.
 */
import mongoose from 'mongoose';
import { configuracion } from '../../configuracion';

export async function conectarBaseDatos() {
  if (!configuracion.mongoUri) {
    console.warn('MONGODB_URI no esta definido; se omite la conexion a MongoDB');
    return;
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(configuracion.mongoUri);
    console.log('Conexion a MongoDB exitosa');
  } catch (error) {
    console.error('Fallo la conexion a MongoDB', error);
    throw error;
  }
}
