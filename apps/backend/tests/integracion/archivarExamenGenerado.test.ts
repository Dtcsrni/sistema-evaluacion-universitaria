import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { crearApp } from '../../src/app';
import { cerrarMongoTest, conectarMongoTest, limpiarMongoTest } from '../utils/mongo';

describe('archivar examen generado', () => {
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

  it('permite archivar un examen en estado generado', async () => {
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

    const examenResp = await request(app)
      .post('/api/examenes/generados')
      .set(auth)
      .send({ plantillaId })
      .expect(201);
    const examenId = examenResp.body.examenGenerado._id as string;
    const folio = examenResp.body.examenGenerado.folio as string;

    const archivarResp = await request(app).post(`/api/examenes/generados/${examenId}/archivar`).set(auth).expect(200);
    expect(archivarResp.body?.examen?.archivadoEn).toBeTruthy();

    await request(app).get(`/api/examenes/generados/folio/${folio}`).set(auth).expect(200);

    const listado = await request(app)
      .get(`/api/examenes/generados?plantillaId=${encodeURIComponent(plantillaId)}&limite=50`)
      .set(auth)
      .expect(200);
    expect(Array.isArray(listado.body?.examenes)).toBe(true);
    expect(listado.body.examenes.length).toBe(0);

    const archivados = await request(app)
      .get(`/api/examenes/generados?plantillaId=${encodeURIComponent(plantillaId)}&archivado=1&limite=50`)
      .set(auth)
      .expect(200);
    expect(Array.isArray(archivados.body?.examenes)).toBe(true);
    expect(archivados.body.examenes.length).toBe(1);
  });

  it('permite archivar un examen entregado', async () => {
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

    const alumnoResp = await request(app)
      .post('/api/alumnos')
      .set(auth)
      .send({
        periodoId,
        matricula: 'CUH512410168',
        nombreCompleto: 'Alumno Prueba',
        correo: 'alumno@prueba.test',
        grupo: 'A'
      })
      .expect(201);
    const alumnoId = alumnoResp.body.alumno._id as string;

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

    const examenResp = await request(app)
      .post('/api/examenes/generados')
      .set(auth)
      .send({ plantillaId })
      .expect(201);
    const examenId = examenResp.body.examenGenerado._id as string;
    const folio = examenResp.body.examenGenerado.folio as string;

    await request(app).post('/api/entregas/vincular-folio').set(auth).send({ folio, alumnoId }).expect(201);

    const archivarResp = await request(app).post(`/api/examenes/generados/${examenId}/archivar`).set(auth).expect(200);
    expect(archivarResp.body?.examen?.archivadoEn).toBeTruthy();
  });
});
