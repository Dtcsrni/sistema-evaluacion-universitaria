/**
 * Modelo de temas del banco de preguntas.
 *
 * Nota:
 * - Se guarda por docente + materia (periodo).
 * - Se usa como catálogo para asignar preguntas a un tema vía selector.
 */
import { Schema, model, models } from 'mongoose';

const TemaBancoSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    periodoId: { type: Schema.Types.ObjectId, ref: 'Periodo', required: true },
    nombre: { type: String, required: true },
    clave: { type: String, required: true },
    activo: { type: Boolean, default: true },
    archivadoEn: { type: Date }
  },
  { timestamps: true, collection: 'bancoTemas' }
);

TemaBancoSchema.index({ docenteId: 1, periodoId: 1, clave: 1 }, { unique: true });

export const TemaBanco = models.TemaBanco ?? model('TemaBanco', TemaBancoSchema);
