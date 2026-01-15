// Pruebas del manejador de errores del portal.
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { manejadorErroresPortal } from '../src/compartido/errores/manejadorErrores';

describe('manejadorErroresPortal', () => {
  const app = express();

  app.get('/inesperado', () => {
    throw new Error('Falla inesperada');
  });

  app.use(manejadorErroresPortal);

  it('en test/dev expone el mensaje para diagnostico', async () => {
    const respuesta = await request(app).get('/inesperado').expect(500);
    expect(respuesta.body.error.codigo).toBe('ERROR_INTERNO');
    expect(respuesta.body.error.mensaje).toBe('Falla inesperada');
  });

  it('en produccion evita filtrar mensajes internos', async () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const respuesta = await request(app).get('/inesperado').expect(500);
      expect(respuesta.body.error.codigo).toBe('ERROR_INTERNO');
      expect(respuesta.body.error.mensaje).toBe('Error interno');
    } finally {
      process.env.NODE_ENV = anterior;
    }
  });
});
