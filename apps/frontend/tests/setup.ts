import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

const respuestaVacia = { ok: true, json: async () => ({}), blob: async () => new Blob() };

vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/salud')) {
      return { ok: true, json: async () => ({ tiempoActivo: 10 }) };
    }
    if (url.includes('/autenticacion/perfil')) {
      return { ok: true, json: async () => ({ docente: { id: '1', nombreCompleto: 'Docente', correo: 'docente@local.test' } }) };
    }
    return respuestaVacia;
  })
);

beforeEach(() => {
  localStorage.clear();
});
