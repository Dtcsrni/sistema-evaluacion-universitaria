import { describe, expect, it } from 'vitest';
import { generarVariante } from '../src/modulos/modulo_generacion_pdf/servicioVariantes';

describe('generarVariante', () => {
  it('crea ordenes con los mismos ids y opciones', () => {
    const preguntas = [
      { id: 'p1', enunciado: 'Q1', opciones: Array.from({ length: 5 }, (_v, i) => ({ texto: `O${i}`, esCorrecta: i === 0 })) },
      { id: 'p2', enunciado: 'Q2', opciones: Array.from({ length: 5 }, (_v, i) => ({ texto: `O${i}`, esCorrecta: i === 1 })) }
    ];

    const variante = generarVariante(preguntas);

    expect(variante.ordenPreguntas.sort()).toEqual(['p1', 'p2']);
    expect(Object.keys(variante.ordenOpcionesPorPregunta).sort()).toEqual(['p1', 'p2']);
    expect(variante.ordenOpcionesPorPregunta.p1.sort()).toEqual([0, 1, 2, 3, 4]);
    expect(variante.ordenOpcionesPorPregunta.p2.sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
