/**
 * Modelo de eventos de uso (telemetria ligera) para mejorar UX.
 */
import { Schema, model, models } from 'mongoose';

const EventoUsoSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    sessionId: { type: String },
    pantalla: { type: String },
    accion: { type: String, required: true },
    exito: { type: Boolean },
    duracionMs: { type: Number },
    meta: { type: Schema.Types.Mixed }
  },
  { timestamps: true, collection: 'eventosUso' }
);

EventoUsoSchema.index({ docenteId: 1, createdAt: -1 });
EventoUsoSchema.index({ accion: 1, createdAt: -1 });

export const EventoUso = models.EventoUso ?? model('EventoUso', EventoUsoSchema);
