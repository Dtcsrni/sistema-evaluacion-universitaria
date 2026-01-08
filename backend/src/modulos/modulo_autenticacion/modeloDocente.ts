/**
 * Modelo Docente para autenticacion y ownership de datos.
 */
import { Schema, model } from 'mongoose';

const DocenteSchema = new Schema(
  {
    nombreCompleto: { type: String, required: true },
    correo: { type: String, required: true, unique: true, lowercase: true },
    hashContrasena: { type: String },
    activo: { type: Boolean, default: true },
    ultimoAcceso: { type: Date }
  },
  { timestamps: true, collection: 'docentes' }
);

export const Docente = model('Docente', DocenteSchema);
