/**
 * Controlador de escaneo OMR.
 */
import type { Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { ExamenGenerado } from '../modulo_generacion_pdf/modeloExamenGenerado';
import { analizarOmr } from './servicioOmr';

export async function analizarImagen(req: SolicitudDocente, res: Response) {
  const { folio, numeroPagina, imagenBase64 } = req.body;
  const folioNormalizado = String(folio || '').toUpperCase();
  const docenteId = obtenerDocenteId(req);

  const examen = await ExamenGenerado.findOne({ folio: folioNormalizado, docenteId }).lean();
  if (!examen) {
    throw new ErrorAplicacion('EXAMEN_NO_ENCONTRADO', 'Examen no encontrado', 404);
  }

  const pagina = Number(numeroPagina || 1);
  const mapaOmr = examen.mapaOmr?.paginas?.find((item) => item.numeroPagina === pagina);
  if (!mapaOmr) {
    throw new ErrorAplicacion('PAGINA_NO_VALIDA', 'No hay mapa OMR para la pagina', 400);
  }

  const qrEsperado = `EXAMEN:${examen.folio}:P${pagina}`;
  const margenMm = examen.mapaOmr?.margenMm ?? 10;
  const resultado = await analizarOmr(imagenBase64 ?? '', mapaOmr, qrEsperado, margenMm);
  res.json({ resultado, examenId: examen._id });
}
