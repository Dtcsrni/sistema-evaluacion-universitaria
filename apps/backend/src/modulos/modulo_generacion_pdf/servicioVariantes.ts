/**
 * Genera variantes aleatorias de preguntas y opciones.
 */
import { barajar } from '../../compartido/utilidades/aleatoriedad';

export type OpcionPregunta = {
  texto: string;
  esCorrecta: boolean;
};

export type PreguntaBase = {
  id: string;
  enunciado: string;
  imagenUrl?: string;
  opciones: OpcionPregunta[];
};

export type MapaVariante = {
  ordenPreguntas: string[];
  ordenOpcionesPorPregunta: Record<string, number[]>;
};

export function generarVariante(preguntas: PreguntaBase[]): MapaVariante {
  const idsPreguntas = preguntas.map((pregunta) => pregunta.id);
  const ordenPreguntas = barajar(idsPreguntas);
  const ordenOpcionesPorPregunta: Record<string, number[]> = {};

  preguntas.forEach((pregunta) => {
    const indices = Array.from({ length: pregunta.opciones.length }, (_v, i) => i);
    ordenOpcionesPorPregunta[pregunta.id] = barajar(indices);
  });

  return { ordenPreguntas, ordenOpcionesPorPregunta };
}
