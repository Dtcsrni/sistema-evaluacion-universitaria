/**
 * Rutas de generacion de examenes (plantillas y PDF).
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import {
  crearPlantilla,
  generarExamen,
  listarPlantillas
} from './controladorGeneracionPdf';
import { esquemaCrearPlantilla, esquemaGenerarExamen } from './validacionesExamenes';
import { listarExamenesGenerados } from './controladorListadoGenerados';

const router = Router();

router.get('/plantillas', listarPlantillas);
router.post('/plantillas', validarCuerpo(esquemaCrearPlantilla), crearPlantilla);
router.get('/generados', listarExamenesGenerados);
router.post('/generados', validarCuerpo(esquemaGenerarExamen), generarExamen);

export default router;
