/**
 * Rutas del portal alumno (solo lectura + sync).
 *
 * Superficies de acceso:
 * - Endpoints de sync/limpieza: protegidos con `x-api-key` (solo backend).
 * - Endpoints de alumno: protegidos con token de sesion (Bearer) emitido tras
 *   validar `codigo` + `matricula`.
 *
 * Nota:
 * - El portal es una vista derivada (read-model) de la informacion del backend.
 * - La telemetria se maneja best-effort (no debe interrumpir la UX).
 */
import { Router, type Request, type Response } from 'express';
import { gunzipSync } from 'zlib';
import { configuracion } from './configuracion';
import { CodigoAcceso } from './modelos/modeloCodigoAcceso';
import { EventoUsoAlumno } from './modelos/modeloEventoUsoAlumno';
import { ResultadoAlumno } from './modelos/modeloResultadoAlumno';
import { SesionAlumno } from './modelos/modeloSesionAlumno';
import { generarTokenSesion } from './servicios/servicioSesion';
import { requerirSesionAlumno, type SolicitudAlumno } from './servicios/middlewareSesion';

const router = Router();

function responderError(res: Response, status: number, codigo: string, mensaje: string) {
  res.status(status).json({ error: { codigo, mensaje } });
}

/**
 * Gate de autenticacion para operaciones internas (sync desde backend).
 *
 * Se usa header en lugar de cookies para simplificar despliegue cloud.
 */
function requerirApiKey(req: Request, res: Response): boolean {
  const apiKey = req.headers['x-api-key'];
  if (!configuracion.portalApiKey || apiKey !== configuracion.portalApiKey) {
    responderError(res, 401, 'NO_AUTORIZADO', 'API key invalida');
    return false;
  }
  return true;
}

function normalizarString(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : String(valor ?? '').trim();
}

/**
 * Normaliza el numero de dias de retencion para evitar valores peligrosos.
 *
 * Esto protege contra borrados accidentales por payload malicioso o typo.
 */
function parsearDiasRetencion(valor: unknown, porDefecto: number) {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  // Evita valores peligrosos (negativos o extremos) que podrían borrar demasiado.
  return Math.min(3650, Math.max(1, Math.floor(n)));
}

function tieneSoloClavesPermitidas(valor: unknown, clavesPermitidas: string[]): boolean {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const claves = Object.keys(valor as Record<string, unknown>);
  return claves.every((clave) => clavesPermitidas.includes(clave));
}

router.get('/salud', (_req, res) => {
  res.json({ estado: 'ok', tiempoActivo: process.uptime() });
});

