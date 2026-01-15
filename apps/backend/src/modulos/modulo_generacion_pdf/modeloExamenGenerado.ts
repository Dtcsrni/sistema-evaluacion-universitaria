/**
 * Modelo de examenes generados con variante y PDF asociado.
 */
import { Schema, model, models } from 'mongoose';

const ExamenGeneradoSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    periodoId: { type: Schema.Types.ObjectId, ref: 'Periodo' },
    plantillaId: { type: Schema.Types.ObjectId, ref: 'ExamenPlantilla', required: true },
    alumnoId: { type: Schema.Types.ObjectId, ref: 'Alumno' },
    folio: { type: String, required: true, unique: true },
    estado: { type: String, enum: ['generado', 'entregado', 'calificado'], default: 'generado' },
    mapaVariante: { type: Schema.Types.Mixed, required: true },
    mapaOmr: { type: Schema.Types.Mixed },
    paginas: [{ numero: Number, qrTexto: String }],
    rutaPdf: { type: String },
    generadoEn: { type: Date, default: Date.now }
  },
  { timestamps: true, collection: 'examenesGenerados' }
);

export const ExamenGenerado = models.ExamenGenerado ?? model('ExamenGenerado', ExamenGeneradoSchema);
