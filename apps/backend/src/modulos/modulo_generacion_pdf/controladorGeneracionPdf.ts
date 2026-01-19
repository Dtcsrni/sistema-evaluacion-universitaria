/**
 * Controlador para plantillas y examenes generados.
 *
 * Contrato de seguridad:
 * - Todas las operaciones son multi-tenant por `docenteId`.
 * - Para acciones sobre una plantilla existente, se valida propiedad (`plantilla.docenteId`).
 *
 * Efectos laterales:
 * - `generarExamen` escribe el PDF a almacenamiento local y crea un `ExamenGenerado`.
 */
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { BancoPregunta } from '../modulo_banco_preguntas/modeloBancoPregunta';
import { Alumno } from '../modulo_alumnos/modeloAlumno';
import { barajar } from '../../compartido/utilidades/aleatoriedad';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { guardarPdfExamen } from '../../infraestructura/archivos/almacenLocal';
import { Periodo } from '../modulo_alumnos/modeloPeriodo';
import { normalizarParaNombreArchivo } from '../../compartido/utilidades/texto';
import { obtenerDocenteId } from '../modulo_autenticacion/middlewareAutenticacion';
import type { SolicitudDocente } from '../modulo_autenticacion/middlewareAutenticacion';
import { Docente } from '../modulo_autenticacion/modeloDocente';
import { ExamenGenerado } from './modeloExamenGenerado';
import { ExamenPlantilla } from './modeloExamenPlantilla';
import { generarPdfExamen } from './servicioGeneracionPdf';
import { generarVariante } from './servicioVariantes';

type MapaVariante = {
  ordenPreguntas: string[];
  ordenOpcionesPorPregunta: Record<string, number[]>;
};

type BancoPreguntaLean = {
  _id: unknown;
  tema?: string;
  versionActual: number;
  versiones: Array<{
    numeroVersion: number;
    enunciado: string;
    imagenUrl?: string;
    opciones: Array<{ texto: string; esCorrecta: boolean }>;
  }>;
};

function normalizarNombreTemaPreview(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function claveTemaPreview(valor: unknown): string {
  return normalizarNombreTemaPreview(valor).toLowerCase();
}

function construirNombrePdfExamen(parametros: {
  folio: string;
  loteId?: string;
  materiaNombre?: string;
  temas?: string[];
  plantillaTitulo?: string;
}): string {
  const materia = normalizarParaNombreArchivo(parametros.materiaNombre, { maxLen: 42 });
  const titulo = normalizarParaNombreArchivo(parametros.plantillaTitulo, { maxLen: 42 });
  const folio = normalizarParaNombreArchivo(parametros.folio, { maxLen: 16 });
  const lote = normalizarParaNombreArchivo(parametros.loteId, { maxLen: 16 });

  const temas = Array.isArray(parametros.temas) ? parametros.temas.map((t) => String(t ?? '').trim()).filter(Boolean) : [];
  let tema = '';
  if (temas.length === 1) {
    tema = normalizarParaNombreArchivo(temas[0], { maxLen: 36 });
  } else if (temas.length > 1) {
    const primero = normalizarParaNombreArchivo(temas[0], { maxLen: 26 });
    tema = primero ? `${primero}_mas-${temas.length - 1}` : `mas-${temas.length}`;
  }

  const partes = ['examen'];
  if (materia) partes.push(materia);
  if (tema) partes.push(`tema-${tema}`);
  if (titulo) partes.push(titulo);
  if (lote) partes.push(`lote-${lote}`);
  if (folio) partes.push(`folio-${folio}`);

  const nombre = partes.filter(Boolean).join('_');
  return `${nombre}.pdf`;
}

function formatearDocente(nombreCompleto: unknown): string {
  const n = String(nombreCompleto ?? '').trim();
  if (!n) return '';

  // Si ya viene con prefijo (ej. "I.S.C."), respetarlo.
  if (/^(I\.?S\.?C\.?\s+)/i.test(n)) return n;

  // Requerimiento: mostrar con prefijo profesional por defecto.
  return `I.S.C. ${n}`;
}

/**
 * Lista plantillas del docente autenticado (opcionalmente filtradas por periodo).
 */
export async function listarPlantillas(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const filtro: Record<string, unknown> = { docenteId };
  if (req.query.periodoId) filtro.periodoId = String(req.query.periodoId);
  const queryArchivado = String(req.query.archivado ?? '').trim().toLowerCase();
  const filtrarArchivadas = queryArchivado === '1' || queryArchivado === 'true' || queryArchivado === 'si' || queryArchivado === 's';
  if (filtrarArchivadas) {
    filtro.archivadoEn = { $exists: true };
  } else {
    filtro.archivadoEn = { $exists: false };
  }

  const limite = Number(req.query.limite ?? 0);
  const consulta = ExamenPlantilla.find(filtro);
  const plantillas = await (limite > 0 ? consulta.limit(limite) : consulta).lean();
  res.json({ plantillas });
}

/**
 * Crea una plantilla asociandola al docente autenticado.
 */
export async function crearPlantilla(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);

  const temasRaw = (req.body as { temas?: unknown }).temas;
  const temas = Array.isArray(temasRaw)
    ? Array.from(
        new Set(
          temasRaw
            .map((t) => String(t ?? '').trim())
            .filter(Boolean)
            .map((t) => t.replace(/\s+/g, ' '))
        )
      )
    : undefined;

  const plantilla = await ExamenPlantilla.create({ ...req.body, temas, docenteId });
  res.status(201).json({ plantilla });
}

