/**
 * Controlador de calificaciones.
 */
import type { Request, Response } from 'express';
import { Calificacion } from './modeloCalificacion';
import { calcularCalificacion } from './servicioCalificacion';

export async function calificarExamen(req: Request, res: Response) {
  const {
    docenteId,
    periodoId,
    examenGeneradoId,
    alumnoId,
    aciertos,
    totalReactivos,
    bonoSolicitado,
    retroalimentacion,
    respuestasDetectadas
  } = req.body;

  const resultado = calcularCalificacion(aciertos, totalReactivos, bonoSolicitado ?? 0);

  const calificacion = await Calificacion.create({
    docenteId,
    periodoId,
    examenGeneradoId,
    alumnoId,
    totalReactivos,
    aciertos,
    fraccion: {
      numerador: resultado.numerador,
      denominador: resultado.denominador
    },
    calificacionExamenTexto: resultado.calificacionTexto,
    bonoTexto: resultado.bonoTexto,
    calificacionExamenFinalTexto: resultado.calificacionFinalTexto,
    retroalimentacion,
    respuestasDetectadas
  });

  res.status(201).json({ calificacion });
}
