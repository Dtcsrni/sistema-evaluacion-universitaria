/**
 * Controlador de sincronizacion con la nube.
 */
import type { Response } from 'express';
import { gzipSync } from 'zlib';
import { configuracion } from '../../configuracion';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { Alumno } from '../modulo_alumnos/modeloAlumno';
import { Periodo } from '../modulo_alumnos/modeloPeriodo';
import { Calificacion } from '../modulo_calificacion/modeloCalificacion';
import { ExamenGenerado } from '../modulo_generacion_pdf/modeloExamenGenerado';
import { BanderaRevision } from '../modulo_analiticas/modeloBanderaRevision';
import { CodigoAcceso } from './modeloCodigoAcceso';
import { Sincronizacion } from './modeloSincronizacion';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { enviarCorreo } from '../../infraestructura/correo/servicioCorreo';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';

function generarCodigoSimple() {
  return randomBytes(4).toString('hex').toUpperCase();
}

function comprimirBase64(buffer: Buffer) {
  return gzipSync(buffer).toString('base64');
}

export async function listarSincronizaciones(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const filtro: Record<string, string> = { docenteId };

  const limite = Number(req.query.limite ?? 0);
  const consulta = Sincronizacion.find(filtro);
  const sincronizaciones = await (limite > 0 ? consulta.limit(limite) : consulta).lean();
  res.json({ sincronizaciones });
}

export async function generarCodigoAcceso(req: SolicitudDocente, res: Response) {
  const { periodoId } = req.body;
  const docenteId = obtenerDocenteId(req);
  let codigo = generarCodigoSimple();
  let intentos = 0;
  while (intentos < 5) {
    const existe = await CodigoAcceso.findOne({ codigo }).lean();
    if (!existe) break;
    codigo = generarCodigoSimple();
    intentos += 1;
  }
  const expiraEn = new Date(Date.now() + configuracion.codigoAccesoHoras * 60 * 60 * 1000);

  const registro = await CodigoAcceso.create({
    docenteId,
    periodoId,
    codigo,
    expiraEn,
    usado: false
  });

  try {
    await enviarCorreo('destinatario@ejemplo.com', 'Codigo de acceso', `Tu codigo es ${codigo}`);
  } catch (error) {
    // Se permite continuar si el servicio de correo no esta configurado.
  }

  res.status(201).json({ codigo: registro.codigo, expiraEn: registro.expiraEn });
}

export async function publicarResultados(req: SolicitudDocente, res: Response) {
  const { periodoId } = req.body;
  const docenteId = obtenerDocenteId(req);

  if (!configuracion.portalAlumnoUrl || !configuracion.portalApiKey) {
    throw new ErrorAplicacion('PORTAL_NO_CONFIG', 'Portal alumno no configurado', 500);
  }

  const periodo = await Periodo.findOne({ _id: periodoId, docenteId }).lean();
  if (!periodo) {
    throw new ErrorAplicacion('PERIODO_NO_ENCONTRADO', 'Periodo no encontrado', 404);
  }

  const alumnos = await Alumno.find({ docenteId, periodoId }).lean();
  const calificaciones = await Calificacion.find({ docenteId, periodoId }).lean();
  const banderas = await BanderaRevision.find({ docenteId }).lean();
  const examenes = await ExamenGenerado.find({ docenteId, periodoId }).lean();
  const codigo = await CodigoAcceso.findOne({ docenteId, periodoId, usado: false }).lean();

  const examenesPayload = [] as Array<Record<string, unknown>>;
  for (const examen of examenes) {
    let pdfComprimidoBase64: string | undefined;
    if (examen.rutaPdf) {
      try {
        const contenido = await fs.readFile(examen.rutaPdf);
        pdfComprimidoBase64 = comprimirBase64(contenido);
      } catch (error) {
        // Continuar sin PDF si no se encuentra.
      }
    }

    examenesPayload.push({
      examenGeneradoId: examen._id,
      folio: examen.folio,
      alumnoId: examen.alumnoId,
      periodoId: examen.periodoId,
      pdfComprimidoBase64,
      paginas: examen.paginas
    });
  }

  const payload = {
    docenteId,
    periodo,
    alumnos,
    calificaciones,
    examenes: examenesPayload,
    banderas,
    codigoAcceso: codigo
      ? { codigo: codigo.codigo, expiraEn: codigo.expiraEn }
      : null
  };

  const respuesta = await fetch(`${configuracion.portalAlumnoUrl}/api/portal/sincronizar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': configuracion.portalApiKey
    },
    body: JSON.stringify(payload)
  });

  const estado = respuesta.ok ? 'exitoso' : 'fallido';
  await Sincronizacion.create({
    docenteId,
    estado,
    tipo: 'publicacion',
    detalles: { periodoId, status: respuesta.status },
    ejecutadoEn: new Date()
  });

  if (!respuesta.ok) {
    throw new ErrorAplicacion('PUBLICACION_FALLIDA', 'No se pudo publicar en la nube', 502);
  }

  res.json({ mensaje: 'Publicacion enviada' });
}
