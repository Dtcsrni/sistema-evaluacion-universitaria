/**
 * Resultado publicado para portal alumno.
 */
import { Schema, model } from 'mongoose';

const ResultadoAlumnoSchema = new Schema(
  {
    periodoId: { type: Schema.Types.ObjectId, required: true },
    docenteId: { type: Schema.Types.ObjectId, required: true },
    alumnoId: { type: Schema.Types.ObjectId, required: true },
    matricula: { type: String, required: true },
    nombreCompleto: { type: String, required: true },
    grupo: { type: String },
    folio: { type: String, required: true },
    tipoExamen: { type: String, enum: ['parcial', 'global'], required: true },
    calificacionExamenFinalTexto: { type: String, required: true },
    calificacionParcialTexto: { type: String },
    calificacionGlobalTexto: { type: String },
    evaluacionContinuaTexto: { type: String },
    proyectoTexto: { type: String },
    banderas: { type: [Schema.Types.Mixed], default: [] },
    pdfComprimidoBase64: { type: String },
    publicadoEn: { type: Date, default: Date.now }
  },
  { timestamps: true, collection: 'resultadosAlumno' }
);

ResultadoAlumnoSchema.index({ folio: 1 }, { unique: true });
ResultadoAlumnoSchema.index({ matricula: 1, periodoId: 1 });

export const ResultadoAlumno = model('ResultadoAlumno', ResultadoAlumnoSchema);
