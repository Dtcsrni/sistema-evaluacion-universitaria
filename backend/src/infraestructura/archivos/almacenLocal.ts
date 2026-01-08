/**
 * Almacenamiento local para PDFs e imagenes (uso docente local).
 */
import { promises as fs } from 'fs';
import path from 'path';

const carpetaBase = path.join(process.cwd(), 'data', 'examenes');

async function asegurarCarpeta() {
  await fs.mkdir(carpetaBase, { recursive: true });
}

export async function guardarPdfExamen(nombreArchivo: string, buffer: Buffer) {
  await asegurarCarpeta();
  const rutaCompleta = path.join(carpetaBase, nombreArchivo);
  await fs.writeFile(rutaCompleta, buffer);
  return rutaCompleta;
}
