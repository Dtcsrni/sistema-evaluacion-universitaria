/**
 * Controlador de escaneo OMR.
 *
 * Seguridad / multi-tenancy:
 * - La busqueda del examen se filtra por `docenteId`, evitando acceso cruzado entre docentes.
 * - Se valida que exista el mapa OMR para la pagina solicitada.
 */
import type { Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { obtenerDocenteId, type SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { ExamenGenerado } from '../modulo_generacion_pdf/modeloExamenGenerado';
import { analizarOmr, leerQrDesdeImagen } from './servicioOmr';

/**
 * Analiza una imagen escaneada (base64) contra el mapa OMR del examen.
 *
 * Entradas esperadas:
 * - `folio`: se normaliza a mayusculas.
 * - `numeroPagina`: 1-indexed.
 * - `imagenBase64`: contenido de la pagina.
 */
export async function analizarImagen(req: SolicitudDocente, res: Response) {
  const { folio, numeroPagina, imagenBase64 } = req.body;
  const docenteId = obtenerDocenteId(req);

  const textoQr = !folio || !numeroPagina ? await leerQrDesdeImagen(imagenBase64 ?? '') : undefined;
  const match = textoQr ? /EXAMEN:([A-Z0-9]+):P(\d+)/i.exec(textoQr) : null;
  const folioDetectado = match?.[1]?.toUpperCase() ?? '';
  const paginaDetectada = match?.[2] ? Number(match[2]) : undefined;

  const folioNormalizado = String(folio || folioDetectado || '').toUpperCase();
  const pagina = Number(numeroPagina || paginaDetectada || 1);

  const examen = await ExamenGenerado.findOne({ folio: folioNormalizado, docenteId }).lean();
  if (!examen) {
    throw new ErrorAplicacion('EXAMEN_NO_ENCONTRADO', 'Examen no encontrado', 404);
  }

  const mapaOmr = examen.mapaOmr?.paginas?.find((item: { numeroPagina: number }) => item.numeroPagina === pagina);
  if (!mapaOmr) {
    throw new ErrorAplicacion('PAGINA_NO_VALIDA', 'No hay mapa OMR para la pagina', 400);
  }

  const qrEsperado = [`EXAMEN:${String(examen.folio ?? '')}:P${pagina}`];
  const margenMm = examen.mapaOmr?.margenMm ?? 10;
  const resultado = await analizarOmr(imagenBase64 ?? '', mapaOmr, qrEsperado, margenMm);
  await guardarImagenReferencia({
    base64: imagenBase64 ?? '',
    folio: folioNormalizado,
    numeroPagina: pagina
  });
  res.json({
    resultado,
    examenId: examen._id,
    folio: folioNormalizado,
    numeroPagina: pagina,
    alumnoId: examen.alumnoId ?? null
  });
}

async function guardarImagenReferencia({
  base64,
  folio,
  numeroPagina
}: {
  base64: string;
  folio: string;
  numeroPagina: number;
}) {
  const limpio = String(base64 || '').replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  if (!limpio) return;
  const buffer = Buffer.from(limpio, 'base64');
  const dirBase = path.resolve(process.cwd(), 'storage', 'omr_scans', folio);
  await fs.mkdir(dirBase, { recursive: true });
  const salida = path.join(dirBase, `P${numeroPagina}.jpg`);
  const yaExiste = await fs
    .access(salida)
    .then(() => true)
    .catch(() => false);
  if (yaExiste) return;
  await sharp(buffer)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 45, mozjpeg: true })
    .toFile(salida);
}
