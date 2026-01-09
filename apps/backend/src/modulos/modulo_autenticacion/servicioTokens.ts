/**
 * Tokens JWT para sesiones de docente.
 */
import jwt from 'jsonwebtoken';
import { configuracion } from '../../configuracion';

export type TokenDocentePayload = {
  docenteId: string;
};

export function crearTokenDocente(payload: TokenDocentePayload) {
  return jwt.sign(payload, configuracion.jwtSecreto, {
    expiresIn: `${configuracion.jwtExpiraHoras}h`
  });
}

export function verificarTokenDocente(token: string): TokenDocentePayload {
  return jwt.verify(token, configuracion.jwtSecreto) as TokenDocentePayload;
}
