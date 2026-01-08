/**
 * Rutas de analiticas y banderas.
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import { crearBandera, exportarCsv, listarBanderas } from './controladorAnaliticas';
import { esquemaCrearBandera, esquemaExportarCsv } from './validacionesAnaliticas';

const router = Router();

router.get('/banderas', listarBanderas);
router.post('/banderas', validarCuerpo(esquemaCrearBandera), crearBandera);
router.post('/exportar-csv', validarCuerpo(esquemaExportarCsv), exportarCsv);

export default router;
