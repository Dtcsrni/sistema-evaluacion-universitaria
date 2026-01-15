/**
 * Validaciones de examenes (plantillas y generados).
 */
import { z } from 'zod';
import { esquemaObjectId } from '../../compartido/validaciones/esquemas';

export const esquemaCrearPlantilla = z.object({
  periodoId: esquemaObjectId.optional(),
  tipo: z.enum(['parcial', 'global']),
  titulo: z.string().min(1),
  instrucciones: z.string().optional(),
  totalReactivos: z.number().int().positive(),
  preguntasIds: z.array(esquemaObjectId).optional(),
  configuracionPdf: z
    .object({
      margenMm: z.number().positive().optional(),
      layout: z.string().optional()
    })
    .strict()
    .optional()
});

export const esquemaGenerarExamen = z.object({
  plantillaId: esquemaObjectId,
  alumnoId: esquemaObjectId.optional()
});
