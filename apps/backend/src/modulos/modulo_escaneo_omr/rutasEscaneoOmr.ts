/**
 * Rutas de escaneo OMR.
 */
import { Router } from 'express';
import { analizarImagen } from './controladorEscaneoOmr';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { esquemaAnalizarOmr } from './validacionesOmr';

const router = Router();

router.post('/analizar', validarCuerpo(esquemaAnalizarOmr), analizarImagen);

export default router;
