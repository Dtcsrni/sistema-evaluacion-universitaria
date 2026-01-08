/**
 * Rutas de alumnos.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { crearAlumno, listarAlumnos } from './controladorAlumnos';
import { esquemaCrearAlumno } from './validacionesAlumnos';

const router = Router();

router.get('/', listarAlumnos);
router.post('/', validarCuerpo(esquemaCrearAlumno), crearAlumno);

export default router;
