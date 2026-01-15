/**
 * Modelo Alumno.
 */
import { Schema, model, models } from 'mongoose';

const AlumnoSchema = new Schema(
  {
    docenteId: { type: Schema.Types.ObjectId, ref: 'Docente', required: true },
    periodoId: { type: Schema.Types.ObjectId, ref: 'Periodo', required: true },
    matricula: { type: String, required: true },
    nombres: { type: String },
    apellidos: { type: String },
    nombreCompleto: { type: String, required: true },
    correo: { type: String },
    grupo: { type: String },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'alumnos' }
);

AlumnoSchema.index({ docenteId: 1, periodoId: 1, matricula: 1 }, { unique: true });

export const Alumno = models.Alumno ?? model('Alumno', AlumnoSchema);
