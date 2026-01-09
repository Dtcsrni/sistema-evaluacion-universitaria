/**
 * Modelo de banco de preguntas con versionado.
 */
import { Schema, model } from 'mongoose';

const OpcionSchema = new Schema(
  {
    texto: { type: String, required: true },
    esCorrecta: { type: Boolean, required: true }
  },
  { _id: false }
);

const VersionPreguntaSchema = new Schema(
  {
    numeroVersion: { type: Number, required: true },
    enunciado: { type: String, required: true },
    imagenUrl: { type: String },
    opciones: {
      type: [OpcionSchema],
      required: true,
      validate: {
        validator(opciones: { esCorrecta: boolean }[]) {
          const correctas = opciones.filter((opcion) => opcion.esCorrecta).length;
          return opciones.length === 5 && correctas === 1;
        },
        message: 'Cada pregunta debe tener 5 opciones y 1 correcta'
      }
    }
  },
  { _id: false }
);

const BancoPreguntaSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    periodoId: { type: Schema.Types.ObjectId, ref: 'Periodo' },
    tema: { type: String },
    activo: { type: Boolean, default: true },
    versionActual: { type: Number, default: 1 },
    versiones: { type: [VersionPreguntaSchema], required: true }
  },
  { timestamps: true, collection: 'bancoPreguntas' }
);

export const BancoPregunta = model('BancoPregunta', BancoPreguntaSchema);
