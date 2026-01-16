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

async function agregarQr(pdfDoc: PDFDocument, page: PDFPage, qrTexto: string, margen: number) {
  const qrDataUrl = await QRCode.toDataURL(qrTexto, {
    margin: 2,
    width: 220,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' }
  });
  const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrBytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const qrImage = await pdfDoc.embedPng(qrBytes);
  const qrSize = 96;

  page.drawImage(qrImage, {
    x: ANCHO_CARTA - margen - qrSize,
    y: ALTO_CARTA - margen - qrSize,
    width: qrSize,
    height: qrSize
  });

  return { qrSize };
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

    const ruta = path.isAbsolute(s) ? s : path.resolve(process.cwd(), s);
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
  const fuente = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fuenteBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fuenteItalica = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fuenteMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const margen = mmAPuntos(margenMm);
  const paginasObjetivo = Number.isFinite(totalPaginas) ? Math.max(1, Math.floor(totalPaginas)) : 1;

  const colorPrimario = rgb(0.07, 0.22, 0.42);
  const colorGris = rgb(0.38, 0.38, 0.38);
  const colorLinea = rgb(0.75, 0.79, 0.84);

  // Tipografías más compactas para encajar más preguntas sin sacrificar legibilidad.
  const sizeTitulo = 14;
  const sizeMeta = 9;
  const sizePregunta = 10;
  const sizeOpcion = 9;
  const sizeNota = 8.5;

  // Codigo: monospace ligeramente mas pequeno y con interlineado mas compacto.
  const sizeCodigoInline = 9;
  const sizeCodigoBloque = 8.5;

  const lineaPregunta = 12;
  const lineaOpcion = 11;
  const lineaNota = 11;
  const separacionPregunta = 4;

  const lineaCodigoInline = lineaPregunta; // mismo alto para no afectar layout
  const lineaCodigoBloque = 10;

  const anchoColRespuesta = 120;
  const gutterRespuesta = 10;
  const xColRespuesta = ANCHO_CARTA - margen - anchoColRespuesta;
  const xDerechaTexto = xColRespuesta - gutterRespuesta;

  const xNumeroPregunta = margen;
  const xTextoPregunta = margen + 18;
  const anchoTextoPregunta = Math.max(60, xDerechaTexto - xTextoPregunta);

  const INSTRUCCIONES_DEFAULT =
    'Por favor conteste las siguientes preguntas referentes al parcial. ' +
    'Rellene el círculo de la respuesta más adecuada, evitando salirse del mismo. ' +
    'Cada pregunta vale 10 puntos si está completa y es correcta.';

  const institucion = String(
    encabezado?.institucion ?? process.env.EXAMEN_INSTITUCION ?? 'Sistema de Evaluacion Universitaria'
  ).trim();
  const lema = String(encabezado?.lema ?? process.env.EXAMEN_LEMA ?? '').trim();
  const materia = String(encabezado?.materia ?? '').trim();
  const docente = String(encabezado?.docente ?? '').trim();
  const mostrarInstrucciones = encabezado?.mostrarInstrucciones !== false;
  const alumnoNombre = String(encabezado?.alumno?.nombre ?? '').trim();
  const alumnoGrupo = String(encabezado?.alumno?.grupo ?? '').trim();
  const instrucciones = String(encabezado?.instrucciones ?? '').trim() || INSTRUCCIONES_DEFAULT;

  const logos = {
    izquierda: await intentarEmbedImagen(pdfDoc, encabezado?.logos?.izquierdaPath ?? process.env.EXAMEN_LOGO_IZQ_PATH),
    derecha: await intentarEmbedImagen(pdfDoc, encabezado?.logos?.derechaPath ?? process.env.EXAMEN_LOGO_DER_PATH)
  };

  const preguntasOrdenadas = ordenarPreguntas(preguntas, mapaVariante);
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
    }>;
  }> = [];

  while (numeroPagina <= paginasObjetivo) {
    const page = pdfDoc.addPage([ANCHO_CARTA, ALTO_CARTA]);
    const qrTexto = String(folio ?? '').trim().toUpperCase();
    let preguntasDel = 0;
    let preguntasAl = 0;
    const mapaPagina: Array<{
      numeroPregunta: number;
      idPregunta: string;
      opciones: Array<{ letra: string; x: number; y: number }>;
    }> = [];

    const yTop = ALTO_CARTA - margen;
    const esPrimera = numeroPagina === 1;
    const altoEncabezado = esPrimera ? 118 : 70;
    const xCaja = margen + 2;
    const wCaja = ANCHO_CARTA - 2 * margen - 4;
    const yCaja = yTop - altoEncabezado;

    // Fondo sutil dentro del area util (no tapa marcas)
    page.drawRectangle({ x: xCaja, y: yCaja, width: wCaja, height: altoEncabezado, color: rgb(0.97, 0.98, 0.99) });
    page.drawLine({ start: { x: xCaja, y: yCaja }, end: { x: xCaja + wCaja, y: yCaja }, color: colorLinea, thickness: 1 });

    // Marcas y QR (OMR/escaneo)
    agregarMarcasRegistro(page, margen);
    const { qrSize } = await agregarQr(pdfDoc, page, qrTexto, margen);

    // Folio impreso debajo del QR
    const xQr = ANCHO_CARTA - margen - qrSize;
    const yQr = ALTO_CARTA - margen - qrSize;
    page.drawText(qrTexto, { x: xQr, y: yQr - 12, size: 9, font: fuenteBold, color: colorPrimario });

    // Logos opcionales
    const logoMaxH = esPrimera ? 44 : 34;
    if (logos.izquierda) {
      const escala = Math.min(1, logoMaxH / Math.max(1, logos.izquierda.height));
      const w = logos.izquierda.width * escala;
      const h = logos.izquierda.height * escala;
      page.drawImage(logos.izquierda.image, { x: margen + 8, y: yTop - h - 8, width: w, height: h });
    }
    if (logos.derecha) {
      const escala = Math.min(1, logoMaxH / Math.max(1, logos.derecha.height));
      const w = logos.derecha.width * escala;
      const h = logos.derecha.height * escala;
      // Intenta colocar a la izquierda del QR sin invadir el area
      const xMax = xQr - 10;
      const x = Math.max(margen + 8, xMax - w);
      if (x + w <= xMax) {
        page.drawImage(logos.derecha.image, { x, y: yTop - h - 8, width: w, height: h });
      }
    }

    // Texto del encabezado
    const xTexto = margen + 70;
    if (esPrimera) {
      // Reservar placeholders de logo si no hay imagen para evitar "huecos" y mantener consistencia visual.
      const logoPlaceholderW = 56;
      const logoPlaceholderH = 36;
      if (!logos.izquierda) {
        page.drawRectangle({ x: margen + 8, y: yTop - logoPlaceholderH - 8, width: logoPlaceholderW, height: logoPlaceholderH, borderWidth: 1, borderColor: colorLinea, color: rgb(1, 1, 1) });
        page.drawText('LOGO', { x: margen + 18, y: yTop - 30, size: 9, font: fuenteBold, color: colorGris });
      }
      if (!logos.derecha) {
        const xMax = xQr - 10;
        const x = Math.max(margen + 8, xMax - logoPlaceholderW);
        if (x + logoPlaceholderW <= xMax) {
          page.drawRectangle({ x, y: yTop - logoPlaceholderH - 8, width: logoPlaceholderW, height: logoPlaceholderH, borderWidth: 1, borderColor: colorLinea, color: rgb(1, 1, 1) });
          page.drawText('LOGO', { x: x + 10, y: yTop - 30, size: 9, font: fuenteBold, color: colorGris });
        }
      }

      const maxWidthEnc = Math.max(120, xQr - 12 - xTexto);
      const lineasInsti = partirEnLineas({ texto: institucion, maxWidth: maxWidthEnc, font: fuenteBold, size: 12 });
      page.drawText(lineasInsti[0] ?? '', { x: xTexto, y: yTop - 22, size: 12, font: fuenteBold, color: colorPrimario });

      const lineasTitulo = partirEnLineas({ texto: titulo, maxWidth: maxWidthEnc, font: fuenteBold, size: sizeTitulo });
      page.drawText(lineasTitulo[0] ?? '', { x: xTexto, y: yTop - 42, size: sizeTitulo, font: fuenteBold, color: rgb(0.1, 0.1, 0.1) });
      if (lema) {
        const lineasLema = partirEnLineas({ texto: lema, maxWidth: maxWidthEnc, font: fuenteItalica, size: 9 });
        page.drawText(lineasLema[0] ?? '', { x: xTexto, y: yTop - 58, size: 9, font: fuenteItalica, color: colorGris });
      }

      const metaY = yTop - 72;
      const meta = [materia ? `Materia: ${materia}` : '', docente ? `Docente: ${docente}` : '', `Pagina: ${numeroPagina}`].filter(Boolean).join('   |   ');
      const metaLineas = partirEnLineas({ texto: meta, maxWidth: maxWidthEnc, font: fuente, size: sizeMeta });
      page.drawText(metaLineas[0] ?? '', { x: xTexto, y: metaY, size: sizeMeta, font: fuente, color: colorGris });

      // Campos de alumno/grupo (subidos un poco para no chocar con instrucciones)
      const yCampos = metaY - 14;
      page.drawText('Alumno:', { x: xTexto, y: yCampos, size: 10, font: fuenteBold, color: rgb(0.15, 0.15, 0.15) });
      page.drawLine({ start: { x: xTexto + 52, y: yCampos + 3 }, end: { x: xTexto + 300, y: yCampos + 3 }, color: colorLinea, thickness: 1 });
      if (alumnoNombre) {
        const alumnoLinea = partirEnLineas({ texto: alumnoNombre, maxWidth: 240, font: fuente, size: 10 })[0] ?? '';
        page.drawText(alumnoLinea, { x: xTexto + 56, y: yCampos, size: 10, font: fuente, color: rgb(0.1, 0.1, 0.1) });
      }

      page.drawText('Grupo:', { x: xTexto + 320, y: yCampos, size: 10, font: fuenteBold, color: rgb(0.15, 0.15, 0.15) });
      page.drawLine({ start: { x: xTexto + 365, y: yCampos + 3 }, end: { x: xTexto + 470, y: yCampos + 3 }, color: colorLinea, thickness: 1 });
      if (alumnoGrupo) {
        const grupoLinea = partirEnLineas({ texto: alumnoGrupo, maxWidth: 100, font: fuente, size: 10 })[0] ?? '';
        page.drawText(grupoLinea, { x: xTexto + 370, y: yCampos, size: 10, font: fuente, color: rgb(0.1, 0.1, 0.1) });
      }

      if (mostrarInstrucciones) {
        const xInst = margen + 10;
        const wInst = Math.min(420, xDerechaTexto - xInst - 10);
        const textoInst = instrucciones;
        const lineasInst = partirEnLineas({ texto: textoInst, maxWidth: wInst - 16, font: fuente, size: 8 });
        const yInst = yCaja + 8;

        // No permitir que la caja invada el area de Alumno/Grupo.
        const maxH = Math.max(32, yCampos - yInst - 6);
        const hDeseada = Math.max(32, 8 + lineasInst.length * 10);
        const hInst = Math.min(maxH, hDeseada);

        // Recortar líneas para que quepan.
        const lineasMax = Math.max(1, Math.min(2, Math.floor((hInst - 24) / 9.5)));
        const lineasVisibles = lineasInst.slice(0, lineasMax);

        page.drawRectangle({ x: xInst, y: yInst, width: wInst, height: hInst, borderWidth: 1, borderColor: colorLinea, color: rgb(1, 1, 1) });
        page.drawText('Instrucciones:', { x: xInst + 8, y: yInst + hInst - 14, size: 8.5, font: fuenteBold, color: colorPrimario });
        // Texto debajo del label
        let yTexto = yInst + hInst - 24;
        for (const linea of lineasVisibles) {
          page.drawText(linea, { x: xInst + 8, y: yTexto, size: 8, font: fuente, color: colorGris });
          yTexto -= 9.5;
          if (yTexto < yInst + 6) break;
        }
      }
    } else {
      page.drawText(titulo, { x: margen + 10, y: yTop - 26, size: 12, font: fuenteBold, color: colorPrimario });
      const meta = [`Pagina: ${numeroPagina}`, materia ? `Materia: ${materia}` : ''].filter(Boolean).join('   |   ');
      page.drawText(meta, { x: margen + 10, y: yTop - 42, size: 9, font: fuente, color: colorGris });
    }

  const cursorYInicio = yTop - altoEncabezado - 10;
  let cursorY = cursorYInicio;

  const alturaDisponibleMin = margen + 60;

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
      const tieneImagen = Boolean(String(pregunta.imagenUrl ?? '').trim());
      let alto = lineasEnunciado.reduce((acc, l) => acc + l.lineHeight, 0);
      if (tieneImagen) alto += lineaNota;

      const ordenOpciones = mapaVariante.ordenOpcionesPorPregunta[pregunta.id] ?? [0, 1, 2, 3, 4];
      const totalOpciones = ordenOpciones.length;
      const mitad = Math.ceil(totalOpciones / 2);

      const anchoOpcionesTotal = Math.max(80, xDerechaTexto - xTextoPregunta);
      const gutterCols = 10;
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
          alturasCols[colIdx] += lineasOpcion.reduce((acc, l) => acc + l.lineHeight, 0) + 2;
        }
      });
      alto += Math.max(alturasCols[0], alturasCols[1]);
      alto += separacionPregunta;
      // Reserva extra para evitar quedar demasiado pegado al limite.
      alto += 4;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void numero;
      return alto;
    };

    while (indicePregunta < preguntasOrdenadas.length && cursorY > alturaDisponibleMin) {
      const pregunta = preguntasOrdenadas[indicePregunta];
      const numero = indicePregunta + 1;

      const alturaNecesaria = calcularAlturaPregunta(pregunta, numero);
      if (cursorY - alturaNecesaria < alturaDisponibleMin) break;

      if (!preguntasDel) preguntasDel = numero;
      preguntasAl = numero;

      // Numero + enunciado con wrap (el numero se dibuja aparte para alinear correctamente).
      page.drawText(`${numero}.`, { x: xNumeroPregunta, y: cursorY, size: sizePregunta, font: fuenteBold, color: rgb(0.15, 0.15, 0.15) });
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

      if (pregunta.imagenUrl) {
        page.drawText('(Imagen adjunta)', {
          x: xTextoPregunta,
          y: cursorY,
          size: sizeNota,
          font: fuente,
          color: rgb(0.4, 0.4, 0.4)
        });
        cursorY -= lineaNota;
      }

      const ordenOpciones = mapaVariante.ordenOpcionesPorPregunta[pregunta.id] ?? [0, 1, 2, 3, 4];
      const totalOpciones = ordenOpciones.length;
      const mitad = Math.ceil(totalOpciones / 2);

      const anchoOpcionesTotal = Math.max(80, xDerechaTexto - xTextoPregunta);
      const gutterCols = 10;
      const colWidth = totalOpciones > 1 ? (anchoOpcionesTotal - gutterCols) / 2 : anchoOpcionesTotal;
      const xCol1 = xTextoPregunta;
      const xCol2 = xTextoPregunta + colWidth + gutterCols;
      const prefixWidth = fuenteBold.widthOfTextAtSize('E) ', sizeOpcion);

      const yInicioOpciones = cursorY;
      let yCol1 = yInicioOpciones;
      let yCol2 = yInicioOpciones;

      const yPrimeraLinea: Record<string, number> = {};
      const opcionesOmr: Array<{ letra: string; x: number; y: number }> = [];

      const itemsCol1 = ordenOpciones.slice(0, mitad).map((indiceOpcion, idx) => ({ indiceOpcion, letra: String.fromCharCode(65 + idx) }));
      const itemsCol2 = ordenOpciones.slice(mitad).map((indiceOpcion, idx) => ({ indiceOpcion, letra: String.fromCharCode(65 + (mitad + idx)) }));

      const dibujarItem = (xCol: number, yLocal: number, item: { indiceOpcion: number; letra: string }) => {
        page.drawText(`${item.letra})`, { x: xCol, y: yLocal, size: sizeOpcion, font: fuenteBold, color: rgb(0.12, 0.12, 0.12) });
        yPrimeraLinea[item.letra] = yLocal;
        const opcion = pregunta.opciones[item.indiceOpcion];
        const lineasOpcion = envolverTextoMixto({
          texto: opcion?.texto ?? '',
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

      // Caja de OMR (burbujas) en columna derecha, alineada por letra.
      const letras = [...itemsCol1.map((x) => x.letra), ...itemsCol2.map((x) => x.letra)];
      const ys = letras.map((l) => yPrimeraLinea[l]).filter((v) => typeof v === 'number');
      if (ys.length > 0) {
        // Reservar espacio superior para el título "RESPUESTA" y evitar tapar la primera burbuja.
        const top = Math.max(...ys) + 30;
        const bottom = Math.min(...ys) - 16;
        const hCaja = Math.max(40, top - bottom);
        const padding = 8;
        page.drawRectangle({ x: xColRespuesta, y: bottom, width: anchoColRespuesta, height: hCaja, borderWidth: 1, borderColor: colorLinea, color: rgb(1, 1, 1) });
        page.drawText('RESPUESTA', { x: xColRespuesta + padding, y: top - 14, size: 9, font: fuenteBold, color: colorPrimario });

        for (const letra of letras) {
          const yLinea = yPrimeraLinea[letra];
          const yBurbuja = yLinea + 3.5;
          const xBurbuja = xColRespuesta + padding + 8;
          page.drawCircle({ x: xBurbuja, y: yBurbuja, size: 5.2, borderWidth: 1.1, borderColor: rgb(0, 0, 0) });
          // Letra alineada verticalmente al centro de la burbuja.
          page.drawText(letra, { x: xBurbuja + 12, y: yBurbuja - 3.5, size: 9, font: fuente, color: rgb(0.12, 0.12, 0.12) });
          opcionesOmr.push({ letra, x: xBurbuja, y: yBurbuja });
        }

        cursorY = Math.min(yCol1, yCol2, bottom - 6);
      } else {
        cursorY = Math.min(yCol1, yCol2);
      }

      cursorY -= separacionPregunta;
      indicePregunta += 1;
      mapaPagina.push({ numeroPregunta: numero, idPregunta: pregunta.id, opciones: opcionesOmr });
    }

    const alturaUtil = Math.max(1, cursorYInicio - alturaDisponibleMin);
    const alturaRestante = Math.max(0, cursorY - alturaDisponibleMin);
    const fraccionVacia = Math.max(0, Math.min(1, alturaRestante / alturaUtil));
    metricasPaginas.push({ numero: numeroPagina, fraccionVacia, preguntas: mapaPagina.length });

    paginasMeta.push({ numero: numeroPagina, qrTexto, preguntasDel, preguntasAl });

    paginasOmr.push({ numeroPagina, preguntas: mapaPagina });
    numeroPagina += 1;
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes: Buffer.from(pdfBytes), paginas: paginasMeta, metricasPaginas, mapaOmr: { margenMm, paginas: paginasOmr } };
}
