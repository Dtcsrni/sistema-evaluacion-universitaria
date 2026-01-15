/**
 * Validaciones de autenticacion.
 */
import { z } from 'zod';

export const esquemaRegistrarDocente = z.object({
  nombreCompleto: z.string().min(1),
  correo: z.string().email(),
  contrasena: z.string().min(8)
});

export const esquemaIngresarDocente = z.object({
  correo: z.string().email(),
  contrasena: z.string().min(1)
});

export const esquemaIngresarDocenteGoogle = z.object({
  // ID token (credential) emitido por Google Identity Services.
  credential: z.string().min(10)
});

export const esquemaRegistrarDocenteGoogle = z.object({
  // ID token (credential) emitido por Google Identity Services.
  credential: z.string().min(10),
  nombreCompleto: z.string().min(1),
  // Opcional: permite crear password para ingresar sin Google.
  contrasena: z.string().min(8).optional()
});

export const esquemaDefinirContrasenaDocente = z.object({
  contrasenaNueva: z.string().min(8)
});

export const esquemaBodyVacioOpcional = z.object({}).strict().optional();
