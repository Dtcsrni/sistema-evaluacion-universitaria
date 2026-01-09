/**
 * Middleware para requerir sesion docente via JWT.
 */
import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { verificarTokenDocente } from './servicioTokens';

export type SolicitudDocente = Request & { docenteId?: string };

export function requerirDocente(req: SolicitudDocente, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? '';
  const [tipo, token] = auth.split(' ');

  if (tipo !== 'Bearer' || !token) {
    next(new ErrorAplicacion('NO_AUTORIZADO', 'Token requerido', 401));
    return;
  }

  try {
    const payload = verificarTokenDocente(token);
    req.docenteId = payload.docenteId;
    next();
  } catch (error) {
    next(new ErrorAplicacion('TOKEN_INVALIDO', 'Token invalido o expirado', 401));
  }
}

export function obtenerDocenteId(req: SolicitudDocente) {
  if (!req.docenteId) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sesion requerida', 401);
  }
  return req.docenteId;
}
