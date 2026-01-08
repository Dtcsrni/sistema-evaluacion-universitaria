/**
 * Validaciones de calificacion.
 */
import { z } from 'zod';

export const esquemaCalificarExamen = z.object({
  docenteId: z.string().min(1),
  periodoId: z.string().optional(),
  examenGeneradoId: z.string().min(1),
  alumnoId: z.string().min(1),
  aciertos: z.number().int().min(0),
  totalReactivos: z.number().int().positive(),
  bonoSolicitado: z.number().min(0).optional(),
  retroalimentacion: z.string().optional(),
  respuestasDetectadas: z.any().optional()
});
