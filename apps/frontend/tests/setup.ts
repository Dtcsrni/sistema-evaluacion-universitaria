// Setup comun de pruebas React.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { instalarTestHardening } from '../../../test-utils/vitestStrict';

instalarTestHardening();

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

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
});