function normalizarTemas(temasRaw: unknown): string[] | undefined {
  const temas = Array.isArray(temasRaw)
    ? Array.from(
        new Set(
          temasRaw
            .map((t) => String(t ?? '').trim())
            .filter(Boolean)
            .map((t) => t.replace(/\s+/g, ' '))
        )
      )
    : undefined;
  return temas && temas.length > 0 ? temas : undefined;
}

function hash32(input: string) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajarDeterminista<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const copia = items.slice();
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copia[i];
    copia[i] = copia[j];
    copia[j] = tmp;
  }
  return copia;
}

function generarVarianteDeterminista(preguntas: Array<{ id: string; opciones: Array<unknown> }>, seedTexto: string): MapaVariante {
  const seedBase = hash32(seedTexto);
  const ordenPreguntas = barajarDeterminista(
    preguntas.map((p) => p.id),
    seedBase
  );
  const ordenOpcionesPorPregunta: Record<string, number[]> = {};
  for (const pregunta of preguntas) {
    const indices = Array.from({ length: pregunta.opciones.length }, (_v, i) => i);
    ordenOpcionesPorPregunta[pregunta.id] = barajarDeterminista(indices, hash32(`${seedTexto}:${pregunta.id}`));
  }
  return { ordenPreguntas, ordenOpcionesPorPregunta };
}

/**
 * Actualiza una plantilla del docente autenticado.
 *
 * Nota: se hace merge con valores actuales para validar invariantes (temas/preguntasIds).
 */
export async function actualizarPlantilla(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const plantillaId = String(req.params.id || '').trim();
  const actual = await ExamenPlantilla.findById(plantillaId).lean();
  if (!actual) {
    throw new ErrorAplicacion('PLANTILLA_NO_ENCONTRADA', 'Plantilla no encontrada', 404);
  }
  if (String(actual.docenteId) !== String(docenteId)) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sin acceso a la plantilla', 403);
  }

  const temas = normalizarTemas((req.body as { temas?: unknown })?.temas);
  const patch = { ...(req.body as Record<string, unknown>), ...(temas !== undefined ? { temas } : {}) };
  // Si se manda explicitamente temas=[] vacio, se respeta como vacio.
  if (Array.isArray((req.body as { temas?: unknown })?.temas) && (temas === undefined || temas.length === 0)) {
    (patch as Record<string, unknown>).temas = [];
  }

  const merged = {
    periodoId: (patch as { periodoId?: unknown }).periodoId ?? actual.periodoId,
    tipo: (patch as { tipo?: unknown }).tipo ?? actual.tipo,
    titulo: (patch as { titulo?: unknown }).titulo ?? actual.titulo,
    instrucciones: (patch as { instrucciones?: unknown }).instrucciones ?? actual.instrucciones,
    numeroPaginas:
      (patch as { numeroPaginas?: unknown }).numeroPaginas ??
      (actual as unknown as { numeroPaginas?: unknown }).numeroPaginas,
    totalReactivos:
      (patch as { totalReactivos?: unknown }).totalReactivos ??
      (actual as unknown as { totalReactivos?: unknown }).totalReactivos,
    preguntasIds: (patch as { preguntasIds?: unknown }).preguntasIds ?? actual.preguntasIds,
    temas: (patch as { temas?: unknown }).temas ?? (actual as unknown as { temas?: unknown }).temas,
    configuracionPdf: (patch as { configuracionPdf?: unknown }).configuracionPdf ?? actual.configuracionPdf
  };

  const preguntasIds = Array.isArray(merged.preguntasIds) ? merged.preguntasIds : [];
  const temasMerged = Array.isArray(merged.temas) ? merged.temas : [];
  if (preguntasIds.length === 0 && temasMerged.length === 0) {
    throw new ErrorAplicacion('PLANTILLA_INVALIDA', 'La plantilla debe incluir preguntasIds o temas', 400);
  }
  if (temasMerged.length > 0 && !merged.periodoId) {
    throw new ErrorAplicacion('PLANTILLA_INVALIDA', 'periodoId es obligatorio cuando se usan temas', 400);
  }

  const actualizado = await ExamenPlantilla.findOneAndUpdate(
    { _id: plantillaId, docenteId },
    { $set: patch },
    { new: true }
  ).lean();

  res.json({ plantilla: actualizado });
}

/**
 * Elimina una plantilla si no tiene examenes generados asociados.
 */
export async function archivarPlantilla(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const plantillaId = String(req.params.id || '').trim();
  const plantilla = await ExamenPlantilla.findById(plantillaId).lean();
  if (!plantilla) {
    throw new ErrorAplicacion('PLANTILLA_NO_ENCONTRADA', 'Plantilla no encontrada', 404);
  }
  if (String(plantilla.docenteId) !== String(docenteId)) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sin acceso a la plantilla', 403);
  }

  if ((plantilla as unknown as { archivadoEn?: unknown }).archivadoEn) {
    return res.json({ ok: true, plantilla });
  }

  const actualizado = await ExamenPlantilla.findOneAndUpdate(
    { _id: plantillaId, docenteId },
    { $set: { archivadoEn: new Date() } },
    { new: true }
  ).lean();

  res.json({ ok: true, plantilla: actualizado });
}

