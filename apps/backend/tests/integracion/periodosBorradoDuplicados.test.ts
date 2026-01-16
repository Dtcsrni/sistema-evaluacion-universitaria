// Pruebas de periodos: deduplicacion y borrado en cascada.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app';
import { cerrarMongoTest, conectarMongoTest, limpiarMongoTest } from '../utils/mongo';

describe('periodos (materias)', () => {
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

  async function crearPeriodo(token: string, nombre: string) {
    const periodoResp = await request(app)
      .post('/api/periodos')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        nombre,
        fechaInicio: '2025-01-01',
        fechaFin: '2025-01-30'
      })
      .expect(201);
    return periodoResp.body.periodo._id as string;
  }

  async function crearAlumno(token: string, periodoId: string) {
    const alumnoResp = await request(app)
      .post('/api/alumnos')
      .set({ Authorization: `Bearer ${token}` })
      .send({ periodoId, matricula: 'A001', nombreCompleto: 'Alumno A', grupo: 'G1' })
      .expect(201);
    return alumnoResp.body.alumno._id as string;
  }

  async function crearPregunta(token: string, periodoId: string) {
    const preguntaResp = await request(app)
      .post('/api/banco-preguntas')
      .set({ Authorization: `Bearer ${token}` })
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
    return preguntaResp.body.pregunta._id as string;
  }

  async function crearPlantilla(token: string, periodoId: string, preguntaId: string) {
    const plantillaResp = await request(app)
      .post('/api/examenes/plantillas')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        periodoId,
        tipo: 'parcial',
        titulo: 'Plantilla A',
        totalReactivos: 1,
        preguntasIds: [preguntaId]
      })
      .expect(201);
    return plantillaResp.body.plantilla._id as string;
  }

  async function generarExamen(token: string, plantillaId: string) {
    const examenResp = await request(app)
      .post('/api/examenes/generados')
      .set({ Authorization: `Bearer ${token}` })
      .send({ plantillaId })
      .expect(201);
    return examenResp.body.examenGenerado._id as string;
  }

  it('evita crear dos materias con el mismo nombre (normalizado)', async () => {
    const token = await registrar('docente-dup@local.test');

    await crearPeriodo(token, 'Algebra I');

    const resp = await request(app)
      .post('/api/periodos')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        nombre: '  algebra   i  ',
        fechaInicio: '2025-01-01',
        fechaFin: '2025-01-30'
      })
      .expect(409);

    expect(resp.body.error?.codigo ?? resp.body.codigo).toBe('PERIODO_DUPLICADO');
  });

  it('borra una materia y todo lo asociado (cascada)', async () => {
    const token = await registrar('docente-del@local.test');

    const periodoId = await crearPeriodo(token, 'Materia A');
    await crearAlumno(token, periodoId);
    const preguntaId = await crearPregunta(token, periodoId);
    const plantillaId = await crearPlantilla(token, periodoId, preguntaId);
    await generarExamen(token, plantillaId);

    const borrar = await request(app)
      .delete(`/api/periodos/${periodoId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(borrar.body.ok).toBe(true);

    const periodos = await request(app)
      .get('/api/periodos')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(periodos.body.periodos).toEqual([]);

    const alumnos = await request(app)
      .get('/api/alumnos')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(alumnos.body.alumnos).toEqual([]);

    const banco = await request(app)
      .get('/api/banco-preguntas')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(banco.body.preguntas).toEqual([]);

    const plantillas = await request(app)
      .get('/api/examenes/plantillas')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(plantillas.body.plantillas).toEqual([]);

    const generados = await request(app)
      .get('/api/examenes/generados')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(generados.body.examenes).toEqual([]);
  });
});
