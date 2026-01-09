/**
 * Utilidades de hash de contrasenas.
 */
import bcrypt from 'bcryptjs';

const rondas = 12;

export async function crearHash(contrasena: string) {
  return bcrypt.hash(contrasena, rondas);
}

export async function compararContrasena(contrasena: string, hash: string) {
  return bcrypt.compare(contrasena, hash);
}
