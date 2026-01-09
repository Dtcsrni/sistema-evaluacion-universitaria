import { crearTokenDocente } from '../../src/modulos/modulo_autenticacion/servicioTokens';

export function tokenDocentePrueba() {
  return crearTokenDocente({ docenteId: '507f1f77bcf86cd799439011' });
}
