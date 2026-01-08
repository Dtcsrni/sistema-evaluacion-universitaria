/**
 * Servicio de escaneo OMR (placeholder para pipeline de vision).
 */
export type ResultadoOmr = {
  respuestasDetectadas: Array<{ numeroPregunta: number; opcion: string | null }>;
  advertencias: string[];
};

export async function analizarOmr(_imagenBase64: string): Promise<ResultadoOmr> {
  return {
    respuestasDetectadas: [],
    advertencias: ['Pipeline OMR pendiente de implementar']
  };
}
