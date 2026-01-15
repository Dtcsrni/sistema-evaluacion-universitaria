/**
 * Middleware de manejo de errores para el API.
 *
 * Contrato:
 * - Si se lanza/propaga `ErrorAplicacion`, se serializa tal cual (codigo/estado/detalles).
 * - Para errores no esperados, se registra (excepto en tests) y se devuelve 500.
 *
 * Nota: el formato del envelope de error es parte del contrato publico del API.
 */
import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from './errorAplicacion';
import { logError } from '../../infraestructura/logging/logger';

export function manejadorErrores(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  void _next;

  if (error instanceof ErrorAplicacion) {
    res.status(error.estadoHttp).json({
      error: {
        codigo: error.codigo,
        mensaje: error.message,
        detalles: error.detalles
      }
    });
    return;
  }

  // Errores no esperados: se registran para diagnostico y se responde con un
  // mensaje generico al cliente para evitar leakage de detalles internos.
  const entorno = process.env.NODE_ENV;
  if (entorno !== 'test') {
    logError('Error no controlado en request', error);
  }

  const exponerMensaje = entorno !== 'production';
  const mensaje = exponerMensaje && error instanceof Error ? error.message : 'Error interno';
  res.status(500).json({
    error: {
      codigo: 'ERROR_INTERNO',
      mensaje
    }
  });
}
