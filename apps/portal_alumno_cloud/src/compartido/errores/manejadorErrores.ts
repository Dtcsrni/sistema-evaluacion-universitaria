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

  // body-parser: payload demasiado grande (413).
  const status =
    typeof error === 'object' && error
      ? ((error as { status?: unknown; statusCode?: unknown }).status ??
          (error as { statusCode?: unknown }).statusCode)
      : undefined;
  const type = typeof error === 'object' && error ? (error as { type?: unknown }).type : undefined;
  if (status === 413 || type === 'entity.too.large') {
    res.status(413).json({ error: { codigo: 'PAYLOAD_DEMASIADO_GRANDE', mensaje: 'Payload demasiado grande' } });
    return;
  }

  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje } });
}
