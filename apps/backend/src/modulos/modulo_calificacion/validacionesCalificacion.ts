/**
 * Validaciones de calificacion.
 */
import { z } from 'zod';
import { esquemaObjectId } from '../../compartido/validaciones/esquemas';

const esquemaRespuestaDetectada = z
  .object({
    numeroPregunta: z.number().int().positive(),
    opcion: z.string().trim().min(1).max(1).nullable(),
    confianza: z.number().min(0).max(1).optional()
  })
  .strict();

export const esquemaCalificarExamen = z.object({
  examenGeneradoId: esquemaObjectId,
  alumnoId: esquemaObjectId.optional(),
  aciertos: z.number().int().min(0).optional(),
  totalReactivos: z.number().int().positive().optional(),
  bonoSolicitado: z.number().min(0).optional(),
  evaluacionContinua: z.number().min(0).optional(),
  proyecto: z.number().min(0).optional(),
  retroalimentacion: z.string().optional(),
  respuestasDetectadas: z.array(esquemaRespuestaDetectada).max(500).optional()
});
