/**
 * Generacion de PDFs en formato carta con marcas y QR por pagina.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import type { MapaVariante, PreguntaBase } from './servicioVariantes';

const ANCHO_CARTA = 612;
const ALTO_CARTA = 792;
const MM_A_PUNTOS = 72 / 25.4;

function mmAPuntos(mm: number) {
  return mm * MM_A_PUNTOS;
}

function agregarMarcasRegistro(page: PDFPage, margen: number) {
  const largo = 12;
  const color = rgb(0, 0, 0);

  page.drawLine({ start: { x: margen, y: ALTO_CARTA - margen }, end: { x: margen + largo, y: ALTO_CARTA - margen }, color });
  page.drawLine({ start: { x: margen, y: ALTO_CARTA - margen }, end: { x: margen, y: ALTO_CARTA - margen - largo }, color });

  page.drawLine({ start: { x: ANCHO_CARTA - margen, y: ALTO_CARTA - margen }, end: { x: ANCHO_CARTA - margen - largo, y: ALTO_CARTA - margen }, color });
  page.drawLine({ start: { x: ANCHO_CARTA - margen, y: ALTO_CARTA - margen }, end: { x: ANCHO_CARTA - margen, y: ALTO_CARTA - margen - largo }, color });

  page.drawLine({ start: { x: margen, y: margen }, end: { x: margen + largo, y: margen }, color });
  page.drawLine({ start: { x: margen, y: margen }, end: { x: margen, y: margen + largo }, color });

  page.drawLine({ start: { x: ANCHO_CARTA - margen, y: margen }, end: { x: ANCHO_CARTA - margen - largo, y: margen }, color });
  page.drawLine({ start: { x: ANCHO_CARTA - margen, y: margen }, end: { x: ANCHO_CARTA - margen, y: margen + largo }, color });
}

const QR_SIZE = 80;
const QR_PADDING = 3;

async function agregarQr(pdfDoc: PDFDocument, page: PDFPage, qrTexto: string, margen: number) {
  // QR de alta calidad: genera a mayor resolucion y con ECC alto para mejorar deteccion,
  // pero se incrusta al mismo tamaño final (evita pixeles borrosos por submuestreo pobre).
  const qrDataUrl = await QRCode.toDataURL(qrTexto, {
    margin: 4,
    width: 520,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#FFFFFF' }
  });
  const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrBytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const qrImage = await pdfDoc.embedPng(qrBytes);
  const qrSize = QR_SIZE;
  const padding = QR_PADDING;
  const boxW = qrSize + padding * 2;
  const boxH = qrSize + padding * 2;

  const x = ANCHO_CARTA - margen - qrSize;
  const y = ALTO_CARTA - margen - qrSize;

  // Fondo blanco (quiet zone) y borde sutil para asegurar legibilidad.
  page.drawRectangle({
    x: x - padding,
    y: y - padding,
    width: boxW,
    height: boxH,
    color: rgb(1, 1, 1),
    borderWidth: 1,
    borderColor: rgb(0.75, 0.79, 0.84)
  });

  page.drawImage(qrImage, {
    x,
    y,
    width: qrSize,
    height: qrSize
  });

  return { qrSize, x, y, padding, boxW, boxH };
}


type LogoEmbed = {
  image: Awaited<ReturnType<PDFDocument['embedPng']>>;
  width: number;
  height: number;
};

async function intentarEmbedImagen(pdfDoc: PDFDocument, src?: string): Promise<LogoEmbed | undefined> {
  const s = String(src ?? '').trim();
  if (!s) return undefined;

  try {
    if (s.startsWith('data:image/png;base64,')) {
      const base64 = s.replace(/^data:image\/png;base64,/, '');
      const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
      const image = await pdfDoc.embedPng(bytes);
      return { image, width: image.width, height: image.height };
    }
    if (s.startsWith('data:image/jpeg;base64,') || s.startsWith('data:image/jpg;base64,')) {
      const base64 = s.replace(/^data:image\/(jpeg|jpg);base64,/, '');
      const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
      const image = await pdfDoc.embedJpg(bytes);
      return { image: image as unknown as Awaited<ReturnType<PDFDocument['embedPng']>>, width: image.width, height: image.height };
    }

    const candidatos = (() => {
      if (path.isAbsolute(s)) return [s];
      const cwd = process.cwd();
      // En monorepo, el cwd suele ser apps/backend. Intenta subir niveles.
      return [
        path.resolve(cwd, s),
        path.resolve(cwd, '..', s),
        path.resolve(cwd, '..', '..', s),
        path.resolve(cwd, '..', '..', '..', s)
      ];
    })();

    const ruta = await (async () => {
      for (const c of candidatos) {
        try {
          await fs.access(c);
          return c;
        } catch {
          // sigue intentando
        }
      }
      // Mantener el comportamiento anterior (para mensajes/paths raros)
      return path.isAbsolute(s) ? s : path.resolve(process.cwd(), s);
    })();

    const buffer = await fs.readFile(ruta);
    const ext = path.extname(ruta).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      const image = await pdfDoc.embedJpg(buffer);
      return { image: image as unknown as Awaited<ReturnType<PDFDocument['embedPng']>>, width: image.width, height: image.height };
    }
    const image = await pdfDoc.embedPng(buffer);
    return { image, width: image.width, height: image.height };
  } catch {
    return undefined;
  }
}

function ordenarPreguntas(preguntas: PreguntaBase[], mapa: MapaVariante) {
  const mapaPreguntas = new Map(preguntas.map((pregunta) => [pregunta.id, pregunta]));
  return mapa.ordenPreguntas
    .map((id) => mapaPreguntas.get(id))
    .filter((pregunta): pregunta is PreguntaBase => Boolean(pregunta));
}

function normalizarEspacios(valor: string) {
  return valor.replace(/\s+/g, ' ').trim();
}

type SegmentoTexto = { texto: string; font: PDFFont; size: number; esCodigo?: boolean };
type LineaSegmentos = { segmentos: SegmentoTexto[]; lineHeight: number };

function partirCodigoEnLineas(texto: string) {
  // Preserva saltos de linea; expande tabs.
  return String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\t/g, '  '));
}

function partirBloquesCodigo(texto: string) {
  const src = String(texto ?? '');
  const bloques: Array<{ tipo: 'texto' | 'codigo'; contenido: string }> = [];

  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf('```', i);
    if (idx === -1) {
      bloques.push({ tipo: 'texto', contenido: src.slice(i) });
      break;
    }

    if (idx > i) bloques.push({ tipo: 'texto', contenido: src.slice(i, idx) });

    const fin = src.indexOf('```', idx + 3);
    if (fin === -1) {
      // Sin cierre: trata como texto normal.
      bloques.push({ tipo: 'texto', contenido: src.slice(idx) });
      break;
    }

    const cuerpo = src.slice(idx + 3, fin);
    // Permite un "lenguaje" en la primera linea tipo ```js
    const lineas = partirCodigoEnLineas(cuerpo);
    const primera = lineas[0] ?? '';
    const resto = lineas.slice(1);
    const pareceLang = primera.trim().length > 0 && resto.length > 0;
    const contenido = (pareceLang ? resto : lineas).join('\n');
    bloques.push({ tipo: 'codigo', contenido });
    i = fin + 3;
  }

  return bloques;
}

function partirInlineCodigo(texto: string) {
  // Divide por `...` (sin escapes). Devuelve segmentos alternando texto/codigo.
  const src = String(texto ?? '');
  const out: Array<{ tipo: 'texto' | 'codigo'; contenido: string }> = [];
  let actual = '';
  let enCodigo = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '`') {
      out.push({ tipo: enCodigo ? 'codigo' : 'texto', contenido: actual });
      actual = '';
      enCodigo = !enCodigo;
      continue;
    }
    actual += ch;
  }
  out.push({ tipo: enCodigo ? 'codigo' : 'texto', contenido: actual });
  return out;
}

function widthSeg(seg: SegmentoTexto) {
  return seg.font.widthOfTextAtSize(seg.texto, seg.size);
}

function envolverSegmentos({ segmentos, maxWidth, preservarEspaciosIniciales }: { segmentos: SegmentoTexto[]; maxWidth: number; preservarEspaciosIniciales?: boolean }) {
  const lineas: SegmentoTexto[][] = [];
  let actual: SegmentoTexto[] = [];
  let anchoActual = 0;

  const pushLinea = () => {
    lineas.push(actual);
    actual = [];
    anchoActual = 0;
  };

  for (const seg of segmentos) {
    const texto = String(seg.texto ?? '');
    if (!texto) continue;

    const esCodigo = Boolean(seg.esCodigo);
    const tokens = esCodigo ? [texto] : texto.split(/(\s+)/).filter((p) => p.length > 0);

    for (const token of tokens) {
      const esSoloEspacios = /^\s+$/.test(token);
      if (!preservarEspaciosIniciales && actual.length === 0 && esSoloEspacios) continue;

      const tokenSeg: SegmentoTexto = { ...seg, texto: token };
      const w = widthSeg(tokenSeg);
      if (anchoActual + w <= maxWidth) {
        actual.push(tokenSeg);
        anchoActual += w;
        continue;
      }

      if (actual.length > 0) {
        pushLinea();
        if (!preservarEspaciosIniciales && esSoloEspacios) continue;
      }

      // Token demasiado ancho: trocea por caracter.
      if (w > maxWidth) {
        let chunk = '';
        for (const ch of token) {
          const c2 = chunk + ch;
          const w2 = seg.font.widthOfTextAtSize(c2, seg.size);
          if (w2 <= maxWidth) {
            chunk = c2;
            continue;
          }
          if (chunk) {
            actual.push({ ...seg, texto: chunk });
            pushLinea();
          }
          chunk = ch;
        }
        if (chunk) {
          actual.push({ ...seg, texto: chunk });
          anchoActual = widthSeg({ ...seg, texto: chunk });
        }
        continue;
      }

      actual.push(tokenSeg);
      anchoActual = w;
    }
  }

  if (actual.length > 0) lineas.push(actual);
  return lineas.length > 0 ? lineas : [[]];
}

function envolverTextoMixto({
  texto,
  maxWidth,
  fuente,
  fuenteMono,
  sizeTexto,
  sizeCodigoInline,
  sizeCodigoBloque,
  lineHeightTexto,
  lineHeightCodigo
}: {
  texto: string;
  maxWidth: number;
  fuente: PDFFont;
  fuenteMono: PDFFont;
  sizeTexto: number;
  sizeCodigoInline: number;
  sizeCodigoBloque: number;
  lineHeightTexto: number;
  lineHeightCodigo: number;
}) {
  const bloques = partirBloquesCodigo(texto);
  const lineas: LineaSegmentos[] = [];

  for (const bloque of bloques) {
    if (bloque.tipo === 'codigo') {
      const rawLines = partirCodigoEnLineas(bloque.contenido);
      for (const raw of rawLines) {
        const seg: SegmentoTexto = { texto: String(raw ?? ''), font: fuenteMono, size: sizeCodigoBloque, esCodigo: true };
        const env = envolverSegmentos({ segmentos: [seg], maxWidth, preservarEspaciosIniciales: true });
        for (const linea of env) {
          lineas.push({ segmentos: linea.length > 0 ? linea : [{ ...seg, texto: '' }], lineHeight: lineHeightCodigo });
        }
      }
      continue;
    }

    const textoPlano = String(bloque.contenido ?? '');
    const inline = partirInlineCodigo(textoPlano);
    const segmentos: SegmentoTexto[] = [];
    for (const s of inline) {
      if (!s.contenido) continue;
      if (s.tipo === 'codigo') {
        // Mantener lo escrito, pero evita whitespace extremo.
        const t = String(s.contenido).replace(/\s+/g, ' ').trim();
        if (!t) continue;
        segmentos.push({ texto: t, font: fuenteMono, size: sizeCodigoInline, esCodigo: true });
      } else {
        const t = normalizarEspacios(String(s.contenido));
        if (!t) continue;
        segmentos.push({ texto: t, font: fuente, size: sizeTexto, esCodigo: false });
      }
    }

    if (segmentos.length === 0) {
      lineas.push({ segmentos: [{ texto: '', font: fuente, size: sizeTexto }], lineHeight: lineHeightTexto });
      continue;
    }

    // Insertar espacios entre segmentos cuando cambian de tipo y no hay espacio explicito.
    const conEspacios: SegmentoTexto[] = [];
    for (let idx = 0; idx < segmentos.length; idx++) {
      const seg = segmentos[idx];
      if (conEspacios.length > 0) {
        const prev = conEspacios[conEspacios.length - 1];
        const prevEndsSpace = /\s$/.test(prev.texto);
        const segStartsSpace = /^\s/.test(seg.texto);
        if (!prevEndsSpace && !segStartsSpace) {
          conEspacios.push({ texto: ' ', font: fuente, size: sizeTexto, esCodigo: false });
        }
      }
      conEspacios.push(seg);
    }

    const env = envolverSegmentos({ segmentos: conEspacios, maxWidth });
    for (const linea of env) {
      lineas.push({ segmentos: linea.length > 0 ? linea : [{ texto: '', font: fuente, size: sizeTexto }], lineHeight: lineHeightTexto });
    }
  }

  return lineas.length > 0 ? lineas : [{ segmentos: [{ texto: '', font: fuente, size: sizeTexto }], lineHeight: lineHeightTexto }];
}

function dibujarLineasMixtas({ page, lineas, x, y, colorTexto }: { page: PDFPage; lineas: LineaSegmentos[]; x: number; y: number; colorTexto?: ReturnType<typeof rgb> }) {
  let cursorY = y;
  for (const linea of lineas) {
    let cursorX = x;
    for (const seg of linea.segmentos) {
      const t = String(seg.texto ?? '');
      if (t) {
        page.drawText(t, { x: cursorX, y: cursorY, size: seg.size, font: seg.font, color: colorTexto });
        cursorX += seg.font.widthOfTextAtSize(t, seg.size);
      }
    }
    cursorY -= linea.lineHeight;
  }
  return cursorY;
}

function partirEnLineas({ texto, maxWidth, font, size }: { texto: string; maxWidth: number; font: PDFFont; size: number }) {
  const limpio = normalizarEspacios(String(texto ?? ''));
  if (!limpio) return [''];

  const palabras = limpio.split(' ');
  const lineas: string[] = [];
  let actual = '';

  const cabe = (t: string) => font.widthOfTextAtSize(t, size) <= maxWidth;

  for (const palabra of palabras) {
    const candidato = actual ? `${actual} ${palabra}` : palabra;
    if (cabe(candidato)) {
      actual = candidato;
      continue;
    }

    if (actual) lineas.push(actual);

    // Si la palabra sola no cabe, se trocea por caracteres.
    if (!cabe(palabra)) {
      let chunk = '';
      for (const ch of palabra) {
        const c2 = chunk + ch;
        if (cabe(c2)) {
          chunk = c2;
        } else {
          if (chunk) lineas.push(chunk);
          chunk = ch;
        }
      }
      actual = chunk;
    } else {
      actual = palabra;
    }
  }

  if (actual) lineas.push(actual);
  return lineas.length > 0 ? lineas : [''];
}

export async function generarPdfExamen({
  titulo,
  folio,
  preguntas,
  mapaVariante,
  tipoExamen,
  totalPaginas,
  margenMm = 10,
  encabezado
}: {
  titulo: string;
  folio: string;
  preguntas: PreguntaBase[];
  mapaVariante: MapaVariante;
  tipoExamen: 'parcial' | 'global';
  totalPaginas: number;
  margenMm?: number;
  encabezado?: {
    institucion?: string;
    lema?: string;
    materia?: string;
    docente?: string;
    instrucciones?: string;
    alumno?: { nombre?: string; grupo?: string };
    mostrarInstrucciones?: boolean;
    logos?: { izquierdaPath?: string; derechaPath?: string };
  };
}) {
  const pdfDoc = await PDFDocument.create();
  void tipoExamen;
  const fuente = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fuenteBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fuenteItalica = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fuenteMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const margen = mmAPuntos(margenMm);
  const paginasObjetivo = Number.isFinite(totalPaginas) ? Math.max(1, Math.floor(totalPaginas)) : 1;

  const colorPrimario = rgb(0.07, 0.22, 0.42);
  const colorGris = rgb(0.38, 0.38, 0.38);
  const colorLinea = rgb(0.75, 0.79, 0.84);

  // Tipografías compactas (pero legibles) para encajar más preguntas.
  const sizeTitulo = 13;
  const sizeMeta = 8.3;
  const sizePregunta = 8.6;
  const sizeOpcion = 7.6;
  // Codigo: monospace ligeramente mas pequeno.
  const sizeCodigoInline = 8.5;
  const sizeCodigoBloque = 8;

  const lineaPregunta = 9.3;
  const lineaOpcion = 8.4;
  // Reduce el “aire” entre preguntas para compactar.
  const separacionPregunta = 0;

  const lineaCodigoBloque = 9;

  // OMR: burbujas A–E con espaciado fijo para evitar superposiciones.
  const OMR_TOTAL_LETRAS = 5;
  const omrRadio = 3.7;
  const omrPasoY = 9.2;
  const omrPadding = 2.0;
  const omrExtraTitulo = 14;

  const anchoColRespuesta = 52;
  const gutterRespuesta = 16;
  const xColRespuesta = ANCHO_CARTA - margen - anchoColRespuesta;
  const xDerechaTexto = xColRespuesta - gutterRespuesta;

  const xNumeroPregunta = margen;
  const xTextoPregunta = margen + 20;
  const anchoTextoPregunta = Math.max(60, xDerechaTexto - xTextoPregunta);

  const INSTRUCCIONES_DEFAULT =
    'Por favor conteste las siguientes preguntas referentes al parcial. ' +
    'Rellene el círculo de la respuesta más adecuada, evitando salirse del mismo. ' +
    'Cada pregunta vale 10 puntos si está completa y es correcta.';

  const DEFAULT_INSTITUCION = 'Centro Universitario Hidalguense';
  const DEFAULT_LEMA = 'La sabiduria es nuestra fuerza';

  const institucion = String(encabezado?.institucion ?? process.env.EXAMEN_INSTITUCION ?? DEFAULT_INSTITUCION).trim();
  const lema = String(encabezado?.lema ?? process.env.EXAMEN_LEMA ?? DEFAULT_LEMA).trim();
  const materia = String(encabezado?.materia ?? '').trim();
  const docente = String(encabezado?.docente ?? '').trim();
  const mostrarInstrucciones = encabezado?.mostrarInstrucciones !== false;
  const alumnoNombre = String(encabezado?.alumno?.nombre ?? '').trim();
  const alumnoGrupo = String(encabezado?.alumno?.grupo ?? '').trim();
  const instrucciones = String(encabezado?.instrucciones ?? '').trim() || INSTRUCCIONES_DEFAULT;

  // Solo muestra logos si se proporcionan explicitamente (o via env).
  const logoIzqSrc = encabezado?.logos?.izquierdaPath ?? process.env.EXAMEN_LOGO_IZQ_PATH ?? '';
  const logoDerSrc = encabezado?.logos?.derechaPath ?? process.env.EXAMEN_LOGO_DER_PATH ?? '';

  const izquierda = await intentarEmbedImagen(pdfDoc, logoIzqSrc);
  const derecha = await intentarEmbedImagen(pdfDoc, logoDerSrc);

  const logos = { izquierda, derecha };

  const GRID_STEP = 4;
  const snapToGrid = (y: number) => Math.floor(y / GRID_STEP) * GRID_STEP;

  const preguntasOrdenadas = ordenarPreguntas(preguntas, mapaVariante);
  const totalPreguntas = preguntasOrdenadas.length;
  let indicePregunta = 0;
  let numeroPagina = 1;
  const paginasMeta: { numero: number; qrTexto: string; preguntasDel: number; preguntasAl: number }[] = [];
  const metricasPaginas: Array<{ numero: number; fraccionVacia: number; preguntas: number }> = [];
  // Se guarda el mapa de posiciones para el escaneo OMR posterior.
  const paginasOmr: Array<{
    numeroPagina: number;
    preguntas: Array<{
      numeroPregunta: number;
      idPregunta: string;
      opciones: Array<{ letra: string; x: number; y: number }>;
      fiduciales?: { top: { x: number; y: number }; bottom: { x: number; y: number } };
    }>;
  }> = [];

  const imagenesPregunta = new Map<string, LogoEmbed>();
  for (const pregunta of preguntasOrdenadas) {
    const src = String(pregunta.imagenUrl ?? '').trim();
    if (!src) continue;
    const emb = await intentarEmbedImagen(pdfDoc, src);
    if (emb) imagenesPregunta.set(pregunta.id, emb);
  }

  // Indicaciones compactas (prioriza espacio para preguntas).
  const sizeIndicacionesBase = 7.2;
  const lineaIndicacionesBase = 8.6;
  const maxWidthIndicaciones = Math.max(120, xDerechaTexto - (margen + 10));
  const lineasIndicaciones = mostrarInstrucciones
    ? partirEnLineas({ texto: instrucciones, maxWidth: maxWidthIndicaciones, font: fuente, size: sizeIndicacionesBase })
    : [];
  const indicacionesPendientes = mostrarInstrucciones && lineasIndicaciones.length > 0;

  const headerHeightFirst = 92;
  const headerHeightOther = Math.max(58, QR_SIZE + QR_PADDING * 2 + 22);

  while (numeroPagina <= paginasObjetivo && (numeroPagina === 1 || indicePregunta < totalPreguntas)) {
    const page = pdfDoc.addPage([ANCHO_CARTA, ALTO_CARTA]);
    const qrTexto = String(folio ?? '').trim().toUpperCase();
    const qrTextoPagina = `EXAMEN:${qrTexto}:P${numeroPagina}`;
    let preguntasDel = 0;
    let preguntasAl = 0;
    const mapaPagina: Array<{
      numeroPregunta: number;
      idPregunta: string;
      opciones: Array<{ letra: string; x: number; y: number }>;
      fiduciales?: { top: { x: number; y: number }; bottom: { x: number; y: number } };
    }> = [];

    const yTop = ALTO_CARTA - margen;
    const esPrimera = numeroPagina === 1;
    const altoEncabezado = esPrimera ? headerHeightFirst : headerHeightOther;
    const xCaja = margen + 2;
    const wCaja = ANCHO_CARTA - 2 * margen - 4;
    const yCaja = yTop - altoEncabezado;

    // Encabezado institucional SOLO en la primera pagina.
    if (esPrimera) {
      page.drawRectangle({ x: xCaja, y: yCaja, width: wCaja, height: altoEncabezado, color: rgb(0.97, 0.98, 0.99) });
      page.drawLine({ start: { x: xCaja, y: yCaja }, end: { x: xCaja + wCaja, y: yCaja }, color: colorLinea, thickness: 1 });
      // Barra superior moderna.
      page.drawRectangle({ x: xCaja, y: yTop - 8, width: wCaja, height: 3, color: colorPrimario });
    }

    // Marcas y QR (OMR/escaneo)
    agregarMarcasRegistro(page, margen);
    const { x: xQr, y: yQr, padding: qrPadding } = await agregarQr(pdfDoc, page, qrTextoPagina, margen);

    // Folio impreso debajo del QR (sin invadir el quiet-zone) y dentro del encabezado.
    const yFolio = Math.max(yQr - 18, yCaja + 14);
    const yPag = Math.max(yFolio - 10, yCaja + 4);
    page.drawText(qrTexto, { x: xQr, y: yFolio, size: 9, font: fuenteBold, color: colorPrimario });
    page.drawText(`PAG ${numeroPagina}`, { x: xQr, y: yPag, size: 8.5, font: fuente, color: colorGris });

    // Numero de pagina discreto (no es encabezado): pie.
    page.drawText(`Pagina ${numeroPagina}`, {
      x: ANCHO_CARTA - margen - 120,
      y: margen - 16,
      size: 8.5,
      font: fuente,
      color: colorGris
    });

    // Logos SOLO en primera pagina.
    if (esPrimera) {
      const logoMaxH = 44;
      if (logos.izquierda) {
        const escala = Math.min(1, logoMaxH / Math.max(1, logos.izquierda.height));
        const w = logos.izquierda.width * escala;
        const h = logos.izquierda.height * escala;
        page.drawImage(logos.izquierda.image, { x: margen + 10, y: yTop - h - 12, width: w, height: h });
      }
      if (logos.derecha) {
        const escala = Math.min(1, logoMaxH / Math.max(1, logos.derecha.height));
        const w = logos.derecha.width * escala;
        const h = logos.derecha.height * escala;
        // Coloca a la izquierda del QR sin invadirlo.
        const xMax = xQr - (qrPadding + 10);
        const x = Math.max(margen + 10, xMax - w);
        if (x + w <= xMax) {
          page.drawImage(logos.derecha.image, { x, y: yTop - h - 12, width: w, height: h });
        }
      }
    }

    // Texto del encabezado (solo primera pagina, centrado y limpio).
    const xTexto = margen + 70;
    if (esPrimera) {
      const xMaxEnc = xQr - (qrPadding + 8);
      const maxWidthEnc = Math.max(160, xMaxEnc - xTexto);

      const insti = (partirEnLineas({ texto: institucion, maxWidth: maxWidthEnc, font: fuenteBold, size: 12 })[0] ?? '').trim();
      const tit = (partirEnLineas({ texto: titulo, maxWidth: maxWidthEnc, font: fuenteBold, size: sizeTitulo })[0] ?? '').trim();
      const lem = lema ? (partirEnLineas({ texto: lema, maxWidth: maxWidthEnc, font: fuenteItalica, size: 9 })[0] ?? '').trim() : '';

      const yInsti = yTop - 24;
      page.drawText(insti, { x: xTexto, y: yInsti, size: 12, font: fuenteBold, color: colorPrimario });
      page.drawText(tit, { x: xTexto, y: yInsti - 20, size: sizeTitulo, font: fuenteBold, color: rgb(0.08, 0.08, 0.08) });
      if (lem) {
        page.drawText(lem, { x: xTexto, y: yInsti - 36, size: 9, font: fuenteItalica, color: colorGris });
      }

      const metaY = yTop - 68;
      const lineaMeta = 10.5;
      const meta = [materia ? `Materia: ${materia}` : '', docente ? `Docente: ${docente}` : ''].filter(Boolean).join('   |   ');
      const metaLineas = partirEnLineas({ texto: meta, maxWidth: maxWidthEnc, font: fuente, size: sizeMeta }).slice(0, 2);
      metaLineas.forEach((linea, idx) => {
        if (!linea) return;
        page.drawText(linea, { x: xTexto, y: metaY - idx * lineaMeta, size: sizeMeta, font: fuente, color: colorGris });
      });

      // Campos alumno/grupo
      const yCampos = metaY - metaLineas.length * lineaMeta - 10;
      page.drawText('Alumno:', { x: xTexto, y: yCampos, size: 10, font: fuenteBold, color: rgb(0.15, 0.15, 0.15) });
      const alumnoLineaEnd = Math.min(xTexto + 260, xMaxEnc - 110);
      page.drawLine({ start: { x: xTexto + 52, y: yCampos + 3 }, end: { x: alumnoLineaEnd, y: yCampos + 3 }, color: colorLinea, thickness: 1 });
      if (alumnoNombre) {
        const maxAlumno = Math.max(40, alumnoLineaEnd - (xTexto + 56));
        const alumnoLinea = partirEnLineas({ texto: alumnoNombre, maxWidth: maxAlumno, font: fuente, size: 10 })[0] ?? '';
        page.drawText(alumnoLinea, { x: xTexto + 56, y: yCampos, size: 10, font: fuente, color: rgb(0.1, 0.1, 0.1) });
      }

      const xGrupo = alumnoLineaEnd + 10;
      const yGrupo = yCampos;
      page.drawText('Grupo:', { x: xGrupo, y: yGrupo, size: 10, font: fuenteBold, color: rgb(0.15, 0.15, 0.15) });
      const grupoLineaEnd = Math.min(xGrupo + 65, xMaxEnc);
      page.drawLine({ start: { x: xGrupo + 45, y: yGrupo + 3 }, end: { x: grupoLineaEnd, y: yGrupo + 3 }, color: colorLinea, thickness: 1 });
      if (alumnoGrupo) {
        const maxGrupo = Math.max(40, grupoLineaEnd - (xGrupo + 50));
        const grupoLinea = partirEnLineas({ texto: alumnoGrupo, maxWidth: maxGrupo, font: fuente, size: 10 })[0] ?? '';
        page.drawText(grupoLinea, { x: xGrupo + 50, y: yGrupo, size: 10, font: fuente, color: rgb(0.1, 0.1, 0.1) });
      }
    }

    // Zona segura inferior del QR (incluye folio debajo).
    const yZonaContenido = yCaja - 4;
    const cursorYInicio = snapToGrid(yZonaContenido);
    let cursorY = cursorYInicio;
    if (esPrimera) cursorY -= 0;

  const alturaDisponibleMin = margen + 28;

    const calcularAlturaPregunta = (pregunta: PreguntaBase, numero: number) => {
      const lineasEnunciado = envolverTextoMixto({
        texto: pregunta.enunciado,
        maxWidth: anchoTextoPregunta,
        fuente,
        fuenteMono,
        sizeTexto: sizePregunta,
        sizeCodigoInline,
        sizeCodigoBloque,
        lineHeightTexto: lineaPregunta,
        lineHeightCodigo: lineaCodigoBloque
      });
      const emb = imagenesPregunta.get(pregunta.id);
      const tieneImagen = Boolean(emb);
      let alto = lineasEnunciado.reduce((acc, l) => acc + l.lineHeight, 0);
      if (tieneImagen && emb) {
        const maxW = anchoTextoPregunta;
        const maxH = 60;
        const escala = Math.min(1, maxW / emb.width, maxH / emb.height);
        alto += emb.height * escala + 3;
      }

      const ordenOpciones = mapaVariante.ordenOpcionesPorPregunta[pregunta.id] ?? [0, 1, 2, 3, 4];
      const totalOpciones = ordenOpciones.length;
      const mitad = Math.ceil(totalOpciones / 2);

      const anchoOpcionesTotal = Math.max(80, xDerechaTexto - xTextoPregunta);
      const gutterCols = 8;
      const colWidth = totalOpciones > 1 ? (anchoOpcionesTotal - gutterCols) / 2 : anchoOpcionesTotal;
      const prefixWidth = fuenteBold.widthOfTextAtSize('E) ', sizeOpcion);
      const maxTextWidth = Math.max(30, colWidth - prefixWidth);

      const cols = [ordenOpciones.slice(0, mitad), ordenOpciones.slice(mitad)];
      const alturasCols = [0, 0];
      cols.forEach((col, colIdx) => {
        for (const indiceOpcion of col) {
          const opcion = pregunta.opciones[indiceOpcion];
          const lineasOpcion = envolverTextoMixto({
            texto: opcion?.texto ?? '',
            maxWidth: maxTextWidth,
            fuente,
            fuenteMono,
            sizeTexto: sizeOpcion,
            sizeCodigoInline: Math.min(sizeCodigoInline, sizeOpcion),
            sizeCodigoBloque,
            lineHeightTexto: lineaOpcion,
            lineHeightCodigo: lineaCodigoBloque
          });
      alturasCols[colIdx] += lineasOpcion.reduce((acc, l) => acc + l.lineHeight, 0) + 0.5;
        }
      });
      const altoOpciones = Math.max(alturasCols[0], alturasCols[1]);
      const altoOmrMin = (OMR_TOTAL_LETRAS - 1) * omrPasoY + (omrExtraTitulo + omrPadding);
      alto += Math.max(altoOpciones, altoOmrMin);
      alto += separacionPregunta;
      // Reserva extra para evitar quedar demasiado pegado al limite.
      alto += 2;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void numero;
      return alto;
    };

    // Indicaciones: SOLO en pagina 1, pero siempre completas.
    // Regla: si no caben, se reduce tipografia/leading; si aun asi son largas,
    // las preguntas se empujan a pagina 2 (no se parte el bloque).
    if (esPrimera && indicacionesPendientes && cursorY > alturaDisponibleMin + 26) {
      const xInd = margen + 10;
      const yTopInd = cursorY - 6;
      const wInd = Math.min(ANCHO_CARTA - margen - xInd - (anchoColRespuesta + gutterRespuesta), maxWidthIndicaciones + 20);

      const hDisponible = yTopInd - (alturaDisponibleMin + 2);
      const hMin = 18;
      const hMax = Math.max(hMin, hDisponible);

      // Ajuste dinamico para asegurar que todas las lineas entren.
      let sizeIndicaciones = sizeIndicacionesBase;
      let lineaIndicaciones = lineaIndicacionesBase;
      const hLabel = 12;
      const paddingY = 2;
      const maxIter = 10;
      for (let i = 0; i < maxIter; i += 1) {
        const hNecesaria = hLabel + paddingY + lineasIndicaciones.length * lineaIndicaciones;
        if (hNecesaria <= hMax) break;
        sizeIndicaciones = Math.max(6.0, sizeIndicaciones - 0.3);
        lineaIndicaciones = Math.max(6.8, lineaIndicaciones - 0.35);
      }

      const hCaja = Math.min(hMax, Math.max(hMin, hLabel + paddingY + lineasIndicaciones.length * lineaIndicaciones));

      page.drawRectangle({ x: xInd, y: yTopInd - hCaja, width: wInd, height: hCaja, borderWidth: 1, borderColor: colorLinea, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: xInd, y: yTopInd - 6, width: wInd, height: 3, color: colorPrimario });
      page.drawText('Indicaciones', { x: xInd + 8, y: yTopInd - 18, size: 10, font: fuenteBold, color: colorPrimario });

      let yLinea = yTopInd - 30;
      const yMinTexto = yTopInd - hCaja + 10;
      for (const linea of lineasIndicaciones) {
        if (yLinea < yMinTexto) break;
        page.drawText(linea, { x: xInd + 8, y: yLinea, size: sizeIndicaciones, font: fuente, color: rgb(0.1, 0.1, 0.1) });
        yLinea -= lineaIndicaciones;
      }

      // Como el bloque es “solo pagina 1”, si no hay espacio para preguntas, se van a pagina 2.
      cursorY = snapToGrid(yTopInd - hCaja - 6);
      if (cursorY < alturaDisponibleMin + 40) {
        cursorY = alturaDisponibleMin - 1;
      }
    }

    while (indicePregunta < preguntasOrdenadas.length && cursorY > alturaDisponibleMin) {
      const pregunta = preguntasOrdenadas[indicePregunta];
      const numero = indicePregunta + 1;

      const alturaNecesaria = calcularAlturaPregunta(pregunta, numero);
      if (cursorY - alturaNecesaria < alturaDisponibleMin) break;

      if (!preguntasDel) preguntasDel = numero;
      preguntasAl = numero;

      // Numero de pregunta en recuadro.
      const textoNumero = String(numero);
      const wNum = 18;
      const hNum = 14;
      const xNum = xNumeroPregunta;
      const yNum = cursorY - 1;
      page.drawRectangle({ x: xNum, y: yNum, width: wNum, height: hNum, borderWidth: 1, borderColor: colorLinea, color: rgb(1, 1, 1) });
      const sizeNum = textoNumero.length >= 3 ? 8 : 9;
      page.drawText(textoNumero, { x: xNum + 5, y: yNum + 3.2, size: sizeNum, font: fuenteBold, color: colorPrimario });
      const lineasEnunciado = envolverTextoMixto({
        texto: pregunta.enunciado,
        maxWidth: anchoTextoPregunta,
        fuente,
        fuenteMono,
        sizeTexto: sizePregunta,
        sizeCodigoInline,
        sizeCodigoBloque,
        lineHeightTexto: lineaPregunta,
        lineHeightCodigo: lineaCodigoBloque
      });
      cursorY = dibujarLineasMixtas({ page, lineas: lineasEnunciado, x: xTextoPregunta, y: cursorY });

      const emb = imagenesPregunta.get(pregunta.id);
      if (emb) {
        const maxW = anchoTextoPregunta;
        const maxH = 60;
        const escala = Math.min(1, maxW / emb.width, maxH / emb.height);
        const w = emb.width * escala;
        const h = emb.height * escala;
        page.drawImage(emb.image, { x: xTextoPregunta, y: cursorY - h, width: w, height: h });
        cursorY -= h + 3;
      }

      const ordenOpciones = mapaVariante.ordenOpcionesPorPregunta[pregunta.id] ?? [0, 1, 2, 3, 4];
      const totalOpciones = ordenOpciones.length;
      const mitad = Math.ceil(totalOpciones / 2);

      const anchoOpcionesTotal = Math.max(80, xDerechaTexto - xTextoPregunta);
      const gutterCols = 8;
      const colWidth = totalOpciones > 1 ? (anchoOpcionesTotal - gutterCols) / 2 : anchoOpcionesTotal;
      const xCol1 = xTextoPregunta;
      const xCol2 = xTextoPregunta + colWidth + gutterCols;
      const prefixWidth = fuenteBold.widthOfTextAtSize('E) ', sizeOpcion);

      const yInicioOpciones = cursorY;
      let yCol1 = yInicioOpciones;
      let yCol2 = yInicioOpciones;

      const opcionesOmr: Array<{ letra: string; x: number; y: number }> = [];

      const itemsCol1 = ordenOpciones.slice(0, mitad).map((indiceOpcion, idx) => ({ indiceOpcion, letra: String.fromCharCode(65 + idx) }));
      const itemsCol2 = ordenOpciones.slice(mitad).map((indiceOpcion, idx) => ({ indiceOpcion, letra: String.fromCharCode(65 + (mitad + idx)) }));

      const dibujarItem = (xCol: number, yLocal: number, item: { indiceOpcion: number; letra: string }) => {
        page.drawText(`${item.letra})`, { x: xCol, y: yLocal, size: sizeOpcion, font: fuenteBold, color: rgb(0.12, 0.12, 0.12) });
        const opcion = pregunta.opciones[item.indiceOpcion];
        const textoOpcion = String(opcion?.texto ?? '');
        const textoOpcionLimpio = textoOpcion.includes('```') ? textoOpcion : normalizarEspacios(textoOpcion);
        const lineasOpcion = envolverTextoMixto({
          texto: textoOpcionLimpio,
          maxWidth: Math.max(30, colWidth - prefixWidth),
          fuente,
          fuenteMono,
          sizeTexto: sizeOpcion,
          sizeCodigoInline: Math.min(sizeCodigoInline, sizeOpcion),
          sizeCodigoBloque,
          lineHeightTexto: lineaOpcion,
          lineHeightCodigo: lineaCodigoBloque
        });
        const yFinal = dibujarLineasMixtas({ page, lineas: lineasOpcion, x: xCol + prefixWidth, y: yLocal, colorTexto: rgb(0.1, 0.1, 0.1) });
        return yFinal - 2;
      };

      for (const item of itemsCol1) yCol1 = dibujarItem(xCol1, yCol1, item);
      for (const item of itemsCol2) yCol2 = dibujarItem(xCol2, yCol2, item);

      // Caja de OMR (burbujas) en columna derecha.
      // Importante: NO se alinea por columnas de opciones, porque si hay 2 columnas algunas letras comparten Y.
      // En su lugar, se dibuja A–E con espaciado fijo. Esto evita superposiciones siempre.
      const letras = Array.from({ length: OMR_TOTAL_LETRAS }, (_v, i) => String.fromCharCode(65 + i));
      const headerGap = 16;
      const yPrimeraBurbuja = yInicioOpciones - headerGap;
      const top = yPrimeraBurbuja + omrRadio + omrExtraTitulo + 8;
      const yUltimaBurbuja = yPrimeraBurbuja - (OMR_TOTAL_LETRAS - 1) * omrPasoY;
      const bottom = yUltimaBurbuja - omrRadio - 4;
      const hCaja = Math.max(40, top - bottom);

      page.drawRectangle({
        x: xColRespuesta,
        y: bottom,
        width: anchoColRespuesta,
        height: hCaja,
        borderWidth: 1.4,
        borderColor: rgb(0, 0, 0),
        color: rgb(1, 1, 1)
      });
      // Etiqueta con numero de pregunta (recuadro).
      const hTag = 12;
      const wTag = 28;
      const yTag = top - hTag - 2;
      page.drawRectangle({ x: xColRespuesta, y: yTag, width: wTag, height: hTag, color: colorPrimario });
      page.drawText(`#${numero}`, { x: xColRespuesta + 5, y: yTag + 2.6, size: 8, font: fuenteBold, color: rgb(1, 1, 1) });
      const label = 'RESP';
      page.drawText(label, { x: xColRespuesta + wTag + 4, y: yTag + 2.6, size: 7.0, font: fuenteBold, color: colorPrimario });

      const xBurbuja = xColRespuesta + omrPadding + 7;
      for (let i = 0; i < letras.length; i += 1) {
        const letra = letras[i];
        const yBurbuja = yPrimeraBurbuja - i * omrPasoY;
        page.drawCircle({ x: xBurbuja, y: yBurbuja, size: omrRadio, borderWidth: 1.2, borderColor: rgb(0, 0, 0) });
        page.drawText(letra, { x: xBurbuja + 9, y: yBurbuja - 3, size: 8, font: fuente, color: rgb(0.12, 0.12, 0.12) });
        opcionesOmr.push({ letra, x: xBurbuja, y: yBurbuja });
      }
      const fidSize = 6;
      const xFid = xColRespuesta + 6;
      const xFidRight = xColRespuesta + anchoColRespuesta - 6;
      const yFidTop = yPrimeraBurbuja + omrPasoY * 0.8;
      const yFidBottom = yUltimaBurbuja - omrPasoY * 0.8;
      page.drawRectangle({ x: xFid - fidSize / 2, y: yFidTop - fidSize / 2, width: fidSize, height: fidSize, color: rgb(0, 0, 0) });
      page.drawRectangle({ x: xFid - fidSize / 2, y: yFidBottom - fidSize / 2, width: fidSize, height: fidSize, color: rgb(0, 0, 0) });
      page.drawRectangle({ x: xFidRight - fidSize / 2, y: yFidTop - fidSize / 2, width: fidSize, height: fidSize, color: rgb(0, 0, 0) });
      page.drawRectangle({ x: xFidRight - fidSize / 2, y: yFidBottom - fidSize / 2, width: fidSize, height: fidSize, color: rgb(0, 0, 0) });

      cursorY = Math.min(yCol1, yCol2, bottom - 6);

      cursorY -= separacionPregunta;
      cursorY = snapToGrid(cursorY);
      indicePregunta += 1;
      mapaPagina.push({
        numeroPregunta: numero,
        idPregunta: pregunta.id,
        opciones: opcionesOmr,
        fiduciales: { top: { x: xFid, y: yFidTop }, bottom: { x: xFid, y: yFidBottom } }
      });
    }

    const alturaUtil = Math.max(1, cursorYInicio - alturaDisponibleMin);
    const alturaRestante = Math.max(0, cursorY - alturaDisponibleMin);
    const fraccionVacia = Math.max(0, Math.min(1, alturaRestante / alturaUtil));
    metricasPaginas.push({ numero: numeroPagina, fraccionVacia, preguntas: mapaPagina.length });

    paginasMeta.push({ numero: numeroPagina, qrTexto: qrTextoPagina, preguntasDel, preguntasAl });

    paginasOmr.push({ numeroPagina, preguntas: mapaPagina });
    numeroPagina += 1;
  }

  const pdfBytes = await pdfDoc.save();
  const preguntasRestantes = Math.max(0, totalPreguntas - indicePregunta);
  return {
    pdfBytes: Buffer.from(pdfBytes),
    paginas: paginasMeta,
    metricasPaginas,
    mapaOmr: { margenMm, paginas: paginasOmr },
    preguntasRestantes
  };
}
