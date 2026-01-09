/**
 * Modelo de codigo de acceso para portal alumno.
 */
import { Schema, model } from 'mongoose';

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

export const CodigoAcceso = model('CodigoAcceso', CodigoAccesoSchema);
