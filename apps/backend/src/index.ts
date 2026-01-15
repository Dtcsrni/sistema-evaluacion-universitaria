/**
 * Punto de entrada del backend docente.
 * Inicializa configuracion, base de datos y servidor HTTP.
 */
import { crearApp } from './app';
import { configuracion } from './configuracion';
import { conectarBaseDatos } from './infraestructura/baseDatos/mongoose';
import { logError, log } from './infraestructura/logging/logger';

async function iniciar() {
  await conectarBaseDatos();

  const app = crearApp();
  app.listen(configuracion.puerto, () => {
    log('ok', 'API docente escuchando', { puerto: configuracion.puerto });
  });
}

iniciar().catch((error) => {
  logError('Error al iniciar el servidor', error);
  process.exit(1);
});
