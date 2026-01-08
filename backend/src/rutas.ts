/**
 * Registro central de rutas del API docente.
 */
import { Router } from 'express';
import rutasSalud from './compartido/salud/rutasSalud';
import rutasAutenticacion from './modulos/modulo_autenticacion/rutasAutenticacion';
import rutasAlumnos from './modulos/modulo_alumnos/rutasAlumnos';
import rutasPeriodos from './modulos/modulo_alumnos/rutasPeriodos';
import rutasBancoPreguntas from './modulos/modulo_banco_preguntas/rutasBancoPreguntas';
import rutasGeneracionPdf from './modulos/modulo_generacion_pdf/rutasGeneracionPdf';
import rutasVinculacionEntrega from './modulos/modulo_vinculacion_entrega/rutasVinculacionEntrega';
import rutasEscaneoOmr from './modulos/modulo_escaneo_omr/rutasEscaneoOmr';
import rutasCalificaciones from './modulos/modulo_calificacion/rutasCalificaciones';
import rutasAnaliticas from './modulos/modulo_analiticas/rutasAnaliticas';
import rutasSincronizacionNube from './modulos/modulo_sincronizacion_nube/rutasSincronizacionNube';

export function crearRouterApi() {
  const router = Router();

  router.use('/salud', rutasSalud);
  router.use('/autenticacion', rutasAutenticacion);
  router.use('/alumnos', rutasAlumnos);
  router.use('/periodos', rutasPeriodos);
  router.use('/banco-preguntas', rutasBancoPreguntas);
  router.use('/examenes', rutasGeneracionPdf);
  router.use('/entregas', rutasVinculacionEntrega);
  router.use('/omr', rutasEscaneoOmr);
  router.use('/calificaciones', rutasCalificaciones);
  router.use('/analiticas', rutasAnaliticas);
  router.use('/sincronizaciones', rutasSincronizacionNube);

  return router;
}
