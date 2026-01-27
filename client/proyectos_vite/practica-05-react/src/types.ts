//Este archivo define los tipos de dominio a utilizar
//-EstadoTarea: es una union que solo permite tres valores especificos
//-Tarea: definir la forma exacta de cada actividad

//Solo e permiten 3 estados. Si se incluye un estado no especificado, 
//typescript lo indica con un error

export type EstadoTarea = 'pendiente' | 'en-progreso' | 'completada';

export interface Tarea {
  id: number;
  nombre: string;
  estado: EstadoTarea;
}