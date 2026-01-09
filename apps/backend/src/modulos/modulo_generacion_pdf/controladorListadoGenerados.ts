/**
 * Controlador para listado de examenes generados.
 */
import type { Response } from 'express';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { ExamenGenerado } from './modeloExamenGenerado';
import { promises as fs } from 'fs';

export async function listarExamenesGenerados(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const filtro: Record<string, string> = { docenteId };
  if (req.query.periodoId) filtro.periodoId = String(req.query.periodoId);
  if (req.query.alumnoId) filtro.alumnoId = String(req.query.alumnoId);
  if (req.query.folio) filtro.folio = String(req.query.folio).toUpperCase();

  const limite = Number(req.query.limite ?? 0);
  const consulta = ExamenGenerado.find(filtro);
  const examenes = await (limite > 0 ? consulta.limit(limite) : consulta).lean();
  res.json({ examenes });
}

export async function obtenerExamenPorFolio(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const folio = String(req.params.folio || '').toUpperCase();
  const examen = await ExamenGenerado.findOne({ folio, docenteId }).lean();
  if (!examen) {
    res.status(404).json({ mensaje: 'Examen no encontrado' });
    return;
  }
  res.json({ examen });
}

export async function descargarPdf(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const examenId = String(req.params.id || '');
  const examen = await ExamenGenerado.findOne({ _id: examenId, docenteId }).lean();
  if (!examen || !examen.rutaPdf) {
    res.status(404).json({ mensaje: 'PDF no disponible' });
    return;
  }

  try {
    const buffer = await fs.readFile(examen.rutaPdf);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ mensaje: 'No se pudo leer el PDF' });
  }
}
