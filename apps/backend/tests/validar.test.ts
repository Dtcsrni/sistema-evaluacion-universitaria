// Pruebas del helper de validacion Zod.
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { manejadorErrores } from '../src/compartido/errores/manejadorErrores';
import { validarCuerpo } from '../src/compartido/validaciones/validar';

describe('validarCuerpo', () => {
  const app = express();
  app.use(express.json());

  const esquema = z.object({
    nombre: z.string().min(1),
    edad: z.number().int().positive()
  });

  app.post('/validar', validarCuerpo(esquema), (req, res) => {
    res.json({ datos: req.body });
  });

  app.use(manejadorErrores);

  it('rechaza payload invalido con codigo VALIDACION', async () => {
    const respuesta = await request(app).post('/validar').send({ nombre: '', edad: -1 }).expect(400);

    expect(respuesta.body.error.codigo).toBe('VALIDACION');
    expect(respuesta.body.error.detalles).toBeTruthy();
  });

  it('acepta payload valido y devuelve datos sanitizados', async () => {
    const respuesta = await request(app).post('/validar').send({ nombre: 'Ana', edad: 20 }).expect(200);

    expect(respuesta.body.datos).toEqual({ nombre: 'Ana', edad: 20 });
  });

  it('elimina campos extra por defecto', async () => {
    const respuesta = await request(app)
      .post('/validar')
      .send({ nombre: 'Ana', edad: 20, extra: 'NO_DEBE_PASAR' })
      .expect(200);

    expect(respuesta.body.datos).toEqual({ nombre: 'Ana', edad: 20 });
  });
});
