/**
 * Controlador de banco de preguntas.
 */
import type { Request, Response } from 'express';
import { BancoPregunta } from './modeloBancoPregunta';

export async function listarBancoPreguntas(req: Request, res: Response) {
  const filtro: Record<string, string> = {};
  if (req.query.docenteId) filtro.docenteId = String(req.query.docenteId);
  if (req.query.periodoId) filtro.periodoId = String(req.query.periodoId);

  const preguntas = await BancoPregunta.find(filtro).limit(200).lean();
  res.json({ preguntas });
}

export async function crearPregunta(req: Request, res: Response) {
  const { docenteId, periodoId, tema, enunciado, imagenUrl, opciones } = req.body;

  const pregunta = await BancoPregunta.create({
    docenteId,
    periodoId,
    tema,
    versionActual: 1,
    versiones: [
      {
        numeroVersion: 1,
        enunciado,
        imagenUrl,
        opciones
      }
    ]
  });

  res.status(201).json({ pregunta });
}
