import { describe, expect, it } from 'vitest';
import {
  calcularCalificacionExacta,
  calcularCalificacionGlobal,
  calcularCalificacionParcial
} from '../src/compartido/utilidades/calculoCalificacion';
import { calcularCalificacion } from '../src/modulos/modulo_calificacion/servicioCalificacion';

describe('calculoCalificacion', () => {
  it('respeta bono maximo y sin redondeo', () => {
    const resultado = calcularCalificacionExacta(7, 10, 1);
    expect(resultado.calificacionTexto).toBe('3.5');
    expect(resultado.bonoTexto).toBe('0.5');
    expect(resultado.calificacionFinalTexto).toBe('4');
  });

  it('aplica topes en parcial y global', () => {
    const parcial = calcularCalificacionParcial('5', 5);
    const global = calcularCalificacionGlobal('5', 7);

    expect(parcial.calificacionParcialTexto).toBe('10');
    expect(global.calificacionGlobalTexto).toBe('10');
  });

  it('solo expone campos segun el tipo de examen', () => {
    const parcial = calcularCalificacion(8, 10, 0, 5, 0, 'parcial');
    const global = calcularCalificacion(8, 10, 0, 0, 5, 'global');

    expect(parcial.calificacionParcialTexto).toBeDefined();
    expect(parcial.calificacionGlobalTexto).toBeUndefined();
    expect(global.calificacionGlobalTexto).toBeDefined();
    expect(global.calificacionParcialTexto).toBeUndefined();
  });
});
