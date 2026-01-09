/**
 * Validaciones de calificacion.
 */
import { z } from 'zod';

export const esquemaCalificarExamen = z.object({
  examenGeneradoId: z.string().min(1),
  alumnoId: z.string().min(1).optional(),
  aciertos: z.number().int().min(0).optional(),
  totalReactivos: z.number().int().positive().optional(),
  bonoSolicitado: z.number().min(0).optional(),
  evaluacionContinua: z.number().min(0).optional(),
  proyecto: z.number().min(0).optional(),
  retroalimentacion: z.string().optional(),
  respuestasDetectadas: z.any().optional()
});
