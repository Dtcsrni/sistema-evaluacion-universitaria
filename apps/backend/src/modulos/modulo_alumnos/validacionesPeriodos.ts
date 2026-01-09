/**
 * Validaciones de periodos.
 */
import { z } from 'zod';

export const esquemaCrearPeriodo = z.object({
  nombre: z.string().min(1),
  fechaInicio: z.string().min(1),
  fechaFin: z.string().min(1),
  grupos: z.array(z.string()).optional(),
  activo: z.boolean().optional()
});
