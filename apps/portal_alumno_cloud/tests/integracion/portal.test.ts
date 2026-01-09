import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'zlib';
import { crearApp } from '../../src/app';
import { cerrarMongoTest, conectarMongoTest, limpiarMongoTest } from '../utils/mongo';

describe('portal alumno', () => {
  const app = crearApp();
  const apiKey = process.env.PORTAL_API_KEY ?? 'TEST_PORTAL_KEY';

  beforeAll(async () => {
    await conectarMongoTest();
  });

  beforeEach(async () => {
    await limpiarMongoTest();
  });

  afterAll(async () => {
    await cerrarMongoTest();
  });

  it('sincroniza y permite consultar resultados', async () => {
    const periodoId = '507f1f77bcf86cd799439011';
    const alumnoId = '507f1f77bcf86cd799439012';
    const docenteId = '507f1f77bcf86cd799439013';
    const examenId = '507f1f77bcf86cd799439014';
    const folio = 'FOLIO01';
    const pdfComprimidoBase64 = gzipSync(Buffer.from('%PDF-1.4 prueba')).toString('base64');

    await request(app)
      .post('/api/portal/sincronizar')
      .set({ 'x-api-key': apiKey })
      .send({
        periodo: { _id: periodoId, nombre: 'Periodo 2025' },
        alumnos: [{ _id: alumnoId, matricula: '2025-001', nombreCompleto: 'Alumno Uno', grupo: 'A' }],
        calificaciones: [
          {
            docenteId,
            alumnoId,
            examenGeneradoId: examenId,
            tipoExamen: 'parcial',
            calificacionExamenFinalTexto: '4',
            calificacionParcialTexto: '9'
          }
        ],
        examenes: [{ examenGeneradoId: examenId, folio, pdfComprimidoBase64 }],
        banderas: [{ examenGeneradoId: examenId, tipo: 'similitud' }],
        codigoAcceso: { codigo: 'ABC123', expiraEn: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
      })
      .expect(200);

    const ingreso = await request(app)
      .post('/api/portal/ingresar')
      .send({ codigo: 'ABC123', matricula: '2025-001' })
      .expect(200);

    const token = ingreso.body.token as string;
    expect(token).toBeTruthy();

    const resultados = await request(app)
      .get('/api/portal/resultados')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(resultados.body.resultados).toHaveLength(1);
    expect(resultados.body.resultados[0].folio).toBe(folio);

    const pdf = await request(app)
      .get(`/api/portal/examen/${folio}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(pdf.header['content-type']).toContain('application/pdf');
  });

  it('requiere api key para sincronizar', async () => {
    const respuesta = await request(app)
      .post('/api/portal/sincronizar')
      .send({ periodo: {}, alumnos: [], calificaciones: [] })
      .expect(401);

    expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
  });
});
