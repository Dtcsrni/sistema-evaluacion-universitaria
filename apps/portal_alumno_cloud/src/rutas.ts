/**
 * Rutas del portal alumno (solo lectura + sync).
 */
import { Router } from 'express';
import { gunzipSync } from 'zlib';
import { configuracion } from './configuracion';
import { CodigoAcceso } from './modelos/modeloCodigoAcceso';
import { ResultadoAlumno } from './modelos/modeloResultadoAlumno';
import { SesionAlumno } from './modelos/modeloSesionAlumno';
import { generarTokenSesion } from './servicios/servicioSesion';
import { requerirSesionAlumno } from './servicios/middlewareSesion';

const router = Router();

router.get('/salud', (_req, res) => {
  res.json({ estado: 'ok', tiempoActivo: process.uptime() });
});

router.post('/sincronizar', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!configuracion.portalApiKey || apiKey !== configuracion.portalApiKey) {
    res.status(401).json({ error: { codigo: 'NO_AUTORIZADO', mensaje: 'API key invalida' } });
    return;
  }

  const { periodo, alumnos, calificaciones, examenes, banderas, codigoAcceso } = req.body ?? {};

  if (!periodo || !Array.isArray(alumnos) || !Array.isArray(calificaciones)) {
    res.status(400).json({ error: { codigo: 'PAYLOAD_INVALIDO', mensaje: 'Payload incompleto' } });
    return;
  }

  if (codigoAcceso?.codigo) {
    await CodigoAcceso.updateOne(
      { codigo: codigoAcceso.codigo },
      { codigo: codigoAcceso.codigo, periodoId: periodo._id, expiraEn: new Date(codigoAcceso.expiraEn), usado: false },
      { upsert: true }
    );
  }

  const alumnosMap = new Map(alumnos.map((alumno: any) => [String(alumno._id), alumno]));
  const examenesMap = new Map((examenes || []).map((examen: any) => [String(examen.examenGeneradoId), examen]));
  const banderasMap = new Map<string, any[]>();
  (banderas || []).forEach((bandera: any) => {
    const clave = String(bandera.examenGeneradoId);
    const lista = banderasMap.get(clave) ?? [];
    lista.push(bandera);
    banderasMap.set(clave, lista);
  });

  for (const calificacion of calificaciones) {
    const alumno = alumnosMap.get(String(calificacion.alumnoId));
    if (!alumno) continue;

    const examen = examenesMap.get(String(calificacion.examenGeneradoId));
    const banderasExamen = banderasMap.get(String(calificacion.examenGeneradoId)) ?? [];

    await ResultadoAlumno.updateOne(
      { folio: examen?.folio ?? calificacion.examenGeneradoId },
      {
        periodoId: periodo._id,
        docenteId: calificacion.docenteId,
        alumnoId: calificacion.alumnoId,
        matricula: alumno.matricula,
        nombreCompleto: alumno.nombreCompleto,
        grupo: alumno.grupo,
        folio: examen?.folio ?? String(calificacion.examenGeneradoId),
        tipoExamen: calificacion.tipoExamen,
        calificacionExamenFinalTexto: calificacion.calificacionExamenFinalTexto,
        calificacionParcialTexto: calificacion.calificacionParcialTexto,
        calificacionGlobalTexto: calificacion.calificacionGlobalTexto,
        evaluacionContinuaTexto: calificacion.evaluacionContinuaTexto,
        proyectoTexto: calificacion.proyectoTexto,
        banderas: banderasExamen,
        pdfComprimidoBase64: examen?.pdfComprimidoBase64
      },
      { upsert: true }
    );
  }

  res.json({ mensaje: 'Sincronizacion aplicada' });
});

router.post('/ingresar', async (req, res) => {
  const { codigo, matricula } = req.body ?? {};
  if (!codigo || !matricula) {
    res.status(400).json({ error: { codigo: 'DATOS_INVALIDOS', mensaje: 'Codigo y matricula requeridos' } });
    return;
  }

  const registro = await CodigoAcceso.findOne({ codigo: String(codigo).toUpperCase(), usado: false });
  if (!registro || registro.expiraEn < new Date()) {
    res.status(401).json({ error: { codigo: 'CODIGO_INVALIDO', mensaje: 'Codigo invalido o expirado' } });
    return;
  }

  const resultado = await ResultadoAlumno.findOne({ periodoId: registro.periodoId, matricula }).lean();
  if (!resultado) {
    res.status(404).json({ error: { codigo: 'ALUMNO_NO_ENCONTRADO', mensaje: 'No hay resultados para la matricula' } });
    return;
  }

  registro.usado = true;
  await registro.save();

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

router.get('/resultados', requerirSesionAlumno, async (req, res) => {
  const resultados = await ResultadoAlumno.find({ periodoId: req.periodoId, alumnoId: req.alumnoId }).lean();
  res.json({ resultados });
});

router.get('/resultados/:folio', requerirSesionAlumno, async (req, res) => {
  const resultado = await ResultadoAlumno.findOne({ folio: req.params.folio, periodoId: req.periodoId, alumnoId: req.alumnoId }).lean();
  if (!resultado) {
    res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Resultado no encontrado' } });
    return;
  }
  res.json({ resultado });
});

router.get('/examen/:folio', requerirSesionAlumno, async (req, res) => {
  const resultado = await ResultadoAlumno.findOne({ folio: req.params.folio, periodoId: req.periodoId, alumnoId: req.alumnoId }).lean();
  if (!resultado || !resultado.pdfComprimidoBase64) {
    res.status(404).json({ error: { codigo: 'PDF_NO_DISPONIBLE', mensaje: 'PDF no disponible' } });
    return;
  }

  try {
    const buffer = gunzipSync(Buffer.from(resultado.pdfComprimidoBase64, 'base64'));
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: { codigo: 'PDF_INVALIDO', mensaje: 'No se pudo abrir el PDF' } });
  }
});

router.post('/limpiar', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!configuracion.portalApiKey || apiKey !== configuracion.portalApiKey) {
    res.status(401).json({ error: { codigo: 'NO_AUTORIZADO', mensaje: 'API key invalida' } });
    return;
  }

  const { dias } = req.body ?? {};
  const diasRetencion = Number(dias ?? 60);
  const limite = new Date(Date.now() - diasRetencion * 24 * 60 * 60 * 1000);
  await ResultadoAlumno.deleteMany({ publicadoEn: { $lt: limite } });
  res.json({ mensaje: 'Datos purgados' });
});

export default router;
