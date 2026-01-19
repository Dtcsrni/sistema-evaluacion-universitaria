/**
 * Rutas de generacion de examenes (plantillas y PDF).
 */
import { Router } from 'express';
import { validarCuerpo } from '../../compartido/validaciones/validar';
import {
  actualizarPlantilla,
  archivarPlantilla,
  crearPlantilla,
  generarExamen,
  generarExamenesLote,
  listarPlantillas,
  previsualizarPlantilla,
  previsualizarPlantillaPdf
} from './controladorGeneracionPdf';
import {
  esquemaActualizarPlantilla,
  esquemaCrearPlantilla,
  esquemaGenerarExamen,
  esquemaGenerarExamenesLote,
  esquemaRegenerarExamenGenerado
} from './validacionesExamenes';
import {
  archivarExamenGenerado,
  descargarPdf,
  listarExamenesGenerados,
  obtenerExamenPorFolio,
  regenerarPdfExamen
} from './controladorListadoGenerados';

const router = Router();

router.get('/plantillas', listarPlantillas);
router.post('/plantillas', validarCuerpo(esquemaCrearPlantilla, { strict: true }), crearPlantilla);
router.post('/plantillas/:id', validarCuerpo(esquemaActualizarPlantilla, { strict: true }), actualizarPlantilla);
router.post('/plantillas/:id/archivar', archivarPlantilla);
router.get('/plantillas/:id/previsualizar', previsualizarPlantilla);
router.get('/plantillas/:id/previsualizar/pdf', previsualizarPlantillaPdf);
router.get('/generados', listarExamenesGenerados);
router.get('/generados/folio/:folio', obtenerExamenPorFolio);
router.get('/generados/:id/pdf', descargarPdf);
router.post('/generados/:id/regenerar', validarCuerpo(esquemaRegenerarExamenGenerado, { strict: true }), regenerarPdfExamen);
router.post('/generados/:id/archivar', archivarExamenGenerado);
router.post('/generados', validarCuerpo(esquemaGenerarExamen, { strict: true }), generarExamen);
router.post('/generados/lote', validarCuerpo(esquemaGenerarExamenesLote, { strict: true }), generarExamenesLote);

export default router;
