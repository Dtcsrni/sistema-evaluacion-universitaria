/**
 * Validaciones de sincronizacion a nube.
 */
import { z } from 'zod';

export const esquemaPublicarResultados = z.object({
  periodoId: z.string().min(1)
});

export const esquemaGenerarCodigoAcceso = z.object({
  periodoId: z.string().min(1)
});
