/**
 * Rutas de sincronizacion a nube.
 */
import { Router } from 'express';
import { listarSincronizaciones, publicarResultados } from './controladorSincronizacion';

const router = Router();

router.get('/', listarSincronizaciones);
router.post('/publicar', publicarResultados);

export default router;
