/**
 * Punto de entrada del portal alumno cloud.
 */
import { crearApp } from './app';
import { configuracion } from './configuracion';
import { conectarBaseDatos } from './infraestructura/baseDatos/mongoose';
import { log, logError } from './infraestructura/logging/logger';

async function iniciar() {
  await conectarBaseDatos();
  const app = crearApp();

  app.listen(configuracion.puerto, () => {
    log('ok', 'Portal alumno escuchando', { puerto: configuracion.puerto });
  });
}

iniciar().catch((error) => {
  logError('Error al iniciar portal alumno', error);
  process.exit(1);
});
