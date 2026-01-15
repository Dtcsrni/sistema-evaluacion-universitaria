/**
 * Controlador de calificaciones.
 */
import type { Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { BancoPregunta } from '../modulo_banco_preguntas/modeloBancoPregunta';
import { ExamenGenerado } from '../modulo_generacion_pdf/modeloExamenGenerado';
import { ExamenPlantilla } from '../modulo_generacion_pdf/modeloExamenPlantilla';
import { Calificacion } from './modeloCalificacion';
import { calcularCalificacion } from './servicioCalificacion';

type RespuestaDetectada = {
  numeroPregunta: number;
  opcion: string | null;
};

function obtenerLetraCorrecta(opciones: Array<{ esCorrecta: boolean }>, orden: number[]) {
  const indiceCorrecto = opciones.findIndex((opcion) => opcion.esCorrecta);
  if (indiceCorrecto < 0) return null;
  // Se traduce el indice real al orden mostrado en el examen.
  const posicion = orden.findIndex((idx) => idx === indiceCorrecto);
  if (posicion < 0) return null;
  return String.fromCharCode(65 + posicion);
}

export async function calificarExamen(req: SolicitudDocente, res: Response) {
  const {
    examenGeneradoId,
    alumnoId,
    aciertos,
    totalReactivos,
    bonoSolicitado,
    evaluacionContinua,
    proyecto,
    retroalimentacion,
    respuestasDetectadas
  } = req.body;
  const docenteId = obtenerDocenteId(req);

  const examen = await ExamenGenerado.findById(examenGeneradoId).lean();
  if (!examen) {
    throw new ErrorAplicacion('EXAMEN_NO_ENCONTRADO', 'Examen no encontrado', 404);
  }
  if (String(examen.docenteId) !== String(docenteId)) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sin acceso a este examen', 403);
  }

  const plantilla = await ExamenPlantilla.findById(examen.plantillaId).lean();
  if (!plantilla) {
    throw new ErrorAplicacion('PLANTILLA_NO_ENCONTRADA', 'Plantilla no encontrada', 404);
  }

  const alumnoFinal = alumnoId ?? examen.alumnoId;
  if (!alumnoFinal) {
    throw new ErrorAplicacion('ALUMNO_NO_ENCONTRADO', 'Alumno no vinculado al examen', 400);
  }

  const ordenPreguntas: string[] = examen.mapaVariante?.ordenPreguntas ?? [];
  const preguntasDb = await BancoPregunta.find({ _id: { $in: ordenPreguntas } }).lean();
  const mapaPreguntas = new Map(preguntasDb.map((pregunta) => [String(pregunta._id), pregunta]));

  const respuestas = Array.isArray(respuestasDetectadas) ? (respuestasDetectadas as RespuestaDetectada[]) : [];
  const respuestasPorNumero = new Map(
    respuestas.map((item) => [item.numeroPregunta, item.opcion ? item.opcion.toUpperCase() : null])
  );

  let aciertosCalculados = 0;
  const total = ordenPreguntas.length || totalReactivos || 0;

  ordenPreguntas.forEach((idPregunta, idx) => {
    const pregunta = mapaPreguntas.get(idPregunta);
    if (!pregunta) return;

    const version = pregunta.versiones.find((item) => item.numeroVersion === pregunta.versionActual) ?? pregunta.versiones[0];
    const ordenOpciones = examen.mapaVariante?.ordenOpcionesPorPregunta?.[idPregunta] ?? [0, 1, 2, 3, 4];
    const letraCorrecta = obtenerLetraCorrecta(version.opciones, ordenOpciones);
    const respuesta = respuestasPorNumero.get(idx + 1);

    if (letraCorrecta && respuesta && letraCorrecta === respuesta.toUpperCase()) {
      aciertosCalculados += 1;
    }
  });

  const aciertosFinal = typeof aciertos === 'number' ? aciertos : aciertosCalculados;
  const totalFinal = total || totalReactivos || aciertosFinal || 1;
  const aciertosAjustados = Math.min(aciertosFinal, totalFinal);

  const resultado = calcularCalificacion(
    aciertosAjustados,
    totalFinal,
    bonoSolicitado ?? 0,
    evaluacionContinua ?? 0,
    proyecto ?? 0,
    plantilla.tipo as 'parcial' | 'global'
  );

  const calificacion = await Calificacion.create({
    docenteId,
    periodoId: examen.periodoId,
    examenGeneradoId,
    alumnoId: alumnoFinal,
    tipoExamen: plantilla.tipo,
    totalReactivos: totalFinal,
    aciertos: aciertosAjustados,
    fraccion: {
      numerador: resultado.numerador,
      denominador: resultado.denominador
    },
    calificacionExamenTexto: resultado.calificacionTexto,
    bonoTexto: resultado.bonoTexto,
    calificacionExamenFinalTexto: resultado.calificacionFinalTexto,
    evaluacionContinuaTexto: resultado.evaluacionContinuaTexto,
    proyectoTexto: resultado.proyectoTexto,
    calificacionParcialTexto: resultado.calificacionParcialTexto,
    calificacionGlobalTexto: resultado.calificacionGlobalTexto,
    retroalimentacion,
    respuestasDetectadas
  });

  await ExamenGenerado.updateOne({ _id: examenGeneradoId }, { estado: 'calificado' });

  res.status(201).json({ calificacion });
}
