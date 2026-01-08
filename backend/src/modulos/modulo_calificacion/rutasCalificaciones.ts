/**
 * Rutas de calificaciones.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { calificarExamen } from './controladorCalificacion';
import { esquemaCalificarExamen } from './validacionesCalificacion';

const router = Router();

router.post('/calificar', validarCuerpo(esquemaCalificarExamen), calificarExamen);

export default router;
