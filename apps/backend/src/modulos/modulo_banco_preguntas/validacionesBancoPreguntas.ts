/**
 * Validaciones de banco de preguntas.
 */
import { z } from 'zod';
import { esquemaObjectId } from '../../compartido/validaciones/esquemas';

const esquemaOpcion = z
  .object({
    texto: z.string().min(1),
    esCorrecta: z.boolean()
  })
  .strict();

export const esquemaCrearPregunta = z
  .object({
    periodoId: esquemaObjectId.optional(),
    tema: z.string().optional(),
    enunciado: z.string().min(1),
    imagenUrl: z.string().url().optional(),
    opciones: z.array(esquemaOpcion)
  })
  .refine((data) => data.opciones.length === 5, {
    message: 'Se requieren 5 opciones'
  })
  .refine((data) => data.opciones.filter((opcion) => opcion.esCorrecta).length === 1, {
    message: 'Debe existir exactamente 1 opcion correcta'
  });
