/**
 * Sesiones persistentes de docente (refresh tokens rotatorios).
 *
 * Se almacena SOLO un hash del token para evitar leaks.
 * TTL: Mongo elimina documentos expirados automaticamente via `expiraEn`.
 */
import { Schema, model, models } from 'mongoose';

const SesionDocenteSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    creadoEn: { type: Date, required: true, default: () => new Date() },
    ultimoUso: { type: Date },
    expiraEn: { type: Date, required: true, index: { expires: 0 } },
    revocadoEn: { type: Date }
  },
  { timestamps: false, collection: 'sesiones_docente' }
);

export const SesionDocente = models.SesionDocente ?? model('SesionDocente', SesionDocenteSchema);
