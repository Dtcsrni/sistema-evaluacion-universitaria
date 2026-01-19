import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app';
import { cerrarMongoTest, conectarMongoTest, limpiarMongoTest } from '../utils/mongo';

describe('plantillas CRUD + previsualizacion', () => {
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

  async function registrarDocente() {
    const respuesta = await request(app)
      .post('/api/autenticacion/registrar')
      .send({
        nombreCompleto: 'Docente Prueba',
        correo: 'docente@prueba.test',
        contrasena: 'Secreto123!'
      })
      .expect(201);
    return respuesta.body.token as string;
  }

  it('permite editar, previsualizar y archivar una plantilla sin examenes generados', async () => {
    const token = await registrarDocente();
    const auth = { Authorization: `Bearer ${token}` };

    const periodoResp = await request(app)
      .post('/api/periodos')
      .set(auth)
      .send({
        nombre: 'Periodo 2025',
        fechaInicio: '2025-01-01',
        fechaFin: '2025-06-01',
        grupos: ['A']
      })
      .expect(201);
    const periodoId = periodoResp.body.periodo._id as string;

    const preguntasIds: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const preguntaResp = await request(app)
        .post('/api/banco-preguntas')
        .set(auth)
        .send({
          periodoId,
          enunciado: `Pregunta ${i + 1}`,
          opciones: [
            { texto: 'Opcion A', esCorrecta: true },
            { texto: 'Opcion B', esCorrecta: false },
            { texto: 'Opcion C', esCorrecta: false },
            { texto: 'Opcion D', esCorrecta: false },
            { texto: 'Opcion E', esCorrecta: false }
          ]
        })
        .expect(201);
      preguntasIds.push(preguntaResp.body.pregunta._id as string);
    }

    const plantillaResp = await request(app)
      .post('/api/examenes/plantillas')
      .set(auth)
      .send({
        periodoId,
        tipo: 'parcial',
        titulo: 'Parcial 1',
        numeroPaginas: 1,
        preguntasIds
      })
      .expect(201);
    const plantillaId = plantillaResp.body.plantilla._id as string;

    const editResp = await request(app)
      .post(`/api/examenes/plantillas/${plantillaId}`)
      .set(auth)
      .send({
        titulo: 'Parcial 1 (editado)',
        numeroPaginas: 1
      })
      .expect(200);
    expect(editResp.body?.plantilla?.titulo).toBe('Parcial 1 (editado)');

    const prev = await request(app)
      .get(`/api/examenes/plantillas/${plantillaId}/previsualizar`)
      .set(auth)
      .expect(200);
    expect(prev.body?.plantillaId).toBe(String(plantillaId));
    expect(Array.isArray(prev.body?.paginas)).toBe(true);
    expect(prev.body.paginas.length).toBeGreaterThan(0);

    const previewPdf = await request(app)
      .get(`/api/examenes/plantillas/${plantillaId}/previsualizar/pdf`)
      .set(auth)
      .expect(200);
    expect(String(previewPdf.headers['content-type'] || '')).toContain('application/pdf');

    const archivarResp = await request(app).post(`/api/examenes/plantillas/${plantillaId}/archivar`).set(auth).expect(200);
    expect(archivarResp.body?.plantilla?.archivadoEn).toBeTruthy();

    const listResp = await request(app).get('/api/examenes/plantillas').set(auth).expect(200);
    expect(listResp.body?.plantillas?.length ?? 0).toBe(0);
  });

  it('permite archivar una plantilla con examenes generados', async () => {
    const token = await registrarDocente();
    const auth = { Authorization: `Bearer ${token}` };

    const periodoResp = await request(app)
      .post('/api/periodos')
      .set(auth)
      .send({
        nombre: 'Periodo 2025',
        fechaInicio: '2025-01-01',
        fechaFin: '2025-06-01',
        grupos: ['A']
      })
      .expect(201);
    const periodoId = periodoResp.body.periodo._id as string;

    const preguntasIds: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const preguntaResp = await request(app)
        .post('/api/banco-preguntas')
        .set(auth)
        .send({
          periodoId,
          enunciado: `Pregunta ${i + 1}`,
          opciones: [
            { texto: 'Opcion A', esCorrecta: true },
            { texto: 'Opcion B', esCorrecta: false },
            { texto: 'Opcion C', esCorrecta: false },
            { texto: 'Opcion D', esCorrecta: false },
            { texto: 'Opcion E', esCorrecta: false }
          ]
        })
        .expect(201);
      preguntasIds.push(preguntaResp.body.pregunta._id as string);
    }

    const plantillaResp = await request(app)
      .post('/api/examenes/plantillas')
      .set(auth)
      .send({
        periodoId,
        tipo: 'parcial',
        titulo: 'Parcial 1',
        numeroPaginas: 1,
        preguntasIds
      })
      .expect(201);
    const plantillaId = plantillaResp.body.plantilla._id as string;

    await request(app).post('/api/examenes/generados').set(auth).send({ plantillaId }).expect(201);

    const archivarResp = await request(app).post(`/api/examenes/plantillas/${plantillaId}/archivar`).set(auth).expect(200);
    expect(archivarResp.body?.plantilla?.archivadoEn).toBeTruthy();
  });
});
