/**
 * Controlador de analiticas y banderas.
 */
import type { Request, Response } from 'express';
import { BanderaRevision } from './modeloBanderaRevision';
import { generarCsv } from './servicioExportacionCsv';

export async function listarBanderas(req: Request, res: Response) {
  const filtro: Record<string, string> = {};
  if (req.query.examenGeneradoId) filtro.examenGeneradoId = String(req.query.examenGeneradoId);
  if (req.query.alumnoId) filtro.alumnoId = String(req.query.alumnoId);

  const banderas = await BanderaRevision.find(filtro).limit(200).lean();
  res.json({ banderas });
}

export async function crearBandera(req: Request, res: Response) {
  const bandera = await BanderaRevision.create(req.body);
  res.status(201).json({ bandera });
}

export function exportarCsv(req: Request, res: Response) {
  const { columnas, filas } = req.body;
  const csv = generarCsv(columnas, filas);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=\"exportacion.csv\"');
  res.send(csv);
}
