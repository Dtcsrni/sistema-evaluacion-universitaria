/**
 * Rutas de autenticacion.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { ingresarDocente, ingresarDocenteGoogle, perfilDocente, refrescarDocente, registrarDocente, salirDocente } from './controladorAutenticacion';
import { requerirDocente } from './middlewareAutenticacion';
import { esquemaBodyVacioOpcional, esquemaIngresarDocente, esquemaIngresarDocenteGoogle, esquemaRegistrarDocente } from './validacionesAutenticacion';

const router = Router();

router.post('/registrar', validarCuerpo(esquemaRegistrarDocente, { strict: true }), registrarDocente);
router.post('/ingresar', validarCuerpo(esquemaIngresarDocente, { strict: true }), ingresarDocente);
router.post('/google', validarCuerpo(esquemaIngresarDocenteGoogle, { strict: true }), ingresarDocenteGoogle);
router.post('/refrescar', validarCuerpo(esquemaBodyVacioOpcional, { strict: true }), refrescarDocente);
router.post('/salir', validarCuerpo(esquemaBodyVacioOpcional, { strict: true }), salirDocente);
router.get('/perfil', requerirDocente, perfilDocente);

export default router;
