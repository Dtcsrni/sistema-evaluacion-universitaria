/**
 * Controlador de periodos.
 */
import type { Response } from 'express';
import { obtenerDocenteId } from '../modulo_autenticacion/middlewareAutenticacion';
import type { SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { Periodo } from './modeloPeriodo';

export async function listarPeriodos(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const filtro: Record<string, string> = { docenteId };

  const limite = Number(req.query.limite ?? 0);
  const consulta = Periodo.find(filtro);
  const periodos = await (limite > 0 ? consulta.limit(limite) : consulta).lean();
  res.json({ periodos });
}

export async function crearPeriodo(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const periodo = await Periodo.create({
    ...req.body,
    docenteId,
    fechaInicio: new Date(req.body.fechaInicio),
    fechaFin: new Date(req.body.fechaFin)
  });
  res.status(201).json({ periodo });
}
