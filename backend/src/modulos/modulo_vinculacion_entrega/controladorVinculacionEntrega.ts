/**
 * Controlador de vinculacion al recibir examenes.
 */
import type { Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { ExamenGenerado } from '../modulo_generacion_pdf/modeloExamenGenerado';
import { Entrega } from './modeloEntrega';

export async function vincularEntrega(req: Request, res: Response) {
  const { examenGeneradoId, alumnoId, docenteId } = req.body;

  const examen = await ExamenGenerado.findById(examenGeneradoId);
  if (!examen) {
    throw new ErrorAplicacion('EXAMEN_NO_ENCONTRADO', 'Examen no encontrado', 404);
  }

  examen.alumnoId = alumnoId;
  examen.estado = 'entregado';
  await examen.save();

  const entrega = await Entrega.create({
    examenGeneradoId,
    alumnoId,
    docenteId,
    estado: 'entregado',
    fechaEntrega: new Date()
  });

  res.status(201).json({ entrega });
}