/**
 * Genera un boceto de previsualizacion para una plantilla (por pagina), usando una seleccion determinista.
 */
export async function previsualizarPlantilla(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const plantillaId = String(req.params.id || '').trim();

  const plantilla = await ExamenPlantilla.findById(plantillaId).lean();
  if (!plantilla) {
    throw new ErrorAplicacion('PLANTILLA_NO_ENCONTRADA', 'Plantilla no encontrada', 404);
  }
  if (String(plantilla.docenteId) !== String(docenteId)) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sin acceso a la plantilla', 403);
  }

  const preguntasIds = Array.isArray(plantilla.preguntasIds) ? plantilla.preguntasIds : [];
  const temas = Array.isArray((plantilla as unknown as { temas?: unknown[] }).temas)
    ? ((plantilla as unknown as { temas?: unknown[] }).temas ?? []).map((t) => String(t ?? '').trim()).filter(Boolean)
    : [];

  const temasNormalizados = temas.map((t) => normalizarNombreTemaPreview(t)).filter(Boolean);
  const conteoPorTema = [] as Array<{ tema: string; disponibles: number }>;
  const temasDisponiblesEnMateria = [] as Array<{ tema: string; disponibles: number }>;

  let preguntasDb: BancoPreguntaLean[] = [];
  if (temas.length > 0) {
    if (!plantilla.periodoId) {
      throw new ErrorAplicacion('PLANTILLA_INVALIDA', 'La plantilla por temas requiere materia (periodoId)', 400);
    }
    preguntasDb = (await BancoPregunta.find({
      docenteId,
      activo: true,
      periodoId: plantilla.periodoId,
      tema: { $in: temas }
    })
      .sort({ updatedAt: -1, _id: -1 })
      .lean()) as BancoPreguntaLean[];

    // Desglose por tema (solo aplica en modo por temas)
    const mapaConteo = new Map<string, number>();
    for (const p of preguntasDb) {
      const k = claveTemaPreview((p as unknown as { tema?: unknown })?.tema);
      if (!k) continue;
      mapaConteo.set(k, (mapaConteo.get(k) ?? 0) + 1);
    }
    for (const tema of temasNormalizados) {
      const k = claveTemaPreview(tema);
      conteoPorTema.push({ tema, disponibles: mapaConteo.get(k) ?? 0 });
    }

    // Además, para diagnosticar: temas disponibles en la materia (top)
    try {
      const docenteObjectId = new Types.ObjectId(String(docenteId));
      const periodoObjectId = new Types.ObjectId(String(plantilla.periodoId));
      const filas = (await BancoPregunta.aggregate([
        { $match: { docenteId: docenteObjectId, activo: true, periodoId: periodoObjectId } },
        { $project: { tema: { $ifNull: ['$tema', ''] } } },
        { $group: { _id: '$tema', disponibles: { $sum: 1 } } },
        { $sort: { disponibles: -1, _id: 1 } },
        { $limit: 30 }
      ])) as Array<{ _id: unknown; disponibles: number }>;

      for (const fila of filas) {
        const tema = normalizarNombreTemaPreview(fila._id);
        temasDisponiblesEnMateria.push({ tema: tema || 'Sin tema', disponibles: Number(fila.disponibles ?? 0) });
      }
    } catch {
      // Best-effort: no bloquea la previsualizacion.
    }
  } else {
    preguntasDb = (await BancoPregunta.find({
      docenteId,
      activo: true,
      ...(plantilla.periodoId ? { periodoId: plantilla.periodoId } : {}),
      _id: { $in: preguntasIds }
    })
      .sort({ updatedAt: -1, _id: -1 })
      .lean()) as BancoPreguntaLean[];
  }

  if (preguntasDb.length === 0) {
    throw new ErrorAplicacion('SIN_PREGUNTAS', 'La plantilla no tiene preguntas disponibles para previsualizar', 400);
  }

  const totalDisponibles = preguntasDb.length;
  const numeroPaginas = (() => {
    const n = Number((plantilla as unknown as { numeroPaginas?: unknown })?.numeroPaginas);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    // Compatibilidad legacy: si no existe numeroPaginas pero sí totalReactivos, preserva el comportamiento histórico.
    const legacy = Number((plantilla as unknown as { totalReactivos?: unknown })?.totalReactivos);
    if (Number.isFinite(legacy) && legacy >= 1) return plantilla.tipo === 'parcial' ? 2 : 4;
    return 1;
  })();

  const preguntasBase = preguntasDb.map((pregunta) => {
    const version =
      pregunta.versiones.find((item: { numeroVersion: number }) => item.numeroVersion === pregunta.versionActual) ??
      pregunta.versiones[0];
    return {
      id: String(pregunta._id),
      enunciado: version.enunciado,
      imagenUrl: version.imagenUrl ?? undefined,
      opciones: version.opciones
    };
  });

  const seed = hash32(String(plantilla._id));
  const preguntasCandidatas = barajarDeterminista(preguntasBase, seed);
  const mapaVarianteDet = generarVarianteDeterminista(preguntasCandidatas, `plantilla:${plantilla._id}`);

  const [periodo, docenteDb] = await Promise.all([
    plantilla.periodoId ? Periodo.findById(plantilla.periodoId).lean() : Promise.resolve(null),
    Docente.findById(docenteId).lean()
  ]);

  const { paginas, metricasPaginas, mapaOmr } = await generarPdfExamen({
    titulo: String(plantilla.titulo ?? ''),
    folio: 'PREVIEW',
    preguntas: preguntasCandidatas,
    mapaVariante: mapaVarianteDet as unknown as ReturnType<typeof generarVariante>,
    tipoExamen: plantilla.tipo as 'parcial' | 'global',
    totalPaginas: numeroPaginas,
    margenMm: plantilla.configuracionPdf?.margenMm ?? 10,
    encabezado: {
      materia: String((periodo as unknown as { nombre?: unknown })?.nombre ?? ''),
      docente: formatearDocente((docenteDb as unknown as { nombreCompleto?: unknown })?.nombreCompleto),
      instrucciones: String((plantilla as unknown as { instrucciones?: unknown })?.instrucciones ?? '')
    }
  });

  const porId = new Map<string, (typeof preguntasCandidatas)[number]>();
  for (const p of preguntasCandidatas) porId.set(p.id, p);
  const ordenadas = (mapaVarianteDet.ordenPreguntas || []).map((id) => porId.get(id)).filter(Boolean) as Array<
    (typeof preguntasCandidatas)[number]
  >;

  const usadosSet = new Set<string>();
  for (const pag of (mapaOmr?.paginas ?? []) as Array<{ preguntas?: Array<{ idPregunta?: string }> }>) {
    for (const pr of pag.preguntas ?? []) {
      const id = String(pr.idPregunta ?? '').trim();
      if (id) usadosSet.add(id);
    }
  }
  const totalUsados = usadosSet.size;
  const ultima = (Array.isArray(metricasPaginas) ? metricasPaginas : []).find((m) => m.numero === numeroPaginas);
  const fraccionVaciaUltimaPagina = Number(ultima?.fraccionVacia ?? 0);
  const consumioTodas = totalUsados >= totalDisponibles;
  const advertencias: string[] = [];
  if (consumioTodas && fraccionVaciaUltimaPagina > 0) {
    advertencias.push(
      `No hay suficientes preguntas para llenar ${numeroPaginas} pagina(s). ` +
        `La ultima pagina queda ${(fraccionVaciaUltimaPagina * 100).toFixed(0)}% vacia.`
    );
  }

  const elementosBase = [
    'Titulo',
    'Folio (placeholder)',
    'QR por pagina',
    'Marcas de registro',
    'OMR (burbujas por opcion)'
  ];

  const paginasSketch = (Array.isArray(paginas) ? paginas : []).map((p) => {
    const del = Number((p as { preguntasDel?: number }).preguntasDel ?? 0);
    const al = Number((p as { preguntasAl?: number }).preguntasAl ?? 0);
    const preguntasPagina = del > 0 && al > 0 ? ordenadas.slice(del - 1, al) : [];
    return {
      numero: (p as { numero: number }).numero,
      preguntasDel: del,
      preguntasAl: al,
      elementos: elementosBase,
      preguntas: preguntasPagina.map((pr, idx) => {
        const n = del + idx;
        const enunciado = String(pr.enunciado ?? '').trim().replace(/\s+/g, ' ');
        return {
          numero: n,
          id: pr.id,
          tieneImagen: Boolean(String(pr.imagenUrl ?? '').trim()),
          enunciadoCorto: enunciado.length > 120 ? `${enunciado.slice(0, 117)}…` : enunciado
        };
      })
    };
  });

  res.json({
    plantillaId: String(plantilla._id),
    numeroPaginas,
    totalDisponibles,
    totalUsados,
    fraccionVaciaUltimaPagina,
    advertencias,
    conteoPorTema,
    temasDisponiblesEnMateria,
    paginas: paginasSketch
  });
}

