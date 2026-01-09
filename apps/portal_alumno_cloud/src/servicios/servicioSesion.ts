/**
 * Tokens de sesion para portal alumno.
 */
import { createHash, randomBytes } from 'crypto';

export function generarTokenSesion() {
  const token = randomBytes(24).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
