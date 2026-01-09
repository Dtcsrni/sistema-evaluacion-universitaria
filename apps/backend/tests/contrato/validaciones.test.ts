import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app';
import { tokenDocentePrueba } from '../utils/token';

describe('validaciones de payload', () => {
  const app = crearApp();

  it('rechaza registro sin campos requeridos', async () => {
    const respuesta = await request(app)
      .post('/api/autenticacion/registrar')
      .send({ correo: 'faltan@campos.test' })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('VALIDACION');
  });

  it('rechaza banco de preguntas con opciones invalidas', async () => {
    const token = tokenDocentePrueba();
    const respuesta = await request(app)
      .post('/api/banco-preguntas')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        enunciado: 'Pregunta invalida',
        opciones: [
          { texto: 'A', esCorrecta: true },
          { texto: 'B', esCorrecta: false }
        ]
      })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('VALIDACION');
  });

  it('rechaza calificacion sin examen', async () => {
    const token = tokenDocentePrueba();
    const respuesta = await request(app)
      .post('/api/calificaciones/calificar')
      .set({ Authorization: `Bearer ${token}` })
      .send({ aciertos: 1 })
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('VALIDACION');
  });
});
