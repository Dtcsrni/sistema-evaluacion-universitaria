/**
 * Modelo de banderas de revision (anti-trampa sugerida).
 */
import { Schema, model, models } from 'mongoose';

const BanderaRevisionSchema = new Schema(
  {
    examenGeneradoId: { type: Schema.Types.ObjectId, ref: 'ExamenGenerado', required: true },
    alumnoId: { type: Schema.Types.ObjectId, ref: 'Alumno', required: true },
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    tipo: { type: String, enum: ['similitud', 'patron', 'duplicado', 'otro'], required: true },
    severidad: { type: String, enum: ['baja', 'media', 'alta'], default: 'baja' },
    descripcion: { type: String },
    sugerencia: { type: String }
  },
  { timestamps: true, collection: 'banderasRevision' }
);

export const BanderaRevision = models.BanderaRevision ?? model('BanderaRevision', BanderaRevisionSchema);