router.post('/sincronizar', async (req, res) => {
  if (!requerirApiKey(req, res)) return;

  const clavesSyncPermitidas = ['docenteId', 'periodo', 'alumnos', 'calificaciones', 'examenes', 'banderas', 'codigoAcceso'];
  if (!tieneSoloClavesPermitidas(req.body ?? {}, clavesSyncPermitidas)) {
    responderError(res, 400, 'PAYLOAD_INVALIDO', 'Payload invalido');
    return;
  }

  const { periodo, alumnos, calificaciones, examenes, banderas, codigoAcceso } = req.body ?? {};

  if (!periodo || !Array.isArray(alumnos) || !Array.isArray(calificaciones)) {
    responderError(res, 400, 'PAYLOAD_INVALIDO', 'Payload incompleto');
    return;
  }

  if (codigoAcceso?.codigo) {
    const expira = new Date(codigoAcceso.expiraEn);
    if (!(expira instanceof Date) || Number.isNaN(expira.getTime())) {
      responderError(res, 400, 'PAYLOAD_INVALIDO', 'codigoAcceso.expiraEn invalido');
      return;
    }
    await CodigoAcceso.updateOne(
      { codigo: codigoAcceso.codigo },
      { codigo: codigoAcceso.codigo, periodoId: periodo._id, expiraEn: expira, usado: false },
      { upsert: true }
    );
  }

  type AlumnoSync = { _id?: unknown; matricula?: string; nombreCompleto?: string; grupo?: string };
  type ExamenSync = { examenGeneradoId?: unknown; folio?: string; pdfComprimidoBase64?: string };
  type BanderaSync = { examenGeneradoId?: unknown } & Record<string, unknown>;

  const alumnosMap = new Map<string, AlumnoSync>(
    (alumnos as AlumnoSync[]).map((alumno) => [String(alumno._id), alumno])
  );
  const examenesMap = new Map<string, ExamenSync>(
    ((examenes || []) as ExamenSync[]).map((examen) => [String(examen.examenGeneradoId), examen])
  );
  const banderasMap = new Map<string, BanderaSync[]>();
  ((banderas || []) as BanderaSync[]).forEach((bandera) => {
    const clave = String(bandera.examenGeneradoId);
    const lista = banderasMap.get(clave) ?? [];
    lista.push(bandera);
    banderasMap.set(clave, lista);
  });

  // Upsert por folio: el portal se mantiene idempotente frente a reintentos.
  for (const calificacion of calificaciones) {
    const alumno = alumnosMap.get(String(calificacion.alumnoId));
    if (!alumno) continue;

    const examen = examenesMap.get(String(calificacion.examenGeneradoId));
    const banderasExamen = banderasMap.get(String(calificacion.examenGeneradoId)) ?? [];

    const folioNormalizado =
      typeof examen?.folio === 'string' && examen.folio.trim() ? examen.folio.trim() : String(calificacion.examenGeneradoId);

    await ResultadoAlumno.updateOne(
      { folio: folioNormalizado },
      {
        periodoId: periodo._id,
        docenteId: calificacion.docenteId,
        alumnoId: calificacion.alumnoId,
        matricula: typeof alumno.matricula === 'string' ? alumno.matricula.trim() : undefined,
        nombreCompleto: typeof alumno.nombreCompleto === 'string' ? alumno.nombreCompleto.trim() : undefined,
        grupo: typeof alumno.grupo === 'string' ? alumno.grupo.trim() : undefined,
        folio: folioNormalizado,
        tipoExamen: calificacion.tipoExamen,
        calificacionExamenFinalTexto: calificacion.calificacionExamenFinalTexto,
        calificacionParcialTexto: calificacion.calificacionParcialTexto,
        calificacionGlobalTexto: calificacion.calificacionGlobalTexto,
        evaluacionContinuaTexto: calificacion.evaluacionContinuaTexto,
        proyectoTexto: calificacion.proyectoTexto,
        banderas: banderasExamen,
        pdfComprimidoBase64: typeof examen?.pdfComprimidoBase64 === 'string' ? examen.pdfComprimidoBase64 : undefined
      },
      { upsert: true }
    );
  }

  res.json({ mensaje: 'Sincronizacion aplicada' });
});

router.post('/ingresar', async (req, res) => {
  if (!tieneSoloClavesPermitidas(req.body ?? {}, ['codigo', 'matricula'])) {
    responderError(res, 400, 'DATOS_INVALIDOS', 'Payload invalido');
    return;
  }

  const { codigo, matricula } = req.body ?? {};
  if (!codigo || !matricula) {
    responderError(res, 400, 'DATOS_INVALIDOS', 'Codigo y matricula requeridos');
    return;
  }

  const codigoNormalizado = normalizarString(codigo).toUpperCase();
  const matriculaNormalizada = normalizarString(matricula);
  const registro = await CodigoAcceso.findOne({ codigo: codigoNormalizado, usado: false });
  if (!registro || registro.expiraEn < new Date()) {
    responderError(res, 401, 'CODIGO_INVALIDO', 'Codigo invalido o expirado');
    return;
  }

  const resultado = await ResultadoAlumno.findOne({ periodoId: registro.periodoId, matricula: matriculaNormalizada }).lean();
  if (!resultado) {
    responderError(res, 404, 'ALUMNO_NO_ENCONTRADO', 'No hay resultados para la matricula');
    return;
  }

  // Codigo de acceso de un solo uso.
  registro.usado = true;
  await registro.save();

  // Se devuelve el token al cliente, pero solo se guarda el hash en DB.
  const { token, hash } = generarTokenSesion();
  const expiraEn = new Date(Date.now() + configuracion.codigoAccesoHoras * 60 * 60 * 1000);
  await SesionAlumno.create({
    periodoId: resultado.periodoId,
    alumnoId: resultado.alumnoId,
    tokenHash: hash,
    expiraEn
  });

  res.json({ token, expiraEn, alumno: { nombreCompleto: resultado.nombreCompleto, matricula: resultado.matricula } });
});

