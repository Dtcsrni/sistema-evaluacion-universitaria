/**
 * Configura middlewares del portal alumno.
 */
import 'express-async-errors';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { configuracion } from './configuracion';
import rutasPortal from './rutas';

export function crearApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: configuracion.corsOrigenes }));
  app.use(express.json({ limit: '25mb' }));
  app.use(mongoSanitize());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use('/api/portal', rutasPortal);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    const mensaje = error instanceof Error ? error.message : 'Error interno';
    res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje } });
  });

  return app;
}
