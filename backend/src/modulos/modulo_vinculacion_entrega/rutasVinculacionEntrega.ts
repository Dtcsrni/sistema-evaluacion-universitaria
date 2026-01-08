/**
 * Rutas de vinculacion de entregas.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { vincularEntrega } from './controladorVinculacionEntrega';
import { esquemaVincularEntrega } from './validacionesVinculacion';

const router = Router();

router.post('/vincular', validarCuerpo(esquemaVincularEntrega), vincularEntrega);

export default router;
