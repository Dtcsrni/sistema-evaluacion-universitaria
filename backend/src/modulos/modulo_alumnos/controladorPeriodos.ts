/**
 * Controlador de periodos.
 */
import type { Request, Response } from 'express';
import { Periodo } from './modeloPeriodo';

export async function listarPeriodos(req: Request, res: Response) {
  const filtro: Record<string, string> = {};
  if (req.query.docenteId) filtro.docenteId = String(req.query.docenteId);

  const periodos = await Periodo.find(filtro).limit(100).lean();
  res.json({ periodos });
}

export async function crearPeriodo(req: Request, res: Response) {
  const periodo = await Periodo.create({
    ...req.body,
    fechaInicio: new Date(req.body.fechaInicio),
    fechaFin: new Date(req.body.fechaFin)
  });
  res.status(201).json({ periodo });
}
