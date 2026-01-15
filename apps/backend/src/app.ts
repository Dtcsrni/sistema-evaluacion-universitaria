/**
 * Crea la app HTTP (Express) del backend.
 *
 * Principios:
 * - Seguridad por defecto (cabeceras, sanitización, rate-limit)
 * - Validación en modulos (Zod) y error envelope consistente
 * - Sin side-effects al importar (fácil de testear)
 */
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { configuracion } from './configuracion';
import { crearRouterApi } from './rutas';
import { manejadorErrores } from './compartido/errores/manejadorErrores';
import { sanitizarMongo } from './infraestructura/seguridad/sanitizarMongo';

export function crearApp() {
  const app = express();

  // Reduce leakage de informacion sobre la tecnologia del servidor.
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: configuracion.corsOrigenes, credentials: true }));
  app.use(express.json({ limit: configuracion.limiteJson }));
  app.use(sanitizarMongo());
  app.use(
    rateLimit({
      windowMs: configuracion.rateLimitWindowMs,
      limit: configuracion.rateLimitLimit,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use('/api', crearRouterApi());

  app.use(manejadorErrores);

  return app;
}
