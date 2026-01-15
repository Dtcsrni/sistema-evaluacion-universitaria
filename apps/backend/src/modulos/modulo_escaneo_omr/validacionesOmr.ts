/**
 * Validaciones de escaneo OMR.
 */
import { z } from 'zod';
import { configuracion } from '../../configuracion';

export const esquemaAnalizarOmr = z.object({
  folio: z.string().min(1),
  numeroPagina: z.number().int().positive().optional(),
  imagenBase64: z.string().min(10).max(configuracion.omrImagenBase64MaxChars)
});
