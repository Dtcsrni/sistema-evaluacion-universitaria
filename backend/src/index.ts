/**
 * Punto de entrada del backend docente.
 * Inicializa configuracion, base de datos y servidor HTTP.
 */
import { crearApp } from './app';
import { configuracion } from './configuracion';
import { conectarBaseDatos } from './infraestructura/baseDatos/mongoose';

async function iniciar() {
  await conectarBaseDatos();

  const app = crearApp();
  app.listen(configuracion.puerto, () => {
    console.log(`API docente escuchando en puerto ${configuracion.puerto}`);
  });
}

iniciar().catch((error) => {
  console.error('Error al iniciar el servidor', error);
  process.exit(1);
});
