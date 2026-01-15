/**
 * Controlador de analiticas y banderas.
 */
import type { Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { BanderaRevision } from './modeloBanderaRevision';
import { EventoUso } from './modeloEventoUso';
import { generarCsv } from './servicioExportacionCsv';
import { Calificacion } from '../modulo_calificacion/modeloCalificacion';
import { Alumno } from '../modulo_alumnos/modeloAlumno';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';

export async function registrarEventosUso(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const eventos = (req.body?.eventos ?? []) as Array<{
    sessionId?: unknown;
    pantalla?: unknown;
    accion?: unknown;
    exito?: unknown;
    duracionMs?: unknown;
    meta?: unknown;
  }>;

  const docs = eventos.map((evento) => ({
    docenteId,
    sessionId: typeof evento.sessionId === 'string' ? evento.sessionId : undefined,
    pantalla: typeof evento.pantalla === 'string' ? evento.pantalla : undefined,
    accion: String(evento.accion || ''),
    exito: typeof evento.exito === 'boolean' ? evento.exito : undefined,
    duracionMs: typeof evento.duracionMs === 'number' ? evento.duracionMs : undefined,
    meta: evento.meta
  }));

  try {
    await EventoUso.insertMany(docs, { ordered: false });
    res.status(201).json({ ok: true, recibidos: docs.length });
  } catch {
    // Best-effort: la telemetria no debe romper la UX.
    res.status(201).json({ ok: true, recibidos: docs.length, advertencia: 'Algunos eventos no se pudieron guardar' });
  }
}

export async function listarBanderas(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const filtro: Record<string, string> = {};
  if (req.query.examenGeneradoId) filtro.examenGeneradoId = String(req.query.examenGeneradoId);
  if (req.query.alumnoId) filtro.alumnoId = String(req.query.alumnoId);
  filtro.docenteId = docenteId;

  const limite = Number(req.query.limite ?? 0);
  const consulta = BanderaRevision.find(filtro);
  const banderas = await (limite > 0 ? consulta.limit(limite) : consulta).lean();
  res.json({ banderas });
}

export async function crearBandera(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const bandera = await BanderaRevision.create({ ...req.body, docenteId });
  res.status(201).json({ bandera });
}

export function exportarCsv(req: SolicitudDocente, res: Response) {
  obtenerDocenteId(req);
  const { columnas, filas } = req.body;
  const csv = generarCsv(columnas, filas);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="exportacion.csv"');
  res.send(csv);
}

export async function exportarCsvCalificaciones(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const periodoId = String(req.query.periodoId || '').trim();
  if (!periodoId) {
    throw new ErrorAplicacion('DATOS_INVALIDOS', 'periodoId requerido', 400);
  }

  const alumnos = await Alumno.find({ docenteId, periodoId }).lean();
  const calificaciones = await Calificacion.find({ docenteId, periodoId }).lean();
  const banderas = await BanderaRevision.find({ docenteId }).lean();

  const columnas = ['matricula', 'nombre', 'grupo', 'parcial1', 'parcial2', 'global', 'final', 'banderas'];
  const banderasPorAlumno = new Map<string, string[]>();
  banderas.forEach((bandera) => {
    const alumnoId = String(bandera.alumnoId);
    const lista = banderasPorAlumno.get(alumnoId) ?? [];
    lista.push(bandera.tipo);
    banderasPorAlumno.set(alumnoId, lista);
  });

  const filas = alumnos.map((alumno) => {
    const calificacion = calificaciones.find((item) => String(item.alumnoId) === String(alumno._id));
    const parcial = calificacion?.calificacionParcialTexto ?? '';
    const global = calificacion?.calificacionGlobalTexto ?? '';
    const final = global || parcial || calificacion?.calificacionExamenFinalTexto || '';
    return {
      matricula: alumno.matricula,
      nombre: alumno.nombreCompleto,
      grupo: alumno.grupo ?? '',
      parcial1: calificacion?.tipoExamen === 'parcial' ? parcial : '',
      parcial2: '',
      global: calificacion?.tipoExamen === 'global' ? global : '',
      final,
      banderas: (banderasPorAlumno.get(String(alumno._id)) ?? []).join(';')
    };
  });

  const csv = generarCsv(columnas, filas);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="calificaciones.csv"');
  res.send(csv);
}
