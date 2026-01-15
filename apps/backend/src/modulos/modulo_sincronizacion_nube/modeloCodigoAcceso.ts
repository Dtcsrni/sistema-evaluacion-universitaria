/**
 * Modelo de codigo de acceso para portal alumno.
 *
 * Flujo:
 * - El backend genera un codigo por periodo y docente.
 * - El alumno usa el codigo + matricula en el portal cloud para crear sesion.
 * - El codigo es de un solo uso y expira.
 */
import { Schema, model, models } from 'mongoose';

const CodigoAccesoSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    periodoId: { type: Schema.Types.ObjectId, ref: 'Periodo', required: true },
    codigo: { type: String, required: true },
    expiraEn: { type: Date, required: true },
    usado: { type: Boolean, default: false }
  },
  { timestamps: true, collection: 'codigosAcceso' }
);

CodigoAccesoSchema.index({ codigo: 1 }, { unique: true });

export const CodigoAcceso = models.CodigoAcceso ?? model('CodigoAcceso', CodigoAccesoSchema);
