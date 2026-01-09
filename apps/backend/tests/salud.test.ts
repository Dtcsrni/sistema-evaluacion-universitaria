import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApp } from '../src/app';

describe('salud', () => {
  it('responde con estado ok y metadata de DB', async () => {
    const app = crearApp();
    const respuesta = await request(app).get('/api/salud').expect(200);

    expect(respuesta.body.estado).toBe('ok');
    expect(respuesta.body.db).toEqual(
      expect.objectContaining({
        estado: expect.any(Number)
      })
    );
  });
});
