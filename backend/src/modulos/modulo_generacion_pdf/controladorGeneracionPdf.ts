/**
 * Controlador para plantillas y examenes generados.
 */
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { BancoPregunta } from '../modulo_banco_preguntas/modeloBancoPregunta';
import { barajar } from '../../compartido/utilidades/aleatoriedad';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { guardarPdfExamen } from '../../infraestructura/archivos/almacenLocal';
import { ExamenGenerado } from './modeloExamenGenerado';
import { ExamenPlantilla } from './modeloExamenPlantilla';
import { generarPdfExamen } from './servicioGeneracionPdf';
import { generarVariante } from './servicioVariantes';

export async function listarPlantillas(req: Request, res: Response) {
  const filtro: Record<string, string> = {};
  if (req.query.docenteId) filtro.docenteId = String(req.query.docenteId);
  if (req.query.periodoId) filtro.periodoId = String(req.query.periodoId);

  const plantillas = await ExamenPlantilla.find(filtro).limit(100).lean();
  res.json({ plantillas });
}

export async function crearPlantilla(req: Request, res: Response) {
  const plantilla = await ExamenPlantilla.create(req.body);
  res.status(201).json({ plantilla });
}

export async function generarExamen(req: Request, res: Response) {
  const { plantillaId, docenteId, alumnoId } = req.body;
  const plantilla = await ExamenPlantilla.findById(plantillaId).lean();

  if (!plantilla) {
    throw new ErrorAplicacion('PLANTILLA_NO_ENCONTRADA', 'Plantilla no encontrada', 404);
  }

  const preguntasIds = plantilla.preguntasIds ?? [];
  const preguntasDb = await BancoPregunta.find({ _id: { $in: preguntasIds } }).lean();

  if (preguntasDb.length === 0) {
    throw new ErrorAplicacion('SIN_PREGUNTAS', 'La plantilla no tiene preguntas asociadas', 400);
  }

  const preguntasBase = preguntasDb.map((pregunta) => {
    const version = pregunta.versiones.find((item: any) => item.numeroVersion === pregunta.versionActual) ?? pregunta.versiones[0];
    return {
      id: String(pregunta._id),
      enunciado: version.enunciado,
      imagenUrl: version.imagenUrl,
      opciones: version.opciones
    };
  });

  const preguntasSeleccionadas = barajar(preguntasBase).slice(0, plantilla.totalReactivos);
  const mapaVariante = generarVariante(preguntasSeleccionadas);
  const folio = randomUUID().split('-')[0].toUpperCase();

  const { pdfBytes, paginas } = await generarPdfExamen({
    titulo: plantilla.titulo,
    folio,
    preguntas: preguntasSeleccionadas,
    mapaVariante,
    tipoExamen: plantilla.tipo as 'parcial' | 'global',
    margenMm: plantilla.configuracionPdf?.margenMm ?? 10
  });

  const nombreArchivo = `examen_${folio}.pdf`;
  const rutaPdf = await guardarPdfExamen(nombreArchivo, pdfBytes);

  const examenGenerado = await ExamenGenerado.create({
    docenteId,
    periodoId: plantilla.periodoId,
    plantillaId: plantilla._id,
    alumnoId,
    folio,
    estado: 'generado',
    mapaVariante,
    paginas,
    rutaPdf
  });

  res.status(201).json({ examenGenerado });
}
