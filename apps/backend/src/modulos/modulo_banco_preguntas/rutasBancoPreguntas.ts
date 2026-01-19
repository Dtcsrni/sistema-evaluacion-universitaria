/**
 * Rutas de banco de preguntas.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import {
	actualizarTemaBanco,
	actualizarPregunta,
	archivarTemaBanco,
	archivarPregunta,
	crearTemaBanco,
	crearPregunta,
	moverPreguntasTemaBanco,
	quitarTemaBanco,
	listarTemasBanco,
	listarBancoPreguntas
} from './controladorBancoPreguntas';
import {
	esquemaActualizarPregunta,
	esquemaActualizarTemaBanco,
	esquemaCrearTemaBanco,
	esquemaCrearPregunta,
	esquemaMoverPreguntasTemaBanco,
	esquemaQuitarTemaBanco
} from './validacionesBancoPreguntas';

const router = Router();

router.get('/', listarBancoPreguntas);

router.get('/temas', listarTemasBanco);
router.post('/temas', validarCuerpo(esquemaCrearTemaBanco, { strict: true }), crearTemaBanco);
router.post('/temas/:temaId/actualizar', validarCuerpo(esquemaActualizarTemaBanco, { strict: true }), actualizarTemaBanco);
router.post('/temas/:temaId/archivar', archivarTemaBanco);

router.post('/', validarCuerpo(esquemaCrearPregunta, { strict: true }), crearPregunta);
router.post('/:preguntaId/actualizar', validarCuerpo(esquemaActualizarPregunta, { strict: true }), actualizarPregunta);
router.post('/mover-tema', validarCuerpo(esquemaMoverPreguntasTemaBanco, { strict: true }), moverPreguntasTemaBanco);
router.post('/quitar-tema', validarCuerpo(esquemaQuitarTemaBanco, { strict: true }), quitarTemaBanco);
router.post('/:preguntaId/archivar', archivarPregunta);

export default router;
