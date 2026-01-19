/**
 * Controlador de banco de preguntas.
 *
 * Contrato:
 * - El banco de preguntas es multi-tenant por `docenteId`.
 * - Al crear una pregunta se inicializa con `versionActual = 1` y una sola version.
 */
import type { Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { obtenerDocenteId } from '../modulo_autenticacion/middlewareAutenticacion';
import type { SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { Periodo } from '../modulo_alumnos/modeloPeriodo';
import { BancoPregunta } from './modeloBancoPregunta';
import { TemaBanco } from './modeloTemaBanco';
import { ExamenPlantilla } from '../modulo_generacion_pdf/modeloExamenPlantilla';

function normalizarTema(valor: unknown): string | undefined {
  const texto = String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  return texto ? texto : undefined;
}

function claveTema(valor: string): string {
  return String(valor).trim().toLowerCase();
}

function normalizarTextoComparable(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function firmaOpciones(opciones: { texto: string }[]): string {
  const normalizadas = (Array.isArray(opciones) ? opciones : []).map((o) => normalizarTextoComparable(o.texto)).sort();
  return JSON.stringify(normalizadas);
}

type OpcionBanco = { texto: string; esCorrecta: boolean };
type VersionBanco = { numeroVersion: number; enunciado: string; imagenUrl?: string; opciones: OpcionBanco[] };
type BancoPreguntaDoc = { versiones?: VersionBanco[]; versionActual?: number; tema?: string; activo?: boolean };

function obtenerVersionActiva(pregunta: BancoPreguntaDoc): VersionBanco | undefined {
  const versiones = Array.isArray(pregunta?.versiones) ? pregunta.versiones : [];
  const actual = versiones.find((item) => item.numeroVersion === pregunta?.versionActual);
  return actual ?? versiones[0];
}

/**
 * Lista preguntas del docente (opcionalmente por periodo).
 */
export async function listarBancoPreguntas(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const queryActivo = String(req.query.activo ?? '').trim().toLowerCase();
  const activo = queryActivo === '' ? true : !(queryActivo === '0' || queryActivo === 'false');

  const filtro: Record<string, unknown> = { docenteId, activo };
  if (req.query.periodoId) {
    filtro.periodoId = String(req.query.periodoId);
  }

  const limite = Number(req.query.limite ?? 0);
  const consulta = BancoPregunta.find(filtro).sort({ createdAt: -1 });
  const preguntas = await (limite > 0 ? consulta.limit(limite) : consulta).lean();
  res.json({ preguntas });
}

/**
 * Crea una pregunta en el banco del docente.
 */
export async function crearPregunta(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const { periodoId, tema, enunciado, imagenUrl, opciones } = req.body;

  const temaFinal = normalizarTema(tema);
  if (temaFinal) {
    const existeTema = await TemaBanco.findOne({ docenteId, periodoId: String(periodoId), clave: claveTema(temaFinal), activo: true }).lean();
    if (!existeTema) {
      throw new ErrorAplicacion('TEMA_NO_ENCONTRADO', 'Tema no encontrado', 404);
    }

    const candidatos = await BancoPregunta.find({ docenteId, periodoId: String(periodoId), tema: temaFinal, activo: true })
      .select({ versiones: 1, versionActual: 1 })
      .lean();

    const enunciadoNuevo = normalizarTextoComparable(enunciado);
    const opcionesNuevaFirma = firmaOpciones(opciones as OpcionBanco[]);

    for (const cand of candidatos as unknown as BancoPreguntaDoc[]) {
      const v = obtenerVersionActiva(cand);
      if (!v) continue;
      if (normalizarTextoComparable(v.enunciado) === enunciadoNuevo) {
        throw new ErrorAplicacion('PREGUNTA_DUPLICADA', 'Ya existe una pregunta con ese enunciado en este tema', 409);
      }
      if (firmaOpciones(v.opciones) === opcionesNuevaFirma) {
        throw new ErrorAplicacion('RESPUESTAS_DUPLICADAS', 'Ya existe una pregunta con las mismas opciones en este tema', 409);
      }
    }
  }

  const pregunta = await BancoPregunta.create({
    docenteId,
    periodoId,
    tema: temaFinal,
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

/**
 * Actualiza una pregunta creando una nueva version (versionado).
 */
export async function actualizarPregunta(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const preguntaId = String(req.params.preguntaId ?? '').trim();
  const { tema, enunciado, imagenUrl, opciones } = req.body as {
    tema?: string;
    enunciado?: string;
    imagenUrl?: string | null;
    opciones?: Array<{ texto: string; esCorrecta: boolean }>;
  };

  const pregunta = await BancoPregunta.findOne({ _id: preguntaId, docenteId });
  if (!pregunta) {
    throw new ErrorAplicacion('PREGUNTA_NO_ENCONTRADA', 'Pregunta no encontrada', 404);
  }

  const preguntaDoc = pregunta as unknown as BancoPreguntaDoc & {
    versiones: VersionBanco[];
    versionActual: number;
  };

  const periodoActual = String((pregunta as unknown as { periodoId?: unknown }).periodoId ?? '');

  const versionActual = obtenerVersionActiva(preguntaDoc);
  if (!versionActual) {
    throw new ErrorAplicacion('PREGUNTA_INVALIDA', 'La pregunta no tiene versiones', 500);
  }

  const versiones = Array.isArray(preguntaDoc.versiones) ? preguntaDoc.versiones : [];
  const maxNumero = versiones.reduce((max, v) => Math.max(max, Number(v?.numeroVersion ?? 0)), 0);
  const siguienteNumero = Math.max(maxNumero, Number(preguntaDoc.versionActual ?? 0)) + 1;

  if (tema !== undefined) {
    const temaFinal = normalizarTema(tema);
    if (temaFinal) {
      const existeTema = await TemaBanco.findOne({ docenteId, periodoId: periodoActual, clave: claveTema(temaFinal), activo: true }).lean();
      if (!existeTema) {
        throw new ErrorAplicacion('TEMA_NO_ENCONTRADO', 'Tema no encontrado', 404);
      }
    }
    preguntaDoc.tema = temaFinal;
  }

  const nueva = {
    numeroVersion: siguienteNumero,
    enunciado: enunciado ?? versionActual.enunciado,
    imagenUrl: imagenUrl === undefined ? versionActual.imagenUrl : imagenUrl ?? undefined,
    opciones: opciones ?? versionActual.opciones
  };

  const temaFinal = normalizarTema(preguntaDoc.tema);
  if (temaFinal) {
    const candidatos = await BancoPregunta.find({
      docenteId,
      periodoId: periodoActual,
      tema: temaFinal,
      activo: true,
      _id: { $ne: preguntaId }
    })
      .select({ versiones: 1, versionActual: 1 })
      .lean();

    const enunciadoNuevo = normalizarTextoComparable(nueva.enunciado);
    const opcionesNuevaFirma = firmaOpciones(nueva.opciones);

    for (const cand of candidatos as unknown as BancoPreguntaDoc[]) {
      const v = obtenerVersionActiva(cand);
      if (!v) continue;
      if (normalizarTextoComparable(v.enunciado) === enunciadoNuevo) {
        throw new ErrorAplicacion('PREGUNTA_DUPLICADA', 'Ya existe una pregunta con ese enunciado en este tema', 409);
      }
      if (firmaOpciones(v.opciones) === opcionesNuevaFirma) {
        throw new ErrorAplicacion('RESPUESTAS_DUPLICADAS', 'Ya existe una pregunta con las mismas opciones en este tema', 409);
      }
    }
  }

  preguntaDoc.versiones = [...versiones, nueva];
  preguntaDoc.versionActual = siguienteNumero;
  await pregunta.save();

  res.json({ pregunta });
}

/**
 * Archiva (desactiva) una pregunta del banco.
 */
export async function archivarPregunta(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const preguntaId = String(req.params.preguntaId ?? '').trim();

  const pregunta = await BancoPregunta.findOne({ _id: preguntaId, docenteId });
  if (!pregunta) {
    throw new ErrorAplicacion('PREGUNTA_NO_ENCONTRADA', 'Pregunta no encontrada', 404);
  }

  const preguntaDoc = pregunta as unknown as BancoPreguntaDoc;
  preguntaDoc.activo = false;
  (preguntaDoc as { archivadoEn?: Date }).archivadoEn = new Date();
  await pregunta.save();
  res.json({ pregunta });
}

/**
 * Mueve (reasigna) multiples preguntas a otro tema.
 * Util para "quitar" preguntas de un tema sin borrarlas.
 */
export async function moverPreguntasTemaBanco(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const { periodoId, temaIdDestino, preguntasIds } = req.body as {
    periodoId?: string;
    temaIdDestino?: string;
    preguntasIds?: string[];
  };

  const periodoIdFinal = String(periodoId ?? '').trim();
  const temaIdDestinoFinal = String(temaIdDestino ?? '').trim();
  const ids = Array.isArray(preguntasIds) ? preguntasIds.map((id) => String(id).trim()).filter(Boolean) : [];

  if (!periodoIdFinal) {
    throw new ErrorAplicacion('PERIODO_REQUERIDO', 'Materia requerida', 400);
  }
  if (!temaIdDestinoFinal) {
    throw new ErrorAplicacion('TEMA_REQUERIDO', 'Tema destino requerido', 400);
  }
  if (ids.length === 0) {
    throw new ErrorAplicacion('PREGUNTAS_REQUERIDAS', 'Debes enviar al menos una pregunta', 400);
  }

  const materia = await Periodo.findOne({ _id: periodoIdFinal, docenteId }).lean();
  if (!materia) {
    throw new ErrorAplicacion('MATERIA_NO_ENCONTRADA', 'Materia no encontrada', 404);
  }

  const temaDestino = await TemaBanco.findOne({ _id: temaIdDestinoFinal, docenteId, periodoId: periodoIdFinal, activo: true }).lean();
  if (!temaDestino) {
    throw new ErrorAplicacion('TEMA_NO_ENCONTRADO', 'Tema destino no encontrado', 404);
  }
  const nombreDestino = normalizarTema((temaDestino as unknown as { nombre?: unknown }).nombre);

  const preguntasMover = await BancoPregunta.find({ _id: { $in: ids }, docenteId, periodoId: periodoIdFinal, activo: true })
    .select({ _id: 1, versiones: 1, versionActual: 1, tema: 1 })
    .lean();

  if (preguntasMover.length !== ids.length) {
    throw new ErrorAplicacion('PREGUNTA_NO_ENCONTRADA', 'Alguna pregunta no existe (o no pertenece a esta materia)', 404);
  }

  // Validar duplicados en destino (y dentro del propio lote)
  const existentesDestino = await BancoPregunta.find({
    docenteId,
    periodoId: periodoIdFinal,
    tema: nombreDestino,
    activo: true,
    _id: { $nin: ids }
  })
    .select({ versiones: 1, versionActual: 1 })
    .lean();

  const enunciadosDestino = new Set<string>();
  const opcionesDestino = new Set<string>();

  for (const cand of existentesDestino as unknown as BancoPreguntaDoc[]) {
    const v = obtenerVersionActiva(cand);
    if (!v) continue;
    enunciadosDestino.add(normalizarTextoComparable(v.enunciado));
    opcionesDestino.add(firmaOpciones(v.opciones));
  }

  const enunciadosLote = new Set<string>();
  const opcionesLote = new Set<string>();

  for (const cand of preguntasMover as unknown as BancoPreguntaDoc[]) {
    const v = obtenerVersionActiva(cand);
    if (!v) continue;

    const enunciadoN = normalizarTextoComparable(v.enunciado);
    const firma = firmaOpciones(v.opciones);

    if (enunciadosDestino.has(enunciadoN) || enunciadosLote.has(enunciadoN)) {
      throw new ErrorAplicacion('PREGUNTA_DUPLICADA', 'Ya existe una pregunta con ese enunciado en el tema destino', 409);
    }
    if (opcionesDestino.has(firma) || opcionesLote.has(firma)) {
      throw new ErrorAplicacion('RESPUESTAS_DUPLICADAS', 'Ya existe una pregunta con las mismas opciones en el tema destino', 409);
    }

    enunciadosLote.add(enunciadoN);
    opcionesLote.add(firma);
  }

  const resultado = await BancoPregunta.updateMany(
    { _id: { $in: ids }, docenteId, periodoId: periodoIdFinal, activo: true },
    { $set: { tema: nombreDestino } }
  );

  res.json({ movidas: Number((resultado as unknown as { modifiedCount?: number }).modifiedCount ?? 0) });
}

/**
 * Quita el tema de multiples preguntas (quedan sin tema).
 */
export async function quitarTemaBanco(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const { periodoId, preguntasIds } = req.body as {
    periodoId?: string;
    preguntasIds?: string[];
  };

  const periodoIdFinal = String(periodoId ?? '').trim();
  const ids = Array.isArray(preguntasIds) ? preguntasIds.map((id) => String(id).trim()).filter(Boolean) : [];

  if (!periodoIdFinal) {
    throw new ErrorAplicacion('PERIODO_REQUERIDO', 'Materia requerida', 400);
  }
  if (ids.length === 0) {
    throw new ErrorAplicacion('PREGUNTAS_REQUERIDAS', 'Debes enviar al menos una pregunta', 400);
  }

  const materia = await Periodo.findOne({ _id: periodoIdFinal, docenteId }).lean();
  if (!materia) {
    throw new ErrorAplicacion('MATERIA_NO_ENCONTRADA', 'Materia no encontrada', 404);
  }

  const existentes = await BancoPregunta.find({ _id: { $in: ids }, docenteId, periodoId: periodoIdFinal, activo: true })
    .select({ _id: 1 })
    .lean();
  if (existentes.length !== ids.length) {
    throw new ErrorAplicacion('PREGUNTA_NO_ENCONTRADA', 'Alguna pregunta no existe (o no pertenece a esta materia)', 404);
  }

  const resultado = await BancoPregunta.updateMany(
    { _id: { $in: ids }, docenteId, periodoId: periodoIdFinal, activo: true },
    { $unset: { tema: 1 } }
  );

  res.json({ actualizadas: Number((resultado as unknown as { modifiedCount?: number }).modifiedCount ?? 0) });
}

/**
 * Lista temas del banco para una materia.
 */
export async function listarTemasBanco(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const periodoId = String(req.query.periodoId ?? '').trim();
  if (!periodoId) {
    throw new ErrorAplicacion('PERIODO_REQUERIDO', 'Materia requerida', 400);
  }

  const materia = await Periodo.findOne({ _id: periodoId, docenteId }).lean();
  if (!materia) {
    throw new ErrorAplicacion('MATERIA_NO_ENCONTRADA', 'Materia no encontrada', 404);
  }

  const temas = await TemaBanco.find({ docenteId, periodoId, activo: true }).sort({ nombre: 1 }).lean();
  res.json({ temas });
}

/**
 * Crea un tema para una materia.
 */
export async function crearTemaBanco(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const { periodoId, nombre } = req.body as { periodoId?: string; nombre?: string };
  const nombreFinal = normalizarTema(nombre);
  if (!periodoId) {
    throw new ErrorAplicacion('PERIODO_REQUERIDO', 'Materia requerida', 400);
  }
  if (!nombreFinal) {
    throw new ErrorAplicacion('TEMA_INVALIDO', 'Tema invalido', 400);
  }

  const materia = await Periodo.findOne({ _id: periodoId, docenteId }).lean();
  if (!materia) {
    throw new ErrorAplicacion('MATERIA_NO_ENCONTRADA', 'Materia no encontrada', 404);
  }

  const clave = claveTema(nombreFinal);
  const existente = await TemaBanco.findOne({ docenteId, periodoId, clave });
  if (existente) {
    const doc = existente as unknown as { activo?: boolean; nombre?: string; clave?: string };
    if (doc.activo === false) {
      doc.activo = true;
      doc.nombre = nombreFinal;
      doc.clave = clave;
      await existente.save();
      return res.status(201).json({ tema: existente });
    }
    throw new ErrorAplicacion('TEMA_DUPLICADO', 'Ya existe un tema con ese nombre', 409);
  }

  const tema = await TemaBanco.create({ docenteId, periodoId, nombre: nombreFinal, clave, activo: true });
  res.status(201).json({ tema });
}

/**
 * Renombra un tema y actualiza referencias en preguntas/plantillas.
 */
export async function actualizarTemaBanco(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const temaId = String(req.params.temaId ?? '').trim();
  const { nombre } = req.body as { nombre?: string };
  const nombreFinal = normalizarTema(nombre);
  if (!nombreFinal) {
    throw new ErrorAplicacion('TEMA_INVALIDO', 'Tema invalido', 400);
  }

  const tema = await TemaBanco.findOne({ _id: temaId, docenteId });
  if (!tema) {
    throw new ErrorAplicacion('TEMA_NO_ENCONTRADO', 'Tema no encontrado', 404);
  }

  const doc = tema as unknown as { periodoId: unknown; nombre: string; clave: string; activo?: boolean };
  const periodoId = String(doc.periodoId);
  const nombreAnterior = doc.nombre;
  const claveNueva = claveTema(nombreFinal);

  const duplicado = await TemaBanco.findOne({ docenteId, periodoId, clave: claveNueva, _id: { $ne: temaId } }).lean();
  if (duplicado) {
    throw new ErrorAplicacion('TEMA_DUPLICADO', 'Ya existe un tema con ese nombre', 409);
  }

  doc.nombre = nombreFinal;
  doc.clave = claveNueva;
  doc.activo = true;
  await tema.save();

  if (nombreAnterior !== nombreFinal) {
    await Promise.all([
      BancoPregunta.updateMany({ docenteId, periodoId, tema: nombreAnterior }, { $set: { tema: nombreFinal } }),
      ExamenPlantilla.updateMany(
        { docenteId, periodoId, temas: nombreAnterior },
        { $set: { 'temas.$[t]': nombreFinal } },
        { arrayFilters: [{ t: nombreAnterior }] }
      )
    ]);
  }

  res.json({ tema });
}

/**
 * Archiva (desactiva) un tema y remueve referencias en preguntas/plantillas.
 */
export async function archivarTemaBanco(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const temaId = String(req.params.temaId ?? '').trim();

  const tema = await TemaBanco.findOne({ _id: temaId, docenteId });
  if (!tema) {
    throw new ErrorAplicacion('TEMA_NO_ENCONTRADO', 'Tema no encontrado', 404);
  }

  const doc = tema as unknown as { periodoId: unknown; nombre: string; activo?: boolean; archivadoEn?: Date };
  const periodoId = String(doc.periodoId);
  const nombreTema = doc.nombre;

  doc.activo = false;
  doc.archivadoEn = new Date();
  await tema.save();

  await Promise.all([
    BancoPregunta.updateMany({ docenteId, periodoId, tema: nombreTema }, { $unset: { tema: 1 } }),
    ExamenPlantilla.updateMany({ docenteId, periodoId, temas: nombreTema }, { $pull: { temas: nombreTema } })
  ]);

  res.json({ tema });
}