/**
 * Genera un PDF real de previsualizacion para una plantilla.
 * Esto permite ver el documento exactamente como se renderizara (layout, QR/OMR, etc.).
 */
export async function previsualizarPlantillaPdf(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const plantillaId = String(req.params.id || '').trim();

  const plantilla = await ExamenPlantilla.findById(plantillaId).lean();
  if (!plantilla) {
    throw new ErrorAplicacion('PLANTILLA_NO_ENCONTRADA', 'Plantilla no encontrada', 404);
  }
  if (String(plantilla.docenteId) !== String(docenteId)) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sin acceso a la plantilla', 403);
  }

  const preguntasIds = Array.isArray(plantilla.preguntasIds) ? plantilla.preguntasIds : [];
  const temas = Array.isArray((plantilla as unknown as { temas?: unknown[] }).temas)
    ? ((plantilla as unknown as { temas?: unknown[] }).temas ?? []).map((t) => String(t ?? '').trim()).filter(Boolean)
    : [];

  let preguntasDb: BancoPreguntaLean[] = [];
  if (temas.length > 0) {
    if (!plantilla.periodoId) {
      throw new ErrorAplicacion('PLANTILLA_INVALIDA', 'La plantilla por temas requiere materia (periodoId)', 400);
    }
    preguntasDb = (await BancoPregunta.find({
      docenteId,
      activo: true,
      periodoId: plantilla.periodoId,
      tema: { $in: temas }
    })
      .sort({ updatedAt: -1, _id: -1 })
      .lean()) as BancoPreguntaLean[];
  } else {
    preguntasDb = (await BancoPregunta.find({
      docenteId,
      activo: true,
      ...(plantilla.periodoId ? { periodoId: plantilla.periodoId } : {}),
      _id: { $in: preguntasIds }
    })
      .sort({ updatedAt: -1, _id: -1 })
      .lean()) as BancoPreguntaLean[];
  }

  if (preguntasDb.length === 0) {
    throw new ErrorAplicacion('SIN_PREGUNTAS', 'La plantilla no tiene preguntas disponibles para previsualizar', 400);
  }

  const numeroPaginas = (() => {
    const n = Number((plantilla as unknown as { numeroPaginas?: unknown })?.numeroPaginas);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    const legacy = Number((plantilla as unknown as { totalReactivos?: unknown })?.totalReactivos);
    if (Number.isFinite(legacy) && legacy >= 1) return plantilla.tipo === 'parcial' ? 2 : 4;
    return 1;
  })();

  const preguntasBase = preguntasDb.map((pregunta) => {
    const version =
      pregunta.versiones.find((item: { numeroVersion: number }) => item.numeroVersion === pregunta.versionActual) ??
      pregunta.versiones[0];
    return {
      id: String(pregunta._id),
      enunciado: version.enunciado,
      imagenUrl: version.imagenUrl ?? undefined,
      opciones: version.opciones
    };
  });

  const seed = hash32(String(plantilla._id));
  const preguntasCandidatas = barajarDeterminista(preguntasBase, seed);
  const mapaVarianteDet = generarVarianteDeterminista(preguntasCandidatas, `plantilla:${plantilla._id}`);

  const [periodo, docenteDb] = await Promise.all([
    plantilla.periodoId ? Periodo.findById(plantilla.periodoId).lean() : Promise.resolve(null),
    Docente.findById(docenteId).lean()
  ]);

  const { pdfBytes } = await generarPdfExamen({
    titulo: String(plantilla.titulo ?? ''),
    folio: 'PREVIEW',
    preguntas: preguntasCandidatas,
    mapaVariante: mapaVarianteDet as unknown as ReturnType<typeof generarVariante>,
    tipoExamen: plantilla.tipo as 'parcial' | 'global',
    totalPaginas: numeroPaginas,
    margenMm: plantilla.configuracionPdf?.margenMm ?? 10,
    encabezado: {
      materia: String((periodo as unknown as { nombre?: unknown })?.nombre ?? ''),
      docente: String((docenteDb as unknown as { nombreCompleto?: unknown })?.nombreCompleto ?? '')
    }
  });

  res.setHeader('Content-Type', 'application/pdf');
  const tituloArchivo = normalizarParaNombreArchivo(String((plantilla as unknown as { titulo?: unknown })?.titulo ?? ''), {
    maxLen: 48
  });
  const sufijo = String(plantillaId).slice(-8);
  const nombre = ['preview', tituloArchivo || '', sufijo].filter(Boolean).join('_');
  res.setHeader('Content-Disposition', `inline; filename="${nombre}.pdf"`);
  res.send(Buffer.from(pdfBytes));
}

