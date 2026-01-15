/**
 * Validaciones de alumnos.
 */
import { z } from 'zod';
import { esquemaObjectId } from '../../compartido/validaciones/esquemas';
import { esCorreoDeDominioPermitido } from '../../compartido/utilidades/correo';
import { configuracion } from '../../configuracion';

function partirNombreCompleto(nombreCompleto: string): { nombres: string; apellidos: string } {
  const limpio = String(nombreCompleto || '')
    .trim()
    .replace(/\s+/g, ' ');
  const partes = limpio.split(' ').filter(Boolean);
  if (partes.length <= 1) return { nombres: limpio, apellidos: '' };
  return { nombres: partes.slice(0, -1).join(' '), apellidos: partes.slice(-1).join(' ') };
}

export const esquemaCrearAlumno = z
  .object({
    periodoId: esquemaObjectId,
    matricula: z.string().min(1),
    nombres: z.string().min(1).optional(),
    apellidos: z.string().min(1).optional(),
    nombreCompleto: z.string().min(1).optional(),
    correo: z.string().email().optional(),
    grupo: z.string().optional(),
    activo: z.boolean().optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    const nombres = typeof data.nombres === 'string' ? data.nombres.trim() : '';
    const apellidos = typeof data.apellidos === 'string' ? data.apellidos.trim() : '';
    const nombreCompleto = typeof data.nombreCompleto === 'string' ? data.nombreCompleto.trim() : '';

    const tieneNombresApellidos = Boolean(nombres && apellidos);
    const tieneNombreCompleto = Boolean(nombreCompleto);

    if (!tieneNombresApellidos && !tieneNombreCompleto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nombres'],
        message: 'Faltan datos: proporciona nombres y apellidos, o nombreCompleto.'
      });
      return;
    }

    if (tieneNombreCompleto && !tieneNombresApellidos) {
      const { nombres: derivadosNombres, apellidos: derivadosApellidos } = partirNombreCompleto(nombreCompleto);
      if (!derivadosNombres.trim() || !derivadosApellidos.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nombreCompleto'],
          message: 'Nombre completo inválido: incluye al menos nombres y apellidos.'
        });
      }
    }

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
  })
  .transform((data) => {
    const matricula = String(data.matricula || '').trim();

    const nombres = typeof data.nombres === 'string' ? data.nombres.trim().replace(/\s+/g, ' ') : '';
    const apellidos = typeof data.apellidos === 'string' ? data.apellidos.trim().replace(/\s+/g, ' ') : '';
    const nombreCompleto = typeof data.nombreCompleto === 'string' ? data.nombreCompleto.trim().replace(/\s+/g, ' ') : '';

    if (nombres && apellidos) {
      return {
        ...data,
        matricula,
        nombres,
        apellidos,
        nombreCompleto: nombreCompleto || `${nombres} ${apellidos}`.trim()
      };
    }

    const derivados = partirNombreCompleto(nombreCompleto);
    return {
      ...data,
      matricula,
      nombres: derivados.nombres,
      apellidos: derivados.apellidos,
      nombreCompleto: nombreCompleto || `${derivados.nombres} ${derivados.apellidos}`.trim()
    };
  });
