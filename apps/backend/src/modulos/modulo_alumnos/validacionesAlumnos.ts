/**
 * Validaciones de alumnos.
 */
import { z } from 'zod';
import { esquemaObjectId } from '../../compartido/validaciones/esquemas';
import { esCorreoDeDominioPermitido } from '../../compartido/utilidades/correo';
import { configuracion } from '../../configuracion';

export const esquemaCrearAlumno = z.object({
  periodoId: esquemaObjectId,
  matricula: z.string().min(1),
  nombreCompleto: z.string().min(1),
  correo: z.string().email().optional(),
  grupo: z.string().optional(),
  activo: z.boolean().optional()
}).superRefine((data, ctx) => {
  const correo = typeof data.correo === 'string' ? data.correo : '';
  if (!correo.trim()) return;

  if (
    Array.isArray(configuracion.dominiosCorreoPermitidos) &&
    configuracion.dominiosCorreoPermitidos.length > 0 &&
    !esCorreoDeDominioPermitido(correo, configuracion.dominiosCorreoPermitidos)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correo'],
      message: 'Correo no permitido por politicas. Usa un correo institucional.'
    });
  }
});
