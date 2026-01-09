import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app';

describe('autorizacion', () => {
  const app = crearApp();

  it('rechaza rutas protegidas sin token', async () => {
    const respuesta = await request(app).get('/api/alumnos').expect(401);
    expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('rechaza token invalido', async () => {
    const respuesta = await request(app)
      .get('/api/alumnos')
      .set({ Authorization: 'Bearer token-invalido' })
      .expect(401);
    expect(respuesta.body.error.codigo).toBe('TOKEN_INVALIDO');
  });
});
