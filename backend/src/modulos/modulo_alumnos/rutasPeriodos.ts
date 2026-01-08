/**
 * Rutas de periodos.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { crearPeriodo, listarPeriodos } from './controladorPeriodos';
import { esquemaCrearPeriodo } from './validacionesPeriodos';

const router = Router();

router.get('/', listarPeriodos);
router.post('/', validarCuerpo(esquemaCrearPeriodo), crearPeriodo);

export default router;
