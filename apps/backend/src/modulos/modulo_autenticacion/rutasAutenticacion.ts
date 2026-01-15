/**
 * Rutas de autenticacion.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import {
	definirContrasenaDocente,
	ingresarDocente,
	ingresarDocenteGoogle,
	perfilDocente,
	refrescarDocente,
	registrarDocente,
	registrarDocenteGoogle,
	salirDocente
} from './controladorAutenticacion';
import { requerirDocente } from './middlewareAutenticacion';
import {
	esquemaBodyVacioOpcional,
	esquemaDefinirContrasenaDocente,
	esquemaIngresarDocente,
	esquemaIngresarDocenteGoogle,
	esquemaRegistrarDocente,
	esquemaRegistrarDocenteGoogle
} from './validacionesAutenticacion';

const router = Router();

router.post('/registrar', validarCuerpo(esquemaRegistrarDocente, { strict: true }), registrarDocente);
router.post('/registrar-google', validarCuerpo(esquemaRegistrarDocenteGoogle, { strict: true }), registrarDocenteGoogle);
router.post('/ingresar', validarCuerpo(esquemaIngresarDocente, { strict: true }), ingresarDocente);
router.post('/google', validarCuerpo(esquemaIngresarDocenteGoogle, { strict: true }), ingresarDocenteGoogle);
router.post('/refrescar', validarCuerpo(esquemaBodyVacioOpcional, { strict: true }), refrescarDocente);
router.post('/salir', validarCuerpo(esquemaBodyVacioOpcional, { strict: true }), salirDocente);
router.post(
	'/definir-contrasena',
	requerirDocente,
	validarCuerpo(esquemaDefinirContrasenaDocente, { strict: true }),
	definirContrasenaDocente
);
router.get('/perfil', requerirDocente, perfilDocente);

export default router;
