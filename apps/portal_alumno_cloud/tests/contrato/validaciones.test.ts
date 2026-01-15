import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

type RequestConSesion = Request & {
  periodoId?: string;
  alumnoId?: string;
};

describe('contrato (portal)', () => {
  it('rechaza ingresar sin codigo/matricula', async () => {
    const { crearApp } = await import('../../src/app');
    const app = crearApp();

    const respuesta = await request(app).post('/api/portal/ingresar').send({}).expect(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
  });

  it('rechaza ingresar con campos extra', async () => {
    const { crearApp } = await import('../../src/app');
    const app = crearApp();

    const respuesta = await request(app)
      .post('/api/portal/ingresar')
      .send({ codigo: 'ABC123', matricula: 'A001', extra: 'NO' })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
  });

  it('protege limpiar con x-api-key y normaliza dias', async () => {
    const anterior = { PORTAL_API_KEY: process.env.PORTAL_API_KEY };
    process.env.PORTAL_API_KEY = 'SECRETA_TEST';

    vi.resetModules();
    vi.doMock('../../src/modelos/modeloResultadoAlumno', () => {
      return {
        ResultadoAlumno: {
          deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
        }
      };
    });
    const { crearApp } = await import('../../src/app');
    const app = crearApp();

    const respuesta = await request(app)
      .post('/api/portal/limpiar')
      .set('x-api-key', 'SECRETA_TEST')
      .send({ dias: -5 })
      .expect(200);

    expect(respuesta.body.diasRetencion).toBe(1);

    process.env.PORTAL_API_KEY = anterior.PORTAL_API_KEY;
    vi.resetModules();
  });

  it('rechaza limpiar con campos extra', async () => {
    const anterior = { PORTAL_API_KEY: process.env.PORTAL_API_KEY };
    process.env.PORTAL_API_KEY = 'SECRETA_TEST';

    vi.resetModules();
    vi.doMock('../../src/modelos/modeloResultadoAlumno', () => {
      return {
        ResultadoAlumno: {
          deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
        }
      };
    });
    const { crearApp } = await import('../../src/app');
    const app = crearApp();

    const respuesta = await request(app)
      .post('/api/portal/limpiar')
      .set('x-api-key', 'SECRETA_TEST')
      .send({ dias: 10, extra: 'NO' })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('PAYLOAD_INVALIDO');

    process.env.PORTAL_API_KEY = anterior.PORTAL_API_KEY;
    vi.resetModules();
  });

  it('rechaza sincronizar con campos extra (top-level) y no escribe en DB', async () => {
    const anterior = { PORTAL_API_KEY: process.env.PORTAL_API_KEY };
    process.env.PORTAL_API_KEY = 'SECRETA_TEST';

    const actualizarCodigo = vi.fn().mockResolvedValue({});
    const actualizarResultado = vi.fn().mockResolvedValue({});

    vi.resetModules();
    vi.doMock('../../src/modelos/modeloCodigoAcceso', () => {
      return {
        CodigoAcceso: {
          updateOne: actualizarCodigo
        }
      };
    });
    vi.doMock('../../src/modelos/modeloResultadoAlumno', () => {
      return {
        ResultadoAlumno: {
          updateOne: actualizarResultado
        }
      };
    });

    const { crearApp } = await import('../../src/app');
    const app = crearApp();

    const respuesta = await request(app)
      .post('/api/portal/sincronizar')
      .set('x-api-key', 'SECRETA_TEST')
      .send({
        docenteId: '507f1f77bcf86cd799439011',
        periodo: { _id: '507f1f77bcf86cd799439012' },
        alumnos: [],
        calificaciones: [],
        extra: 'NO'
      })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('PAYLOAD_INVALIDO');
    expect(actualizarCodigo).not.toHaveBeenCalled();
    expect(actualizarResultado).not.toHaveBeenCalled();

    process.env.PORTAL_API_KEY = anterior.PORTAL_API_KEY;
    vi.resetModules();
  });

  it('rechaza eventos-uso con campos extra (top-level)', async () => {
    const insertar = vi.fn().mockResolvedValue([]);

    vi.resetModules();
    vi.doMock('../../src/servicios/middlewareSesion', () => {
      return {
        requerirSesionAlumno: (req: RequestConSesion, _res: Response, next: NextFunction) => {
          req.periodoId = '507f1f77bcf86cd799439011';
          req.alumnoId = '507f1f77bcf86cd799439012';
          next();
        }
      };
    });
    vi.doMock('../../src/modelos/modeloEventoUsoAlumno', () => {
      return {
        EventoUsoAlumno: {
          insertMany: insertar
        }
      };
    });
    const { crearApp } = await import('../../src/app');
    const app = crearApp();

    const respuesta = await request(app)
      .post('/api/portal/eventos-uso')
      .set({ Authorization: 'Bearer token' })
      .send({ eventos: [{ accion: 'click' }], extra: 'NO' })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(insertar).not.toHaveBeenCalled();

    vi.resetModules();
  });

  it('rechaza eventos-uso con campos extra en evento', async () => {
    const insertar = vi.fn().mockResolvedValue([]);

    vi.resetModules();
    vi.doMock('../../src/servicios/middlewareSesion', () => {
      return {
        requerirSesionAlumno: (req: RequestConSesion, _res: Response, next: NextFunction) => {
          req.periodoId = '507f1f77bcf86cd799439011';
          req.alumnoId = '507f1f77bcf86cd799439012';
          next();
        }
      };
    });
    vi.doMock('../../src/modelos/modeloEventoUsoAlumno', () => {
      return {
        EventoUsoAlumno: {
          insertMany: insertar
        }
      };
    });
    const { crearApp } = await import('../../src/app');
    const app = crearApp();

    const respuesta = await request(app)
      .post('/api/portal/eventos-uso')
      .set({ Authorization: 'Bearer token' })
      .send({ eventos: [{ accion: 'click', extra: 'NO' }] })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(insertar).not.toHaveBeenCalled();

    vi.resetModules();
  });
});
