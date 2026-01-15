/**
 * Controlador de autenticacion docente.
 */
import type { Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { Docente } from './modeloDocente';
import { crearHash, compararContrasena } from './servicioHash';
import { crearTokenDocente } from './servicioTokens';
import { obtenerDocenteId, type SolicitudDocente } from './middlewareAutenticacion';
import { cerrarSesionDocente, emitirSesionDocente, refrescarSesionDocente } from './servicioSesiones';
import { verificarCredencialGoogle } from './servicioGoogle';

export async function registrarDocente(req: Request, res: Response) {
  const { nombreCompleto, correo, contrasena } = req.body;
  const existente = await Docente.findOne({ correo: correo.toLowerCase() }).lean();
  if (existente) {
    throw new ErrorAplicacion('DOCENTE_EXISTE', 'El correo ya esta registrado', 409);
  }

  const hashContrasena = await crearHash(contrasena);
  const docente = await Docente.create({
    nombreCompleto,
    correo: correo.toLowerCase(),
    hashContrasena,
    activo: true,
    ultimoAcceso: new Date()
  });

  await emitirSesionDocente(res, String(docente._id));
  const token = crearTokenDocente({ docenteId: String(docente._id) });
  res.status(201).json({ token, docente: { id: docente._id, nombreCompleto: docente.nombreCompleto, correo: docente.correo } });
}

export async function ingresarDocente(req: Request, res: Response) {
  const { correo, contrasena } = req.body;
  const docente = await Docente.findOne({ correo: correo.toLowerCase() });
  if (!docente || !docente.hashContrasena) {
    throw new ErrorAplicacion('CREDENCIALES_INVALIDAS', 'Credenciales invalidas', 401);
  }
  if (!docente.activo) {
    throw new ErrorAplicacion('DOCENTE_INACTIVO', 'Docente inactivo', 403);
  }

  const ok = await compararContrasena(contrasena, docente.hashContrasena);
  if (!ok) {
    throw new ErrorAplicacion('CREDENCIALES_INVALIDAS', 'Credenciales invalidas', 401);
  }

  docente.ultimoAcceso = new Date();
  await docente.save();

  await emitirSesionDocente(res, String(docente._id));
  const token = crearTokenDocente({ docenteId: String(docente._id) });
  res.json({ token, docente: { id: docente._id, nombreCompleto: docente.nombreCompleto, correo: docente.correo } });
}

export async function ingresarDocenteGoogle(req: Request, res: Response) {
  const { credential } = req.body as { credential?: unknown };
  const perfil = await verificarCredencialGoogle(String(credential ?? ''));

  const docente = await Docente.findOne({ correo: perfil.correo });
  if (!docente) {
    throw new ErrorAplicacion('DOCENTE_NO_REGISTRADO', 'No existe una cuenta de docente para ese correo', 401);
  }
  if (!docente.activo) {
    throw new ErrorAplicacion('DOCENTE_INACTIVO', 'Docente inactivo', 403);
  }

  // Si ya esta vinculado, exige el mismo subject. Si no, vincula al primer login.
  if (docente.googleSub && docente.googleSub !== perfil.sub) {
    throw new ErrorAplicacion('GOOGLE_SUB_MISMATCH', 'Cuenta Google no coincide con el docente', 401);
  }
  if (!docente.googleSub) {
    docente.googleSub = perfil.sub;
  }

  docente.ultimoAcceso = new Date();
  await docente.save();

  await emitirSesionDocente(res, String(docente._id));
  const token = crearTokenDocente({ docenteId: String(docente._id) });
  res.json({ token, docente: { id: docente._id, nombreCompleto: docente.nombreCompleto, correo: docente.correo } });
}

export async function refrescarDocente(req: Request, res: Response) {
  const docenteId = await refrescarSesionDocente(req, res);
  const docente = await Docente.findById(docenteId);
  if (!docente || !docente.activo) {
    await cerrarSesionDocente(req, res);
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sesion requerida', 401);
  }

  docente.ultimoAcceso = new Date();
  await docente.save();

  const token = crearTokenDocente({ docenteId: String(docente._id) });
  res.json({ token });
}

export async function salirDocente(req: Request, res: Response) {
  await cerrarSesionDocente(req, res);
  res.status(204).end();
}

export async function perfilDocente(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const docente = await Docente.findById(docenteId).lean();
  if (!docente) {
    throw new ErrorAplicacion('DOCENTE_NO_ENCONTRADO', 'Docente no encontrado', 404);
  }
  res.json({ docente: { id: docente._id, nombreCompleto: docente.nombreCompleto, correo: docente.correo } });
}
