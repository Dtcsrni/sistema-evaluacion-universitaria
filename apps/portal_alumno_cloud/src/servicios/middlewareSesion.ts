/**
 * Middleware de autenticacion para alumnos.
 */
import type { NextFunction, Request, Response } from 'express';
import { SesionAlumno } from '../modelos/modeloSesionAlumno';
import { hashToken } from './servicioSesion';

export type SolicitudAlumno = Request & { alumnoId?: string; periodoId?: string };

export async function requerirSesionAlumno(req: SolicitudAlumno, res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? '';
  const [tipo, token] = auth.split(' ');
  if (tipo !== 'Bearer' || !token) {
    res.status(401).json({ error: { codigo: 'NO_AUTORIZADO', mensaje: 'Token requerido' } });
    return;
  }

  const tokenHash = hashToken(token);
  const sesion = await SesionAlumno.findOne({ tokenHash }).lean();
  if (!sesion || sesion.expiraEn < new Date()) {
    res.status(401).json({ error: { codigo: 'TOKEN_INVALIDO', mensaje: 'Token invalido o expirado' } });
    return;
  }

  req.alumnoId = String(sesion.alumnoId);
  req.periodoId = String(sesion.periodoId);
  next();
}
