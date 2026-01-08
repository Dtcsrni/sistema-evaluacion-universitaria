/**
 * Rutas del portal alumno (solo lectura).
 */
import { Router } from 'express';

const router = Router();

router.get('/salud', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.post('/ingresar', (_req, res) => {
  res.status(501).json({ mensaje: 'Autenticacion por codigo pendiente' });
});

router.get('/resultados/:folio', (_req, res) => {
  res.status(501).json({ mensaje: 'Consulta de resultados pendiente' });
});

export default router;
