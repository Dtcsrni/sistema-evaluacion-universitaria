/**
 * Rutas de escaneo OMR.
 */
import { Router } from 'express';
import { analizarImagen } from './controladorEscaneoOmr';

const router = Router();

router.post('/analizar', analizarImagen);

export default router;
