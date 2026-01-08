/**
 * Controlador de alumnos.
 */
import type { Request, Response } from 'express';
import { Alumno } from './modeloAlumno';

export async function listarAlumnos(req: Request, res: Response) {
  const filtro: Record<string, string> = {};
  if (req.query.docenteId) filtro.docenteId = String(req.query.docenteId);
  if (req.query.periodoId) filtro.periodoId = String(req.query.periodoId);

  const alumnos = await Alumno.find(filtro).limit(200).lean();
  res.json({ alumnos });
}

export async function crearAlumno(req: Request, res: Response) {
  const alumno = await Alumno.create(req.body);
  res.status(201).json({ alumno });
}
