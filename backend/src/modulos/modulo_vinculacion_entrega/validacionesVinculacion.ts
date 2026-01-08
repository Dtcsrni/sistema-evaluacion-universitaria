/**
 * Validaciones de vinculacion de entregas.
 */
import { z } from 'zod';

export const esquemaVincularEntrega = z.object({
  examenGeneradoId: z.string().min(1),
  alumnoId: z.string().min(1),
  docenteId: z.string().min(1)
});
