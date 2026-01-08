/**
 * Modelo Periodo academico.
 */
import { Schema, model } from 'mongoose';

const PeriodoSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    nombre: { type: String, required: true },
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, required: true },
    grupos: [{ type: String }],
    activo: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'periodos' }
);

export const Periodo = model('Periodo', PeriodoSchema);
