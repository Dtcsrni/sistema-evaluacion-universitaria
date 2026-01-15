import request from 'supertest';
import { describe, it } from 'vitest';
import { crearApp } from '../src/app';

describe('api key (portal)', () => {
  it('bloquea sincronizar sin x-api-key', async () => {
    const app = crearApp();
    await request(app).post('/api/portal/sincronizar').send({}).expect(401);
  });

  it('bloquea limpiar sin x-api-key', async () => {
    const app = crearApp();
    await request(app).post('/api/portal/limpiar').send({ dias: 30 }).expect(401);
  });

  it('bloquea sincronizar con x-api-key invalida', async () => {
    const app = crearApp();
    await request(app)
      .post('/api/portal/sincronizar')
      .set('x-api-key', 'INVALIDA')
      .send({})
      .expect(401);
  });
});
