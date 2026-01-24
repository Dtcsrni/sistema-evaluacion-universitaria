// Pruebas de escaneo QR asociado a un examen generado (OMR).
import request from 'supertest';
import QRCode from 'qrcode';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app';
import { cerrarMongoTest, conectarMongoTest, limpiarMongoTest } from '../utils/mongo';

describe('escaneo OMR: QR asociado a examen', () => {
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

  async function prepararExamenBasico(auth: { Authorization: string }) {
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
    const paginas = examenResp.body.examenGenerado.paginas as Array<{ numero: number; qrTexto: string }>;

    return { periodoId, alumnoId, examenId, folio, paginas };
  }

  it('lee el QR esperado de una imagen y lo asocia al folio/pagina', async () => {
    const token = await registrarDocente();
    const auth = { Authorization: `Bearer ${token}` };

    const { folio, paginas } = await prepararExamenBasico(auth);

    expect(Array.isArray(paginas)).toBe(true);
    expect(paginas.length).toBeGreaterThan(0);
    expect(paginas[0].numero).toBe(1);

    const qrEsperado = `EXAMEN:${folio}:P1`;
    expect(paginas[0].qrTexto).toBe(qrEsperado);

    const imagenBase64 = await QRCode.toDataURL(qrEsperado, { margin: 1, width: 800 });

    const resp = await request(app)
      .post('/api/omr/analizar')
      .set(auth)
      .send({
        folio,
        numeroPagina: 1,
        imagenBase64
      })
      .expect(200);

    const resultado = resp.body.resultado as { qrTexto?: string; advertencias: string[] };
    expect(resultado.qrTexto).toBe(qrEsperado);
    expect(resultado.advertencias).not.toContain('No se detecto QR en la imagen');
    expect(resultado.advertencias).not.toContain('El QR no coincide con el examen esperado');
  });

  it('si el QR corresponde a otro folio, lo detecta y advierte mismatch', async () => {
    const token = await registrarDocente();
    const auth = { Authorization: `Bearer ${token}` };

    const { folio } = await prepararExamenBasico(auth);

    const qrIncorrecto = 'OTROFOLIO';
    const imagenBase64 = await QRCode.toDataURL(qrIncorrecto, { margin: 1, width: 800 });

    const resp = await request(app)
      .post('/api/omr/analizar')
      .set(auth)
      .send({
        folio,
        numeroPagina: 1,
        imagenBase64
      })
      .expect(200);

    const resultado = resp.body.resultado as { qrTexto?: string; advertencias: string[] };
    expect(resultado.qrTexto).toBe(qrIncorrecto);
    expect(resultado.advertencias).toContain('El QR no coincide con el examen esperado');
  });
});
