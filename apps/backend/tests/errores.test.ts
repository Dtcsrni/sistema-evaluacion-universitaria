// Pruebas del middleware de errores.
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ErrorAplicacion } from '../src/compartido/errores/errorAplicacion';
import { manejadorErrores } from '../src/compartido/errores/manejadorErrores';

describe('manejadorErrores', () => {
  const app = express();

  app.get('/controlado', () => {
    throw new ErrorAplicacion('PRUEBA', 'Error controlado', 422, { campo: 'valor' });
  });

  app.get('/inesperado', () => {
    throw new Error('Falla inesperada');
  });

  app.use(manejadorErrores);

  it('serializa errores de aplicacion con detalles', async () => {
    const respuesta = await request(app).get('/controlado').expect(422);

    expect(respuesta.body.error.codigo).toBe('PRUEBA');
    expect(respuesta.body.error.mensaje).toBe('Error controlado');
    expect(respuesta.body.error.detalles).toEqual({ campo: 'valor' });
  });

  it('normaliza errores no controlados', async () => {
    const respuesta = await request(app).get('/inesperado').expect(500);

    expect(respuesta.body.error.codigo).toBe('ERROR_INTERNO');
    expect(respuesta.body.error.mensaje).toBe('Falla inesperada');
  });

  it('no filtra mensajes internos en produccion', async () => {
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
