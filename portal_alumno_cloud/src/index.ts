/**
 * Punto de entrada del portal alumno cloud.
 */
import { crearApp } from './app';
import { configuracion } from './configuracion';
import { conectarBaseDatos } from './infraestructura/baseDatos/mongoose';

async function iniciar() {
  await conectarBaseDatos();
  const app = crearApp();

  app.listen(configuracion.puerto, () => {
    console.log(`Portal alumno escuchando en puerto ${configuracion.puerto}`);
  });
}

iniciar().catch((error) => {
  console.error('Error al iniciar portal alumno', error);
  process.exit(1);
});
