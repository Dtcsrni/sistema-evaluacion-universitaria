// Pruebas de sesiones persistentes (refresh) y login opcional con Google.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modulos/modulo_autenticacion/servicioGoogle', () => {
  return {
    verificarCredencialGoogle: vi.fn(async () => ({
      correo: 'docente@prueba.test',
      sub: 'google-sub-test',
      nombreCompleto: 'Docente Google'
    }))
  };
});

import { crearApp } from '../../src/app';
import { cerrarMongoTest, conectarMongoTest, limpiarMongoTest } from '../utils/mongo';

describe('autenticacion (sesiones)', () => {
  const app = crearApp();

  beforeAll(async () => {
    await conectarMongoTest();
  });

  beforeEach(async () => {
    await limpiarMongoTest();
  });

  afterAll(async () => {
    await cerrarMongoTest();
  });

  it('emite refresh cookie al registrar y permite refrescar token', async () => {
    const registro = await request(app)
      .post('/api/autenticacion/registrar')
      .send({
        nombreCompleto: 'Docente Prueba',
        correo: 'docente@prueba.test',
        contrasena: 'Secreto123!'
      })
      .expect(201);

    const setCookie = registro.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    expect(String(setCookie)).toContain('refreshDocente=');

    const cookieHeader = Array.isArray(setCookie) ? setCookie.map((c) => c.split(';')[0]).join('; ') : String(setCookie);

    const refresco = await request(app)
      .post('/api/autenticacion/refrescar')
      .set('Cookie', cookieHeader)
      .send({})
      .expect(200);

    expect(refresco.body.token).toBeTruthy();
  });

  it('permite ingresar con Google para un docente existente', async () => {
    await request(app)
      .post('/api/autenticacion/registrar')
      .send({
        nombreCompleto: 'Docente Prueba',
        correo: 'docente@prueba.test',
        contrasena: 'Secreto123!'
      })
      .expect(201);

    const login = await request(app)
      .post('/api/autenticacion/google')
      .send({ credential: 'fake-id-token' })
      .expect(200);

    expect(login.body.token).toBeTruthy();
    const setCookie = login.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    expect(String(setCookie)).toContain('refreshDocente=');
  });

  it('permite registrar con Google y luego ingresar con Google', async () => {
    const registro = await request(app)
      .post('/api/autenticacion/registrar-google')
      .send({
        credential: 'fake-id-token',
        nombreCompleto: 'Docente Registro Google'
      })
      .expect(201);

    expect(registro.body.token).toBeTruthy();
    const setCookie = registro.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    expect(String(setCookie)).toContain('refreshDocente=');

    const login = await request(app)
      .post('/api/autenticacion/google')
      .send({ credential: 'fake-id-token' })
      .expect(200);

    expect(login.body.token).toBeTruthy();
  });

  it('permite definir contrasena despues de registrar con Google', async () => {
    const registro = await request(app)
      .post('/api/autenticacion/registrar-google')
      .send({
        credential: 'fake-id-token',
        nombreCompleto: 'Docente Registro Google'
      })
      .expect(201);

    expect(registro.body.token).toBeTruthy();

    // Sin password, el login por correo+contrasena debe fallar.
    await request(app)
      .post('/api/autenticacion/ingresar')
      .send({
        correo: 'docente@prueba.test',
        contrasena: 'Secreto123!'
      })
      .expect(401);

    await request(app)
      .post('/api/autenticacion/definir-contrasena')
      .set('Authorization', `Bearer ${registro.body.token}`)
      .send({ contrasenaNueva: 'Secreto123!' })
      .expect(204);

    const loginPwd = await request(app)
      .post('/api/autenticacion/ingresar')
      .send({
        correo: 'docente@prueba.test',
        contrasena: 'Secreto123!'
      })
      .expect(200);

    expect(loginPwd.body.token).toBeTruthy();
  });
});
