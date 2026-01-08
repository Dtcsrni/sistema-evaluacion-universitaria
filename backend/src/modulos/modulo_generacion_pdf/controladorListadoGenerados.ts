/**
 * Controlador para listado de examenes generados.
 */
import type { Request, Response } from 'express';
import { ExamenGenerado } from './modeloExamenGenerado';

export async function listarExamenesGenerados(req: Request, res: Response) {
  const filtro: Record<string, string> = {};
  if (req.query.docenteId) filtro.docenteId = String(req.query.docenteId);
  if (req.query.periodoId) filtro.periodoId = String(req.query.periodoId);
  if (req.query.alumnoId) filtro.alumnoId = String(req.query.alumnoId);

  const examenes = await ExamenGenerado.find(filtro).limit(200).lean();
  res.json({ examenes });
}