/**
 * Genera un examen a partir de una plantilla.
 *
 * Contrato de autorizacion por objeto:
 * - La plantilla debe pertenecer al docente autenticado.
 *
 * Notas de implementacion:
 * - `folio` se deriva de `randomUUID()` para minimizar colisiones.
 * - El PDF se persiste en almacenamiento local y se registra la ruta.
 */
export async function generarExamen(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const { plantillaId, alumnoId } = req.body;
  const plantilla = await ExamenPlantilla.findById(plantillaId).lean();

  if (!plantilla) {
    throw new ErrorAplicacion('PLANTILLA_NO_ENCONTRADA', 'Plantilla no encontrada', 404);
  }
  if (String(plantilla.docenteId) !== String(docenteId)) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sin acceso a la plantilla', 403);
  }

  const preguntasIds = Array.isArray(plantilla.preguntasIds) ? plantilla.preguntasIds : [];
  const temas = Array.isArray((plantilla as unknown as { temas?: unknown[] }).temas)
    ? ((plantilla as unknown as { temas?: unknown[] }).temas ?? []).map((t) => String(t ?? '').trim()).filter(Boolean)
    : [];

  let preguntasDb: BancoPreguntaLean[] = [];
  if (temas.length > 0) {
    if (!plantilla.periodoId) {
      throw new ErrorAplicacion('PLANTILLA_INVALIDA', 'La plantilla por temas requiere materia (periodoId)', 400);
    }
    preguntasDb = (await BancoPregunta.find({
      docenteId,
      activo: true,
      periodoId: plantilla.periodoId,
      tema: { $in: temas }
    }).lean()) as BancoPreguntaLean[];
  } else {
    preguntasDb = (await BancoPregunta.find({
      docenteId,
      activo: true,
      ...(plantilla.periodoId ? { periodoId: plantilla.periodoId } : {}),
      _id: { $in: preguntasIds }
    }).lean()) as BancoPreguntaLean[];
  }

  if (preguntasDb.length === 0) {
    throw new ErrorAplicacion('SIN_PREGUNTAS', 'La plantilla no tiene preguntas asociadas', 400);
  }
  const numeroPaginas = (() => {
    const n = Number((plantilla as unknown as { numeroPaginas?: unknown })?.numeroPaginas);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    const legacy = Number((plantilla as unknown as { totalReactivos?: unknown })?.totalReactivos);
    if (Number.isFinite(legacy) && legacy >= 1) return plantilla.tipo === 'parcial' ? 2 : 4;
    return 1;
  })();

  const preguntasBase = preguntasDb.map((pregunta) => {
    const version =
      pregunta.versiones.find((item: { numeroVersion: number }) => item.numeroVersion === pregunta.versionActual) ??
      pregunta.versiones[0];
    return {
      id: String(pregunta._id),
      enunciado: version.enunciado,
      imagenUrl: version.imagenUrl ?? undefined,
      opciones: version.opciones
    };
  });

  const preguntasCandidatas = barajar(preguntasBase);
  const mapaVariante = generarVariante(preguntasCandidatas);
  const loteId = randomUUID().split('-')[0].toUpperCase();
  const folio = randomUUID().split('-')[0].toUpperCase();

  const [periodo, docenteDb, alumno] = await Promise.all([
    plantilla.periodoId ? Periodo.findById(plantilla.periodoId).lean() : Promise.resolve(null),
    Docente.findById(docenteId).lean(),
    alumnoId ? Alumno.findById(String(alumnoId)).lean() : Promise.resolve(null)
  ]);

  const { pdfBytes, paginas, metricasPaginas, mapaOmr } = await generarPdfExamen({
    titulo: plantilla.titulo,
    folio,
    preguntas: preguntasCandidatas,
    mapaVariante,
    tipoExamen: plantilla.tipo as 'parcial' | 'global',
    totalPaginas: numeroPaginas,
    margenMm: plantilla.configuracionPdf?.margenMm ?? 10,
    encabezado: {
      materia: String((periodo as unknown as { nombre?: unknown })?.nombre ?? ''),
      docente: formatearDocente((docenteDb as unknown as { nombreCompleto?: unknown })?.nombreCompleto),
      instrucciones: String((plantilla as unknown as { instrucciones?: unknown })?.instrucciones ?? ''),
      alumno: {
        nombre: String((alumno as unknown as { nombreCompleto?: unknown })?.nombreCompleto ?? ''),
        grupo: String((alumno as unknown as { grupo?: unknown })?.grupo ?? '')
      }
    }
  });

  const usadosSet = new Set<string>();
  for (const pag of (mapaOmr?.paginas ?? []) as Array<{ preguntas?: Array<{ idPregunta?: string }> }>) {
    for (const pr of pag.preguntas ?? []) {
      const id = String(pr.idPregunta ?? '').trim();
      if (id) usadosSet.add(id);
    }
  }
  const ordenUsado = (mapaVariante.ordenPreguntas ?? []).filter((id) => usadosSet.has(id));
  const ordenOpcionesPorPreguntaUsado = Object.fromEntries(
    ordenUsado.map((id) => [id, (mapaVariante as unknown as { ordenOpcionesPorPregunta?: Record<string, number[]> }).ordenOpcionesPorPregunta?.[id]])
  ) as Record<string, number[]>;
  const mapaVarianteUsada = {
    ordenPreguntas: ordenUsado,
    ordenOpcionesPorPregunta: ordenOpcionesPorPreguntaUsado
  };

  const ultima = (Array.isArray(metricasPaginas) ? metricasPaginas : []).find((m) => m.numero === numeroPaginas);
  const fraccionVaciaUltimaPagina = Number(ultima?.fraccionVacia ?? 0);
  const consumioTodas = usadosSet.size >= preguntasDb.length;
  const advertencias: string[] = [];
  if (consumioTodas && fraccionVaciaUltimaPagina > 0.5) {
    throw new ErrorAplicacion(
      'PAGINAS_INSUFICIENTES',
      `No hay suficientes preguntas para llenar ${numeroPaginas} pagina(s). La ultima pagina queda ${(fraccionVaciaUltimaPagina * 100).toFixed(
        0
      )}% vacia.`,
      409,
      { fraccionVaciaUltimaPagina, numeroPaginas }
    );
  }
  if (consumioTodas && fraccionVaciaUltimaPagina > 0) {
    advertencias.push(
      `La ultima pagina queda ${(fraccionVaciaUltimaPagina * 100).toFixed(0)}% vacia por falta de preguntas.`
    );
  }

  const nombreArchivo = construirNombrePdfExamen({
    folio,
    loteId,
    materiaNombre: String((periodo as unknown as { nombre?: unknown })?.nombre ?? ''),
    temas,
    plantillaTitulo: String(plantilla.titulo ?? '')
  });
  const rutaPdf = await guardarPdfExamen(nombreArchivo, pdfBytes);

  const examenGenerado = await ExamenGenerado.create({
    docenteId,
    periodoId: plantilla.periodoId,
    plantillaId: plantilla._id,
    alumnoId,
    loteId,
    folio,
    estado: 'generado',
    preguntasIds: ordenUsado,
    mapaVariante: mapaVarianteUsada,
    paginas,
    mapaOmr,
    rutaPdf
  });

  res.status(201).json({ examenGenerado, advertencias });
}

