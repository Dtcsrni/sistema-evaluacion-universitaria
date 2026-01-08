/**
 * Modelo de calificaciones con fraccion exacta.
 */
import { Schema, model } from 'mongoose';

const CalificacionSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    periodoId: { type: Schema.Types.ObjectId, ref: 'Periodo' },
    examenGeneradoId: { type: Schema.Types.ObjectId, ref: 'ExamenGenerado', required: true },
    alumnoId: { type: Schema.Types.ObjectId, ref: 'Alumno', required: true },
    totalReactivos: { type: Number, required: true },
    aciertos: { type: Number, required: true },
    fraccion: {
      numerador: { type: String, required: true },
      denominador: { type: String, required: true }
    },
    calificacionExamenTexto: { type: String, required: true },
    bonoTexto: { type: String, required: true },
    calificacionExamenFinalTexto: { type: String, required: true },
    retroalimentacion: { type: String },
    respuestasDetectadas: { type: Schema.Types.Mixed }
  },
  { timestamps: true, collection: 'calificaciones' }
);

export const Calificacion = model('Calificacion', CalificacionSchema);
