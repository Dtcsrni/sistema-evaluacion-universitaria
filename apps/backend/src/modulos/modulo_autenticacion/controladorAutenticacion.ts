/**
 * Controlador de autenticacion docente.
 */
import type { Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { esCorreoDeDominioPermitido } from '../../compartido/utilidades/correo';
import { configuracion } from '../../configuracion';
import { Docente } from './modeloDocente';
import { crearHash, compararContrasena } from './servicioHash';
import { crearTokenDocente } from './servicioTokens';
import { obtenerDocenteId, type SolicitudDocente } from './middlewareAutenticacion';
import { cerrarSesionDocente, emitirSesionDocente, refrescarSesionDocente, revocarSesionesDocente } from './servicioSesiones';
import { verificarCredencialGoogle } from './servicioGoogle';

export async function registrarDocente(req: Request, res: Response) {
  const { nombreCompleto, correo, contrasena } = req.body;
  const correoFinal = String(correo || '').toLowerCase();

  if (
    Array.isArray(configuracion.dominiosCorreoPermitidos) &&
    configuracion.dominiosCorreoPermitidos.length > 0 &&
    !esCorreoDeDominioPermitido(correoFinal, configuracion.dominiosCorreoPermitidos)
  ) {
    throw new ErrorAplicacion(
      'DOMINIO_CORREO_NO_PERMITIDO',
      'Correo no permitido por politicas. Usa tu correo institucional.',
      403
    );
  }

  const existente = await Docente.findOne({ correo: correoFinal }).lean();
  if (existente) {
    throw new ErrorAplicacion('DOCENTE_EXISTE', 'El correo ya esta registrado', 409);
  }

  const hashContrasena = await crearHash(contrasena);
  const docente = await Docente.create({
    nombreCompleto,
    correo: correoFinal,
    hashContrasena,
    activo: true,
    ultimoAcceso: new Date()
  });

  await emitirSesionDocente(res, String(docente._id));
  const token = crearTokenDocente({ docenteId: String(docente._id) });
  res.status(201).json({ token, docente: { id: docente._id, nombreCompleto: docente.nombreCompleto, correo: docente.correo } });
}

export async function registrarDocenteGoogle(req: Request, res: Response) {
  const { credential, nombreCompleto, contrasena } = req.body as {
    credential?: unknown;
    nombreCompleto?: unknown;
    contrasena?: unknown;
  };

  const perfil = await verificarCredencialGoogle(String(credential ?? ''));
  const correo = perfil.correo.toLowerCase();

  const existente = await Docente.findOne({ correo }).lean();
  if (existente) {
    throw new ErrorAplicacion('DOCENTE_EXISTE', 'El correo ya esta registrado', 409);
  }

  const contrasenaStr = typeof contrasena === 'string' ? contrasena : '';
  const hashContrasena = contrasenaStr.trim() ? await crearHash(contrasenaStr) : undefined;
  const docente = await Docente.create({
    nombreCompleto: String(nombreCompleto ?? perfil.nombreCompleto ?? '').trim(),
    correo,
    ...(hashContrasena ? { hashContrasena } : {}),
    googleSub: perfil.sub,
    activo: true,
    ultimoAcceso: new Date()
  });

  await emitirSesionDocente(res, String(docente._id));
  const token = crearTokenDocente({ docenteId: String(docente._id) });
  res.status(201).json({ token, docente: { id: docente._id, nombreCompleto: docente.nombreCompleto, correo: docente.correo } });
}

export async function ingresarDocente(req: Request, res: Response) {
  const { correo, contrasena } = req.body;
  const correoFinal = String(correo || '').toLowerCase();

  if (
    Array.isArray(configuracion.dominiosCorreoPermitidos) &&
    configuracion.dominiosCorreoPermitidos.length > 0 &&
    !esCorreoDeDominioPermitido(correoFinal, configuracion.dominiosCorreoPermitidos)
  ) {
    throw new ErrorAplicacion(
      'DOMINIO_CORREO_NO_PERMITIDO',
      'Correo no permitido por politicas. Usa tu correo institucional.',
      403
    );
  }

  const docente = await Docente.findOne({ correo: correoFinal });
  if (!docente) {
    throw new ErrorAplicacion('CREDENCIALES_INVALIDAS', 'Credenciales invalidas', 401);
  }
  if (!docente.hashContrasena) {
    throw new ErrorAplicacion(
      'DOCENTE_SIN_CONTRASENA',
      'Esta cuenta no tiene contrasena. Ingresa con Google o define una contrasena.',
      401
    );
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

export async function recuperarContrasenaGoogle(req: Request, res: Response) {
  const { credential, contrasenaNueva } = req.body as { credential?: unknown; contrasenaNueva?: unknown };
  const perfil = await verificarCredencialGoogle(String(credential ?? ''));

  const docente = await Docente.findOne({ correo: perfil.correo });
  if (!docente) {
    throw new ErrorAplicacion('DOCENTE_NO_ENCONTRADO', 'Docente no encontrado', 404);
  }
  if (!docente.activo) {
    throw new ErrorAplicacion('DOCENTE_INACTIVO', 'Docente inactivo', 403);
  }

  // Requiere cuenta Google vinculada y que coincida con el subject.
  if (!docente.googleSub) {
    throw new ErrorAplicacion('GOOGLE_NO_VINCULADO', 'La cuenta no tiene Google vinculado', 401);
  }
  if (docente.googleSub !== perfil.sub) {
    throw new ErrorAplicacion('GOOGLE_SUB_MISMATCH', 'Cuenta Google no coincide con el docente', 401);
  }

  docente.hashContrasena = await crearHash(String(contrasenaNueva ?? ''));
  docente.ultimoAcceso = new Date();
  await docente.save();

  // Revoca todas las sesiones previas y emite una nueva.
  await revocarSesionesDocente(String(docente._id));
  await emitirSesionDocente(res, String(docente._id));

  const token = crearTokenDocente({ docenteId: String(docente._id) });
  res.json({ token });
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

export async function definirContrasenaDocente(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const { contrasenaNueva, contrasenaActual, credential } = req.body as {
    contrasenaNueva?: unknown;
    contrasenaActual?: unknown;
    credential?: unknown;
  };

  const docente = await Docente.findById(docenteId);
  if (!docente) {
    throw new ErrorAplicacion('DOCENTE_NO_ENCONTRADO', 'Docente no encontrado', 404);
  }
  if (!docente.activo) {
    throw new ErrorAplicacion('DOCENTE_INACTIVO', 'Docente inactivo', 403);
  }

  const contrasenaActualStr = typeof contrasenaActual === 'string' ? contrasenaActual : '';
  const credentialStr = typeof credential === 'string' ? credential : '';

  // Reautenticacion requerida para una accion sensible.
  // - Si existe password, se puede validar con contrasenaActual.
  // - Si existe Google vinculado, se puede validar con credential (ID token).
  let reautenticado = false;

  if (docente.hashContrasena && contrasenaActualStr.trim()) {
    const ok = await compararContrasena(contrasenaActualStr, docente.hashContrasena);
    if (!ok) {
      throw new ErrorAplicacion('CREDENCIALES_INVALIDAS', 'Credenciales invalidas', 401);
    }
    reautenticado = true;
  }

  if (!reautenticado && docente.googleSub && credentialStr.trim()) {
    const perfil = await verificarCredencialGoogle(credentialStr);
    if (perfil.correo !== String(docente.correo).toLowerCase()) {
      throw new ErrorAplicacion('GOOGLE_CUENTA_NO_COINCIDE', 'Cuenta Google no coincide con el docente', 401);
    }
    if (perfil.sub !== docente.googleSub) {
      throw new ErrorAplicacion('GOOGLE_SUB_MISMATCH', 'Cuenta Google no coincide con el docente', 401);
    }
    reautenticado = true;
  }

  if (!reautenticado) {
    throw new ErrorAplicacion(
      'REAUTENTICACION_REQUERIDA',
      'Reautenticacion requerida para definir o cambiar contrasena',
      401
    );
  }

  docente.hashContrasena = await crearHash(String(contrasenaNueva ?? ''));
  await docente.save();

  res.status(204).end();
}

export async function perfilDocente(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const docente = await Docente.findById(docenteId).lean();
  if (!docente) {
    throw new ErrorAplicacion('DOCENTE_NO_ENCONTRADO', 'Docente no encontrado', 404);
  }
  res.json({
    docente: {
      id: docente._id,
      nombreCompleto: docente.nombreCompleto,
      correo: docente.correo,
      tieneContrasena: Boolean(docente.hashContrasena),
      tieneGoogle: Boolean(docente.googleSub)
    }
  });
}
