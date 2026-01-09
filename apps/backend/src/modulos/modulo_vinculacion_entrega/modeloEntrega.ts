/**
 * Modelo de entregas (vinculacion examen-alumno).
 */
import { Schema, model } from 'mongoose';

const EntregaSchema = new Schema(
  {
    examenGeneradoId: { type: Schema.Types.ObjectId, ref: 'ExamenGenerado', required: true },
    alumnoId: { type: Schema.Types.ObjectId, ref: 'Alumno', required: true },
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    estado: { type: String, enum: ['pendiente', 'entregado'], default: 'pendiente' },
    fechaEntrega: { type: Date }
  },
  { timestamps: true, collection: 'entregas' }
);

export const Entrega = model('Entrega', EntregaSchema);
