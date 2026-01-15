// Helpers de Mongo en memoria para pruebas.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import net from 'node:net';

let servidor: MongoMemoryServer | null = null;

async function obtenerPuertoLibreLocal(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('No se pudo obtener un puerto libre')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

export async function conectarMongoTest() {
  if (mongoose.connection.readyState === 1) return;
  const port = await obtenerPuertoLibreLocal();
  servidor = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', port } });
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

