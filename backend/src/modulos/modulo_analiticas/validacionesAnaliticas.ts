/**
 * Validaciones de banderas de revision.
 */
import { z } from 'zod';

export const esquemaCrearBandera = z.object({
  examenGeneradoId: z.string().min(1),
  alumnoId: z.string().min(1),
  tipo: z.enum(['similitud', 'patron', 'duplicado', 'otro']),
  severidad: z.enum(['baja', 'media', 'alta']).optional(),
  descripcion: z.string().optional(),
  sugerencia: z.string().optional()
});

export const esquemaExportarCsv = z.object({
  columnas: z.array(z.string().min(1)),
  filas: z.array(z.record(z.any()))
});
