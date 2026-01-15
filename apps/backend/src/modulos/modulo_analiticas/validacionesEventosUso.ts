/**
 * Validaciones de eventos de uso (telemetria ligera).
 */
import { z } from 'zod';

const esquemaEventoUso = z
  .object({
  sessionId: z.string().min(1).max(200).optional(),
  pantalla: z.string().min(1).max(200).optional(),
  accion: z.string().min(1).max(200),
  exito: z.boolean().optional(),
  duracionMs: z.number().int().nonnegative().max(10 * 60 * 1000).optional(),
  meta: z.unknown().optional()
  })
  .strict();

export const esquemaRegistrarEventosUso = z
  .object({
    eventos: z.array(esquemaEventoUso).min(1).max(100)
  })
  .strict();
