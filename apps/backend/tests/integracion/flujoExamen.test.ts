import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app';
import { cerrarMongoTest, conectarMongoTest, limpiarMongoTest } from '../utils/mongo';

describe('flujo de examen', () => {
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

  it('crea periodo, alumno, banco, plantilla, examen, vincula y califica', async () => {
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
        matricula: '2025-001',
        nombreCompleto: 'Alumno Prueba',
        correo: 'alumno@prueba.test',
        grupo: 'A'
      })
      .expect(201);
    const alumnoId = alumnoResp.body.alumno._id as string;

    const preguntaResp = await request(app)
      .post('/api/banco-preguntas')
      .set(auth)
      .send({
        periodoId,
        enunciado: 'Pregunta 1',
        opciones: [
          { texto: 'Opcion A', esCorrecta: true },
          { texto: 'Opcion B', esCorrecta: false },
          { texto: 'Opcion C', esCorrecta: false },
          { texto: 'Opcion D', esCorrecta: false },
          { texto: 'Opcion E', esCorrecta: false }
        ]
      })
      .expect(201);
    const preguntaId = preguntaResp.body.pregunta._id as string;

    const plantillaResp = await request(app)
      .post('/api/examenes/plantillas')
      .set(auth)
      .send({
        periodoId,
        tipo: 'parcial',
        titulo: 'Parcial 1',
        totalReactivos: 1,
        preguntasIds: [preguntaId]
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

    await request(app)
      .post('/api/entregas/vincular-folio')
      .set(auth)
      .send({ folio, alumnoId })
      .expect(201);

    const calificacionResp = await request(app)
      .post('/api/calificaciones/calificar')
      .set(auth)
      .send({
        examenGeneradoId: examenId,
        alumnoId,
        aciertos: 1,
        totalReactivos: 1,
        bonoSolicitado: 0.5,
        evaluacionContinua: 5
      })
      .expect(201);
    expect(calificacionResp.body.calificacion.calificacionExamenFinalTexto).toBe('5');
    expect(calificacionResp.body.calificacion.calificacionParcialTexto).toBe('10');

    const pdfResp = await request(app)
      .get(`/api/examenes/generados/${examenId}/pdf`)
      .set(auth)
      .expect(200);
    expect(pdfResp.header['content-type']).toContain('application/pdf');

    const csvResp = await request(app)
      .get(`/api/analiticas/calificaciones-csv?periodoId=${periodoId}`)
      .set(auth)
      .expect(200);
    expect(csvResp.text).toContain('matricula,nombre,grupo,parcial1,parcial2,global,final,banderas');
  });
});
