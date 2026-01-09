/**
 * Configura middlewares, rutas y manejo de errores.
 */
import 'express-async-errors';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { configuracion } from './configuracion';
import { crearRouterApi } from './rutas';
import { manejadorErrores } from './compartido/errores/manejadorErrores';

export function crearApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: configuracion.corsOrigenes, credentials: true }));
  app.use(express.json({ limit: configuracion.limiteJson }));
  app.use(mongoSanitize());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use('/api', crearRouterApi());

  app.use(manejadorErrores);

  return app;
}
