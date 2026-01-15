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

  // IDs malformados u otros errores de casteo (p. ej. CastError/BSONError).
  // Se normalizan como 400 para evitar 500 por input del cliente.
  const nombreError = typeof error === 'object' && error ? (error as { name?: unknown }).name : undefined;
  if (
    nombreError === 'CastError' ||
    nombreError === 'BSONError' ||
    nombreError === 'BSONTypeError'
  ) {
    res.status(400).json({
      error: {
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'Id invalido'
      }
    });
    return;
  }

  // body-parser: payload demasiado grande (413).
  const status =
    typeof error === 'object' && error
      ? ((error as { status?: unknown; statusCode?: unknown }).status ??
          (error as { statusCode?: unknown }).statusCode)
      : undefined;
  const type = typeof error === 'object' && error ? (error as { type?: unknown }).type : undefined;
  if (status === 413 || type === 'entity.too.large') {
    res.status(413).json({
      error: {
        codigo: 'PAYLOAD_DEMASIADO_GRANDE',
        mensaje: 'Payload demasiado grande'
      }
    });
    return;
  }

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
