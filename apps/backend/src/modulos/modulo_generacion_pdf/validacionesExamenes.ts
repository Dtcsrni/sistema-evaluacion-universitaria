/**
 * Validaciones de examenes (plantillas y generados).
 */
import { z } from 'zod';

export const esquemaCrearPlantilla = z.object({
  periodoId: z.string().optional(),
  tipo: z.enum(['parcial', 'global']),
  titulo: z.string().min(1),
  instrucciones: z.string().optional(),
  totalReactivos: z.number().int().positive(),
  preguntasIds: z.array(z.string()).optional(),
  configuracionPdf: z
    .object({
      margenMm: z.number().positive().optional(),
      layout: z.string().optional()
    })
    .optional()
});

export const esquemaGenerarExamen = z.object({
  plantillaId: z.string().min(1),
  alumnoId: z.string().optional()
});
