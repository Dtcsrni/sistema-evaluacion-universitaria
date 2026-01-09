/**
 * Servicio de calificacion basado en fraccion exacta.
 */
import {
  calcularCalificacionExacta,
  calcularCalificacionGlobal,
  calcularCalificacionParcial
} from '../../compartido/utilidades/calculoCalificacion';

export function calcularCalificacion(
  aciertos: number,
  totalReactivos: number,
  bonoSolicitado = 0,
  evaluacionContinua = 0,
  proyecto = 0,
  tipoExamen: 'parcial' | 'global' = 'parcial'
) {
  const base = calcularCalificacionExacta(aciertos, totalReactivos, bonoSolicitado);
  const parcial = calcularCalificacionParcial(base.calificacionFinalTexto, evaluacionContinua);
  const global = calcularCalificacionGlobal(base.calificacionFinalTexto, proyecto);

  return {
    ...base,
    evaluacionContinuaTexto: tipoExamen === 'parcial' ? parcial.evaluacionContinuaTexto : undefined,
    proyectoTexto: tipoExamen === 'global' ? global.proyectoTexto : undefined,
    calificacionParcialTexto: tipoExamen === 'parcial' ? parcial.calificacionParcialTexto : undefined,
    calificacionGlobalTexto: tipoExamen === 'global' ? global.calificacionGlobalTexto : undefined
  };
}
