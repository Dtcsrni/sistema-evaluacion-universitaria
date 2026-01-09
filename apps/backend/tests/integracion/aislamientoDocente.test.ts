import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app';
import { cerrarMongoTest, conectarMongoTest, limpiarMongoTest } from '../utils/mongo';

describe('aislamiento por docente', () => {
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

  async function registrar(correo: string) {
    const respuesta = await request(app)
      .post('/api/autenticacion/registrar')
      .send({ nombreCompleto: 'Docente', correo, contrasena: 'Secreto123!' })
      .expect(201);
    return respuesta.body.token as string;
  }

  it('no permite acceder a examenes de otro docente', async () => {
    const tokenA = await registrar('docente-a@local.test');
    const tokenB = await registrar('docente-b@local.test');

    const periodoResp = await request(app)
      .post('/api/periodos')
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({
        nombre: 'Periodo A',
        fechaInicio: '2025-01-01',
        fechaFin: '2025-06-01'
      })
      .expect(201);
    const periodoId = periodoResp.body.periodo._id as string;

    const preguntaResp = await request(app)
      .post('/api/banco-preguntas')
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({
        periodoId,
        enunciado: 'Pregunta A',
        opciones: [
          { texto: 'A', esCorrecta: true },
          { texto: 'B', esCorrecta: false },
          { texto: 'C', esCorrecta: false },
          { texto: 'D', esCorrecta: false },
          { texto: 'E', esCorrecta: false }
        ]
      })
      .expect(201);
    const preguntaId = preguntaResp.body.pregunta._id as string;

    const plantillaResp = await request(app)
      .post('/api/examenes/plantillas')
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({
        periodoId,
        tipo: 'parcial',
        titulo: 'Plantilla A',
        totalReactivos: 1,
        preguntasIds: [preguntaId]
      })
      .expect(201);
    const plantillaId = plantillaResp.body.plantilla._id as string;

    const examenResp = await request(app)
      .post('/api/examenes/generados')
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ plantillaId })
      .expect(201);
    const folio = examenResp.body.examenGenerado.folio as string;

    const respuesta = await request(app)
      .get(`/api/examenes/generados/folio/${folio}`)
      .set({ Authorization: `Bearer ${tokenB}` })
      .expect(404);

    expect(respuesta.body.mensaje ?? respuesta.body.error?.codigo).toBeDefined();
  });
});
