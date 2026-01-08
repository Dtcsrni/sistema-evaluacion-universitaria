/**
 * Controlador de sincronizacion con la nube.
 */
import type { Request, Response } from 'express';
import { Sincronizacion } from './modeloSincronizacion';

export async function listarSincronizaciones(req: Request, res: Response) {
  const filtro: Record<string, string> = {};
  if (req.query.docenteId) filtro.docenteId = String(req.query.docenteId);

  const sincronizaciones = await Sincronizacion.find(filtro).limit(100).lean();
  res.json({ sincronizaciones });
}

export async function publicarResultados(_req: Request, res: Response) {
  res.status(501).json({ mensaje: 'Sincronizacion a cloud pendiente de implementar' });
}
