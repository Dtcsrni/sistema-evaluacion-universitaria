/**
 * Modelo de examenes plantilla (parcial/global).
 */
import { Schema, model, models } from 'mongoose';

const ExamenPlantillaSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    periodoId: { type: Schema.Types.ObjectId, ref: 'Periodo' },
    tipo: { type: String, enum: ['parcial', 'global'], required: true },
    titulo: { type: String, required: true },
    instrucciones: { type: String },
    // Nuevo: el tamaño del examen se define por páginas.
    numeroPaginas: { type: Number, required: true, default: 1 },
    // Legacy (deprecado): se conserva para no romper plantillas existentes.
    totalReactivos: { type: Number },
    preguntasIds: [{ type: Schema.Types.ObjectId, ref: 'BancoPregunta' }],
    temas: [{ type: String }],
    archivadoEn: { type: Date },
    configuracionPdf: {
      margenMm: { type: Number, default: 10 },
      layout: { type: String, default: 'parcial' }
    }
  },
  { timestamps: true, collection: 'examenesPlantilla' }
);

export const ExamenPlantilla = models.ExamenPlantilla ?? model('ExamenPlantilla', ExamenPlantillaSchema);
