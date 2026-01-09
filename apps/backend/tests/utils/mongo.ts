import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let servidor: MongoMemoryServer | null = null;

export async function conectarMongoTest() {
  if (mongoose.connection.readyState === 1) return;
  servidor = await MongoMemoryServer.create();
  await mongoose.connect(servidor.getUri());
}

export async function limpiarMongoTest() {
  const colecciones = mongoose.connection.collections;
  const tareas = Object.keys(colecciones).map((clave) => colecciones[clave].deleteMany({}));
  await Promise.all(tareas);
}

export async function cerrarMongoTest() {
  await mongoose.disconnect();
  if (servidor) {
    await servidor.stop();
    servidor = null;
  }
}