/**
 * Genera examenes para todos los alumnos activos de la materia (periodo) asociada a la plantilla.
 *
 * Nota: esta operacion puede ser pesada; se incluye un guard-rail para grupos grandes.
 */
export async function generarExamenesLote(req: SolicitudDocente, res: Response) {
  const docenteId = obtenerDocenteId(req);
  const { plantillaId, confirmarMasivo } = req.body as { plantillaId: string; confirmarMasivo?: boolean };

  const plantilla = await ExamenPlantilla.findById(plantillaId).lean();
  if (!plantilla) {
    throw new ErrorAplicacion('PLANTILLA_NO_ENCONTRADA', 'Plantilla no encontrada', 404);
  }
  if (String(plantilla.docenteId) !== String(docenteId)) {
    throw new ErrorAplicacion('NO_AUTORIZADO', 'Sin acceso a la plantilla', 403);
  }
  if (!plantilla.periodoId) {
    throw new ErrorAplicacion('PLANTILLA_INVALIDA', 'La plantilla requiere materia (periodoId) para generar en lote', 400);
  }

  const loteId = randomUUID().split('-')[0].toUpperCase();
  const periodo = await Periodo.findById(plantilla.periodoId).lean();
  const docenteDb = await Docente.findById(docenteId).lean();

  const alumnos = await Alumno.find({ docenteId, periodoId: plantilla.periodoId, activo: true }).lean();
  const totalAlumnos = Array.isArray(alumnos) ? alumnos.length : 0;
  if (totalAlumnos === 0) {
    throw new ErrorAplicacion('SIN_ALUMNOS', 'No hay alumnos activos en esta materia', 400);
  }

  const alumnosPorId = new Map<string, unknown>();
  for (const a of Array.isArray(alumnos) ? alumnos : []) {
    const id = String((a as unknown as { _id?: unknown })?._id ?? '').trim();
    if (id) alumnosPorId.set(id, a);
  }

  const LIMITE_SIN_CONFIRMAR = 200;
  if (totalAlumnos > LIMITE_SIN_CONFIRMAR && !confirmarMasivo) {
    throw new ErrorAplicacion(
      'CONFIRMAR_MASIVO',
      `Vas a generar ${totalAlumnos} examenes. Reintenta con confirmarMasivo=true para continuar.`,
      400
    );
  }

  const preguntasIds = Array.isArray(plantilla.preguntasIds) ? plantilla.preguntasIds : [];
  const temas = Array.isArray((plantilla as unknown as { temas?: unknown[] }).temas)
    ? ((plantilla as unknown as { temas?: unknown[] }).temas ?? []).map((t) => String(t ?? '').trim()).filter(Boolean)
    : [];

  let preguntasDb: BancoPreguntaLean[] = [];
  if (temas.length > 0) {
    preguntasDb = (await BancoPregunta.find({
      docenteId,
      activo: true,
      periodoId: plantilla.periodoId,
      tema: { $in: temas }
    }).lean()) as BancoPreguntaLean[];
  } else {
    preguntasDb = (await BancoPregunta.find({
      docenteId,
      activo: true,
      periodoId: plantilla.periodoId,
      _id: { $in: preguntasIds }
    }).lean()) as BancoPreguntaLean[];
  }

  if (preguntasDb.length === 0) {
    throw new ErrorAplicacion('SIN_PREGUNTAS', 'La plantilla no tiene preguntas asociadas', 400);
  }
  const numeroPaginas = (() => {
    const n = Number((plantilla as unknown as { numeroPaginas?: unknown })?.numeroPaginas);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    const legacy = Number((plantilla as unknown as { totalReactivos?: unknown })?.totalReactivos);
    if (Number.isFinite(legacy) && legacy >= 1) return plantilla.tipo === 'parcial' ? 2 : 4;
    return 1;
  })();

  const preguntasBase = preguntasDb.map((pregunta) => {
    const version =
      pregunta.versiones.find((item: { numeroVersion: number }) => item.numeroVersion === pregunta.versionActual) ??
      pregunta.versiones[0];
    return {
      id: String(pregunta._id),
      enunciado: version.enunciado,
      imagenUrl: version.imagenUrl ?? undefined,
      opciones: version.opciones
    };
  });

  // Pre-chequeo: si ni usando TODO el banco alcanza para llenar las paginas, bloquea el lote.
  {
    const preguntasCandidatas = barajarDeterminista(preguntasBase, hash32(String(plantilla._id)));
    const mapaVariante = generarVarianteDeterminista(preguntasCandidatas, `plantilla:${plantilla._id}:lote-precheck`);
    const { metricasPaginas, mapaOmr } = await generarPdfExamen({
      titulo: plantilla.titulo,
      folio: 'PRECHECK',
      preguntas: preguntasCandidatas,
      mapaVariante: mapaVariante as unknown as ReturnType<typeof generarVariante>,
      tipoExamen: plantilla.tipo as 'parcial' | 'global',
      totalPaginas: numeroPaginas,
      margenMm: plantilla.configuracionPdf?.margenMm ?? 10,
      encabezado: {
        materia: String((periodo as unknown as { nombre?: unknown })?.nombre ?? ''),
        docente: formatearDocente((docenteDb as unknown as { nombreCompleto?: unknown })?.nombreCompleto),
        instrucciones: String((plantilla as unknown as { instrucciones?: unknown })?.instrucciones ?? '')
      }
    });
    const usadosSet = new Set<string>();
    for (const pag of (mapaOmr?.paginas ?? []) as Array<{ preguntas?: Array<{ idPregunta?: string }> }>) {
      for (const pr of pag.preguntas ?? []) {
        const id = String(pr.idPregunta ?? '').trim();
        if (id) usadosSet.add(id);
      }
    }
    const ultima = (Array.isArray(metricasPaginas) ? metricasPaginas : []).find((m) => m.numero === numeroPaginas);
    const fraccionVaciaUltimaPagina = Number(ultima?.fraccionVacia ?? 0);
    const consumioTodas = usadosSet.size >= preguntasDb.length;
    if (consumioTodas && fraccionVaciaUltimaPagina > 0.5) {
      throw new ErrorAplicacion(
        'PAGINAS_INSUFICIENTES',
        `No hay suficientes preguntas para llenar ${numeroPaginas} pagina(s). La ultima pagina queda ${(fraccionVaciaUltimaPagina * 100).toFixed(
          0
        )}% vacia.`,
        409,
        { fraccionVaciaUltimaPagina, numeroPaginas }
      );
    }
  }

  async function crearExamenParaAlumno(alumnoId: string) {
    const preguntasCandidatas = barajar(preguntasBase);
    const mapaVariante = generarVariante(preguntasCandidatas);

    let folio = randomUUID().split('-')[0].toUpperCase();
    for (let intento = 0; intento < 3; intento += 1) {
      try {
        const { pdfBytes, paginas, metricasPaginas, mapaOmr } = await generarPdfExamen({
          titulo: plantilla.titulo,
          folio,
          preguntas: preguntasCandidatas,
          mapaVariante,
          tipoExamen: plantilla.tipo as 'parcial' | 'global',
          totalPaginas: numeroPaginas,
          margenMm: plantilla.configuracionPdf?.margenMm ?? 10,
          encabezado: {
            materia: String((periodo as unknown as { nombre?: unknown })?.nombre ?? ''),
            docente: formatearDocente((docenteDb as unknown as { nombreCompleto?: unknown })?.nombreCompleto),
            instrucciones: String((plantilla as unknown as { instrucciones?: unknown })?.instrucciones ?? ''),
            alumno: {
              nombre: String((alumnosPorId.get(alumnoId) as unknown as { nombreCompleto?: unknown })?.nombreCompleto ?? ''),
              grupo: String((alumnosPorId.get(alumnoId) as unknown as { grupo?: unknown })?.grupo ?? '')
            }
          }
        });

        const usadosSet = new Set<string>();
        for (const pag of (mapaOmr?.paginas ?? []) as Array<{ preguntas?: Array<{ idPregunta?: string }> }>) {
          for (const pr of pag.preguntas ?? []) {
            const id = String(pr.idPregunta ?? '').trim();
            if (id) usadosSet.add(id);
          }
        }
        const ordenUsado = (mapaVariante.ordenPreguntas ?? []).filter((id) => usadosSet.has(id));
        const ordenOpcionesPorPreguntaUsado = Object.fromEntries(
          ordenUsado.map((id) => [id, (mapaVariante as unknown as { ordenOpcionesPorPregunta?: Record<string, number[]> }).ordenOpcionesPorPregunta?.[id]])
        ) as Record<string, number[]>;
        const mapaVarianteUsada = {
          ordenPreguntas: ordenUsado,
          ordenOpcionesPorPregunta: ordenOpcionesPorPreguntaUsado
        };

        const ultima = (Array.isArray(metricasPaginas) ? metricasPaginas : []).find((m) => m.numero === numeroPaginas);
        const fraccionVaciaUltimaPagina = Number(ultima?.fraccionVacia ?? 0);
        const consumioTodas = usadosSet.size >= preguntasDb.length;
        if (consumioTodas && fraccionVaciaUltimaPagina > 0.5) {
          throw new ErrorAplicacion(
            'PAGINAS_INSUFICIENTES',
            `No hay suficientes preguntas para llenar ${numeroPaginas} pagina(s). La ultima pagina queda ${(fraccionVaciaUltimaPagina * 100).toFixed(
              0
            )}% vacia.`,
            409,
            { fraccionVaciaUltimaPagina, numeroPaginas }
          );
        }

        const nombreArchivo = construirNombrePdfExamen({
          folio,
          loteId,
          materiaNombre: String((periodo as unknown as { nombre?: unknown })?.nombre ?? ''),
          temas,
          plantillaTitulo: String(plantilla.titulo ?? '')
        });
        const rutaPdf = await guardarPdfExamen(nombreArchivo, pdfBytes);

        const examenGenerado = await ExamenGenerado.create({
          docenteId,
          periodoId: plantilla.periodoId,
          plantillaId: plantilla._id,
          alumnoId,
          loteId,
          folio,
          estado: 'generado',
          preguntasIds: ordenUsado,
          mapaVariante: mapaVarianteUsada,
          paginas,
          mapaOmr,
          rutaPdf
        });

        return examenGenerado;
      } catch (error) {
        // Reintenta solo en colision de folio.
        const msg = String((error as { message?: unknown })?.message ?? '');
        if (msg.includes('E11000') && msg.toLowerCase().includes('folio')) {
          folio = randomUUID().split('-')[0].toUpperCase();
          continue;
        }
        throw error;
      }
    }
    throw new ErrorAplicacion('FOLIO_COLISION', 'No se pudo generar un folio unico', 500);
  }

  const examenesGenerados = [] as Array<{ _id: string; folio: string; alumnoId: string; generadoEn: Date }>;
  for (const alumno of alumnos as Array<{ _id: unknown }>) {
    const alumnoId = String(alumno._id);
    const creado = await crearExamenParaAlumno(alumnoId);
    examenesGenerados.push({ _id: String(creado._id), folio: creado.folio, alumnoId, generadoEn: creado.generadoEn });
  }

  res.status(201).json({ loteId, totalAlumnos, examenesGenerados });
}
