/**
 * Modelo de sincronizacion local -> cloud.
 */
import { Schema, model } from 'mongoose';

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

export const Sincronizacion = model('Sincronizacion', SincronizacionSchema);
