/**
 * Crea la app HTTP (Express) del portal alumno.
 *
 * El portal es de solo lectura/consulta + sincronizacion desde el backend.
 * Mantiene defensas basicas (helmet, sanitizacion, rate-limit) y responde con
 * un envelope de error consistente.
 */
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { configuracion } from './configuracion';
import rutasPortal from './rutas';
import { sanitizarMongo } from './infraestructura/seguridad/sanitizarMongo';
import { manejadorErroresPortal } from './compartido/errores/manejadorErrores';

export function crearApp() {
  const app = express();

  // Reduce leakage de informacion sobre la tecnologia del servidor.
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: configuracion.corsOrigenes }));
  app.use(express.json({ limit: '25mb' }));
  app.use(sanitizarMongo());
  app.use(
    rateLimit({
      windowMs: configuracion.rateLimitWindowMs,
      limit: configuracion.rateLimitLimit,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use('/api/portal', rutasPortal);

  // Manejador final (fallback) para errores no controlados.
  app.use(manejadorErroresPortal);

  return app;
}
