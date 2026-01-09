/**
 * Rutas de vinculacion de entregas.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { vincularEntrega, vincularEntregaPorFolio } from './controladorVinculacionEntrega';
import { esquemaVincularEntrega, esquemaVincularEntregaPorFolio } from './validacionesVinculacion';

const router = Router();

router.post('/vincular', validarCuerpo(esquemaVincularEntrega), vincularEntrega);
router.post('/vincular-folio', validarCuerpo(esquemaVincularEntregaPorFolio), vincularEntregaPorFolio);

export default router;
