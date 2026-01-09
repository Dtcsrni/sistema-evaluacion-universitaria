/**
 * Controlador de vinculacion al recibir examenes.
 */
import type { Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { ExamenGenerado } from '../modulo_generacion_pdf/modeloExamenGenerado';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { Entrega } from './modeloEntrega';

export async function vincularEntrega(req: SolicitudDocente, res: Response) {
  const { examenGeneradoId, alumnoId } = req.body;
  const docenteId = obtenerDocenteId(req);

  const examen = await ExamenGenerado.findById(examenGeneradoId);
  if (!examen) {
    throw new ErrorAplicacion('EXAMEN_NO_ENCONTRADO', 'Examen no encontrado', 404);
  }
  if (String(examen.docenteId) !== String(docenteId)) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sin acceso a este examen', 403);
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

export async function vincularEntregaPorFolio(req: SolicitudDocente, res: Response) {
  const folio = String(req.body.folio || '').toUpperCase();
  const { alumnoId } = req.body;
  const docenteId = obtenerDocenteId(req);

  const examen = await ExamenGenerado.findOne({ folio, docenteId });
  if (!examen) {
    throw new ErrorAplicacion('EXAMEN_NO_ENCONTRADO', 'Examen no encontrado', 404);
  }

  examen.alumnoId = alumnoId;
  examen.estado = 'entregado';
  await examen.save();

  const entrega = await Entrega.create({
    examenGeneradoId: examen._id,
    alumnoId,
    docenteId,
    estado: 'entregado',
    fechaEntrega: new Date()
  });

  res.status(201).json({ entrega });
}
