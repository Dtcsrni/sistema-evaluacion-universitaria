/**
 * Helpers de validacion con Zod para requests.
 */
import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { ErrorAplicacion } from '../errores/errorAplicacion';

export function validarCuerpo(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      next(new ErrorAplicacion('VALIDACION', 'Payload invalido', 400, resultado.error.flatten()));
      return;
    }
    req.body = resultado.data;
    next();
  };
}
