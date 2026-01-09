/**
 * Rutas de sincronizacion a nube.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { generarCodigoAcceso, listarSincronizaciones, publicarResultados } from './controladorSincronizacion';
import { esquemaGenerarCodigoAcceso, esquemaPublicarResultados } from './validacionesSincronizacion';

const router = Router();

router.get('/', listarSincronizaciones);
router.post('/publicar', validarCuerpo(esquemaPublicarResultados), publicarResultados);
router.post('/codigo-acceso', validarCuerpo(esquemaGenerarCodigoAcceso), generarCodigoAcceso);

export default router;
