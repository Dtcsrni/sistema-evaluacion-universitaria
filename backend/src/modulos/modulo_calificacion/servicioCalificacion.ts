/**
 * Servicio de calificacion basado en fraccion exacta.
 */
import { calcularCalificacionExacta } from '../../compartido/utilidades/calculoCalificacion';

export function calcularCalificacion(
  aciertos: number,
  totalReactivos: number,
  bonoSolicitado = 0
) {
  return calcularCalificacionExacta(aciertos, totalReactivos, bonoSolicitado);
}
