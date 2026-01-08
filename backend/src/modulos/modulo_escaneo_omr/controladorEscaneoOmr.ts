/**
 * Controlador de escaneo OMR.
 */
import type { Request, Response } from 'express';
import { analizarOmr } from './servicioOmr';

export async function analizarImagen(req: Request, res: Response) {
  const { imagenBase64 } = req.body;
  const resultado = await analizarOmr(imagenBase64 ?? '');
  res.json({ resultado });
}
