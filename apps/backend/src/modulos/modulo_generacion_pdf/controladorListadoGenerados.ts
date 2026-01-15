/**
 * Controlador para listado de examenes generados.
 */
import type { Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { ExamenGenerado } from './modeloExamenGenerado';
import { promises as fs } from 'fs';

export async function listarExamenesGenerados(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const filtro: Record<string, string> = { docenteId };
  if (req.query.periodoId) filtro.periodoId = String(req.query.periodoId).trim();
  if (req.query.alumnoId) filtro.alumnoId = String(req.query.alumnoId).trim();
  if (req.query.folio) filtro.folio = String(req.query.folio).trim().toUpperCase();

  const limite = Number(req.query.limite ?? 0);
  const consulta = ExamenGenerado.find(filtro);
  const examenes = await (limite > 0 ? consulta.limit(limite) : consulta).lean();
  res.json({ examenes });
}

export async function obtenerExamenPorFolio(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const folio = String(req.params.folio || '').trim().toUpperCase();
  const examen = await ExamenGenerado.findOne({ folio, docenteId }).lean();
  if (!examen) {
    throw new ErrorAplicacion('EXAMEN_NO_ENCONTRADO', 'Examen no encontrado', 404);
  }
  res.json({ examen });
}

export async function descargarPdf(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const examenId = String(req.params.id || '');
  const examen = await ExamenGenerado.findOne({ _id: examenId, docenteId }).lean();
  if (!examen || !examen.rutaPdf) {
    throw new ErrorAplicacion('PDF_NO_DISPONIBLE', 'PDF no disponible', 404);
  }

  try {
    const buffer = await fs.readFile(examen.rutaPdf);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch {
    throw new ErrorAplicacion('PDF_INVALIDO', 'No se pudo leer el PDF', 500);
  }
}
