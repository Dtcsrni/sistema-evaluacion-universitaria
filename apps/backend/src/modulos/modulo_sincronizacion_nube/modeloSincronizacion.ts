/**
 * Modelo de sincronizacion local -> cloud.
 *
 * Se usa como bitacora/auditoria:
 * - quien (docenteId)
 * - que (tipo)
 * - resultado (estado)
 * - cuando (ejecutadoEn + timestamps)
 */
import { Schema, model, models } from 'mongoose';

const SincronizacionSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    estado: { type: String, enum: ['pendiente', 'exitoso', 'fallido'], default: 'pendiente' },
    tipo: { type: String, default: 'publicacion' },
    detalles: { type: Schema.Types.Mixed },
    ejecutadoEn: { type: Date }
  },
  { timestamps: true, collection: 'sincronizaciones' }
);

export const Sincronizacion = models.Sincronizacion ?? model('Sincronizacion', SincronizacionSchema);
