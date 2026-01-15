import { describe, expect, it } from 'vitest';
import { esCorreoDeDominioPermitido, obtenerDominioCorreo } from '../src/compartido/utilidades/correo';

describe('correo utilidades', () => {
  it('extrae dominio del correo', () => {
    expect(obtenerDominioCorreo('ana@cuh.mx')).toBe('cuh.mx');
    expect(obtenerDominioCorreo('ANA@CUH.MX')).toBe('cuh.mx');
    expect(obtenerDominioCorreo('sin-arroba')).toBeNull();
  });

  it('permite cualquier dominio si la lista esta vacia', () => {
    expect(esCorreoDeDominioPermitido('ana@cuh.mx', [])).toBe(true);
    expect(esCorreoDeDominioPermitido('ana@otro.mx', [])).toBe(true);
  });

  it('valida dominios permitidos (normaliza @ y mayusculas)', () => {
    const dominios = ['@cuh.mx', 'DOCENTES.CUH.MX'];
    expect(esCorreoDeDominioPermitido('ana@cuh.mx', dominios)).toBe(true);
    expect(esCorreoDeDominioPermitido('ana@docentes.cuh.mx', dominios)).toBe(true);
    expect(esCorreoDeDominioPermitido('ana@otro.mx', dominios)).toBe(false);
  });
});
