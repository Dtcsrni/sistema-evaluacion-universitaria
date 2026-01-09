/**
 * Rutas de banco de preguntas.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { crearPregunta, listarBancoPreguntas } from './controladorBancoPreguntas';
import { esquemaCrearPregunta } from './validacionesBancoPreguntas';

const router = Router();

router.get('/', listarBancoPreguntas);
router.post('/', validarCuerpo(esquemaCrearPregunta), crearPregunta);

export default router;
