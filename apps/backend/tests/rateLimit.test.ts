import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

describe('rate limit', () => {
  it('responde 429 al exceder el limite', async () => {
    const anterior = {
      RATE_LIMIT_LIMIT: process.env.RATE_LIMIT_LIMIT,
      RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS
    };

    process.env.RATE_LIMIT_LIMIT = '2';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';

    vi.resetModules();
    const { crearApp } = await import('../src/app');
    const app = crearApp();

    await request(app).get('/api/salud').expect(200);
    await request(app).get('/api/salud').expect(200);
    const respuesta = await request(app).get('/api/salud').expect(429);

    expect(respuesta.headers['retry-after']).toBeTruthy();

    process.env.RATE_LIMIT_LIMIT = anterior.RATE_LIMIT_LIMIT;
    process.env.RATE_LIMIT_WINDOW_MS = anterior.RATE_LIMIT_WINDOW_MS;
    vi.resetModules();
  });
});
