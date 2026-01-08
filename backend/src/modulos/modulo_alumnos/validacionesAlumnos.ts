/**
 * Validaciones de alumnos.
 */
import { z } from 'zod';

export const esquemaCrearAlumno = z.object({
  docenteId: z.string().min(1),
  periodoId: z.string().min(1),
  matricula: z.string().min(1),
  nombreCompleto: z.string().min(1),
  correo: z.string().email().optional(),
  grupo: z.string().optional(),
  activo: z.boolean().optional()
});