router.post('/eventos-uso', requerirSesionAlumno, async (req: SolicitudAlumno, res) => {
  if (!tieneSoloClavesPermitidas(req.body ?? {}, ['eventos'])) {
    responderError(res, 400, 'DATOS_INVALIDOS', 'Payload invalido');
    return;
  }

  const eventos = Array.isArray(req.body?.eventos) ? req.body.eventos : [];
  if (!eventos.length) {
    responderError(res, 400, 'DATOS_INVALIDOS', 'eventos requerido');
    return;
  }

  const eventosLimitados = eventos.slice(0, 100);
  const clavesEventoPermitidas = ['sessionId', 'pantalla', 'accion', 'exito', 'duracionMs', 'meta'];
  for (const evento of eventosLimitados) {
    if (!tieneSoloClavesPermitidas(evento, clavesEventoPermitidas)) {
      responderError(res, 400, 'DATOS_INVALIDOS', 'Payload invalido');
      return;
    }
  }

  type EventoUsoSync = {
    sessionId?: unknown;
    pantalla?: unknown;
    accion?: unknown;
    exito?: unknown;
    duracionMs?: unknown;
    meta?: unknown;
  };

  const docs = (eventosLimitados as EventoUsoSync[])
    .map((evento) => {
      const accion = normalizarString(evento.accion);
      return {
        periodoId: req.periodoId,
        alumnoId: req.alumnoId,
        sessionId: typeof evento.sessionId === 'string' ? evento.sessionId : undefined,
        pantalla: typeof evento.pantalla === 'string' ? evento.pantalla : undefined,
        accion,
        exito: typeof evento.exito === 'boolean' ? evento.exito : undefined,
        duracionMs: typeof evento.duracionMs === 'number' ? evento.duracionMs : undefined,
        meta: evento.meta
      };
    })
    .filter((doc) => Boolean(doc.accion));

  if (!docs.length) {
    responderError(res, 400, 'DATOS_INVALIDOS', 'eventos sin accion');
    return;
  }

  try {
    await EventoUsoAlumno.insertMany(docs, { ordered: false });
    res.status(201).json({ ok: true, recibidos: docs.length });
  } catch {
    // Best-effort: telemetria nunca debe tumbar el portal.
    res.status(201).json({ ok: true, recibidos: docs.length, advertencia: 'Algunos eventos no se pudieron guardar' });
  }
});

router.get('/resultados', requerirSesionAlumno, async (req: SolicitudAlumno, res) => {
  const resultados = await ResultadoAlumno.find({ periodoId: req.periodoId, alumnoId: req.alumnoId }).lean();
  res.json({ resultados });
});

router.get('/resultados/:folio', requerirSesionAlumno, async (req: SolicitudAlumno, res) => {
  const resultado = await ResultadoAlumno.findOne({ folio: req.params.folio, periodoId: req.periodoId, alumnoId: req.alumnoId }).lean();
  if (!resultado) {
    responderError(res, 404, 'NO_ENCONTRADO', 'Resultado no encontrado');
    return;
  }
  res.json({ resultado });
});

router.get('/examen/:folio', requerirSesionAlumno, async (req: SolicitudAlumno, res) => {
  const resultado = await ResultadoAlumno.findOne({ folio: req.params.folio, periodoId: req.periodoId, alumnoId: req.alumnoId }).lean();
  if (!resultado || !resultado.pdfComprimidoBase64) {
    responderError(res, 404, 'PDF_NO_DISPONIBLE', 'PDF no disponible');
    return;
  }

  try {
    // El PDF se almacena comprimido para reducir costos de almacenamiento/egreso.
    const buffer = gunzipSync(Buffer.from(resultado.pdfComprimidoBase64, 'base64'));
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch {
    responderError(res, 500, 'PDF_INVALIDO', 'No se pudo abrir el PDF');
  }
});

router.post('/limpiar', async (req, res) => {
  if (!requerirApiKey(req, res)) return;

  if (!tieneSoloClavesPermitidas(req.body ?? {}, ['dias'])) {
    responderError(res, 400, 'PAYLOAD_INVALIDO', 'Payload invalido');
    return;
  }

  const { dias } = req.body ?? {};
  const diasRetencion = parsearDiasRetencion(dias, 60);
  const limite = new Date(Date.now() - diasRetencion * 24 * 60 * 60 * 1000);
  // Se purga por fecha de publicacion para no romper sincronizaciones recientes.
  await ResultadoAlumno.deleteMany({ publicadoEn: { $lt: limite } });
  res.json({ mensaje: 'Datos purgados', diasRetencion });
});

export default router;
