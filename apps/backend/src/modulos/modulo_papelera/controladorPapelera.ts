/**
 * Controlador de papelera (borrado suave).
 */
import type { Response } from 'express';
import type { Model } from 'mongoose';
import { configuracion } from '../../configuracion';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { Alumno } from '../modulo_alumnos/modeloAlumno';
import { Periodo } from '../modulo_alumnos/modeloPeriodo';
import { BancoPregunta } from '../modulo_banco_preguntas/modeloBancoPregunta';
import { TemaBanco } from '../modulo_banco_preguntas/modeloTemaBanco';
import { BanderaRevision } from '../modulo_analiticas/modeloBanderaRevision';
import { Calificacion } from '../modulo_calificacion/modeloCalificacion';
import { CodigoAcceso } from '../modulo_sincronizacion_nube/modeloCodigoAcceso';
import { Entrega } from '../modulo_vinculacion_entrega/modeloEntrega';
import { ExamenGenerado } from '../modulo_generacion_pdf/modeloExamenGenerado';
import { ExamenPlantilla } from '../modulo_generacion_pdf/modeloExamenPlantilla';
import { Papelera } from './modeloPapelera';

function validarAdminDev() {
  if (String(configuracion.entorno).toLowerCase() !== 'development') {
    throw new ErrorAplicacion('SOLO_DEV', 'Accion disponible solo en modo desarrollo', 403);
  }
}

async function restaurarDocs<T extends Record<string, unknown>>(Model: Model<T>, docs: T[]) {
  for (const doc of docs) {
    const id = (doc as { _id?: unknown })._id;
    if (!id) continue;
    type Args = Parameters<Model<T>['findOneAndUpdate']>;
    const filtro = ({ _id: id } as unknown) as Args[0];
    const update = doc as Args[1];
    const opciones = { upsert: true, overwrite: true, setDefaultsOnInsert: true } as Args[2];
    await Model.findOneAndUpdate(filtro, update, opciones);
  }
}

export async function listarPapelera(req: SolicitudDocente, res: Response) {
  validarAdminDev();
  const docenteId = obtenerDocenteId(req);
  const limite = Number(req.query.limite ?? 50);
  const items = await Papelera.find({ docenteId })
    .sort({ eliminadoEn: -1 })
    .limit(limite > 0 ? limite : 50)
    .lean();
  res.json({ items });
}

export async function restaurarPapelera(req: SolicitudDocente, res: Response) {
  validarAdminDev();
  const docenteId = obtenerDocenteId(req);
  const id = String(req.params.id ?? '').trim();

  const item = await Papelera.findOne({ _id: id, docenteId }).lean();
  if (!item) {
    throw new ErrorAplicacion('PAPELERA_NO_ENCONTRADA', 'Elemento no encontrado en papelera', 404);
  }

  const tipo = String((item as { tipo?: unknown }).tipo ?? '');
  const payload = (item as { payload?: Record<string, unknown> }).payload ?? {};

  if (tipo === 'plantilla') {
    await restaurarDocs(ExamenPlantilla, [payload.plantilla as Record<string, unknown>].filter(Boolean));
    await restaurarDocs(ExamenGenerado, (payload.examenes as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(Entrega, (payload.entregas as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(Calificacion, (payload.calificaciones as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(BanderaRevision, (payload.banderas as Array<Record<string, unknown>>) ?? []);
  } else if (tipo === 'alumno') {
    await restaurarDocs(Alumno, [payload.alumno as Record<string, unknown>].filter(Boolean));
    await restaurarDocs(ExamenGenerado, (payload.examenes as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(Entrega, (payload.entregas as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(Calificacion, (payload.calificaciones as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(BanderaRevision, (payload.banderas as Array<Record<string, unknown>>) ?? []);
  } else if (tipo === 'periodo') {
    await restaurarDocs(Periodo, [payload.periodo as Record<string, unknown>].filter(Boolean));
    await restaurarDocs(Alumno, (payload.alumnos as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(BancoPregunta, (payload.bancoPreguntas as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(TemaBanco, (payload.temas as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(ExamenPlantilla, (payload.plantillas as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(ExamenGenerado, (payload.examenes as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(Entrega, (payload.entregas as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(Calificacion, (payload.calificaciones as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(BanderaRevision, (payload.banderas as Array<Record<string, unknown>>) ?? []);
    await restaurarDocs(CodigoAcceso, (payload.codigosAcceso as Array<Record<string, unknown>>) ?? []);
  } else {
    throw new ErrorAplicacion('PAPELERA_TIPO', 'Tipo de papelera no soportado', 400);
  }

  await Papelera.deleteOne({ _id: id, docenteId });
  res.json({ ok: true });
}
