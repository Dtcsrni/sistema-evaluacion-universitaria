/**
 * Modelo Periodo academico.
 */
import { Schema, model, models } from 'mongoose';

export function normalizarNombrePeriodo(nombre: string): string {
  return String(nombre || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const PeriodoSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    nombre: { type: String, required: true, trim: true },
    nombreNormalizado: { type: String, required: true },
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, required: true },
    grupos: [{ type: String }],
    activo: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'periodos' }
);

PeriodoSchema.index({ docenteId: 1, nombreNormalizado: 1 });

PeriodoSchema.pre('validate', function (next) {
  const doc = this as unknown as { nombre?: unknown; nombreNormalizado?: unknown };
  doc.nombreNormalizado = normalizarNombrePeriodo(String(doc.nombre ?? ''));
  next();
});

export const Periodo = models.Periodo ?? model('Periodo', PeriodoSchema);
