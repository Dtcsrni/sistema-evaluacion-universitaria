import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware de manejo de errores (portal alumno).
 *
 * Seguridad:
 * - En produccion, evita filtrar `error.message` al cliente.
 * - En test/dev, devuelve el mensaje para facilitar diagnostico.
 */
export function manejadorErroresPortal(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  void _next;

  const entorno = process.env.NODE_ENV;

  // Log minimo: en produccion conviene reemplazar por logger estructurado.
  if (entorno !== 'test' && error instanceof Error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }

  const exponerMensaje = entorno !== 'production';
  const mensaje = exponerMensaje && error instanceof Error ? error.message : 'Error interno';

  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje } });
}
