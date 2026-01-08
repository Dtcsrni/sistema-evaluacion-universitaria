/**
 * Calculo exacto de calificaciones sin redondeos.
 */
import Decimal from 'decimal.js';

export type ResultadoCalificacion = {
  numerador: string;
  denominador: string;
  calificacionTexto: string;
  bonoTexto: string;
  calificacionFinalTexto: string;
};

export function calcularCalificacionParcial(
  calificacionExamenTexto: string,
  evaluacionContinua: number
) {
  const examen = new Decimal(calificacionExamenTexto || 0);
  const continua = Decimal.min(new Decimal(5), new Decimal(evaluacionContinua || 0));
  const total = Decimal.min(new Decimal(10), examen.add(continua));

  return {
    evaluacionContinuaTexto: continua.toString(),
    calificacionParcialTexto: total.toString()
  };
}

export function calcularCalificacionExacta(
  aciertos: number,
  totalReactivos: number,
  bonoSolicitado = 0
): ResultadoCalificacion {
  const numerador = new Decimal(aciertos).mul(5);
  const denominador = new Decimal(totalReactivos || 1);
  const calificacionBase = numerador.div(denominador);
  const bono = Decimal.min(new Decimal(0.5), new Decimal(bonoSolicitado || 0));
  const calificacionFinal = Decimal.min(new Decimal(5), calificacionBase.add(bono));

  return {
    numerador: numerador.toFixed(0),
    denominador: denominador.toFixed(0),
    calificacionTexto: calificacionBase.toString(),
    bonoTexto: bono.toString(),
    calificacionFinalTexto: calificacionFinal.toString()
  };
}
