/**
 * Generacion de PDFs en formato carta con marcas y QR por pagina.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { MapaVariante, PreguntaBase } from './servicioVariantes';

const ANCHO_CARTA = 612;
const ALTO_CARTA = 792;
const MM_A_PUNTOS = 72 / 25.4;

function mmAPuntos(mm: number) {
  return mm * MM_A_PUNTOS;
}

function agregarMarcasRegistro(page: any, margen: number) {
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

async function agregarQr(pdfDoc: PDFDocument, page: any, qrTexto: string, margen: number) {
  const qrDataUrl = await QRCode.toDataURL(qrTexto, { margin: 1, width: 140 });
  const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrBytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const qrImage = await pdfDoc.embedPng(qrBytes);
  const qrSize = 90;

  page.drawImage(qrImage, {
    x: ANCHO_CARTA - margen - qrSize,
    y: ALTO_CARTA - margen - qrSize,
    width: qrSize,
    height: qrSize
  });
}

function ordenarPreguntas(preguntas: PreguntaBase[], mapa: MapaVariante) {
  const mapaPreguntas = new Map(preguntas.map((pregunta) => [pregunta.id, pregunta]));
  return mapa.ordenPreguntas
    .map((id) => mapaPreguntas.get(id))
    .filter((pregunta): pregunta is PreguntaBase => Boolean(pregunta));
}

export async function generarPdfExamen({
  titulo,
  folio,
  preguntas,
  mapaVariante,
  tipoExamen,
  margenMm = 10
}: {
  titulo: string;
  folio: string;
  preguntas: PreguntaBase[];
  mapaVariante: MapaVariante;
  tipoExamen: 'parcial' | 'global';
  margenMm?: number;
}) {
  const pdfDoc = await PDFDocument.create();
  const fuente = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const margen = mmAPuntos(margenMm);
  const paginasMinimas = tipoExamen === 'parcial' ? 2 : 4;

  const preguntasOrdenadas = ordenarPreguntas(preguntas, mapaVariante);
  let indicePregunta = 0;
  let numeroPagina = 1;
  const paginasMeta: { numero: number; qrTexto: string }[] = [];

  while (indicePregunta < preguntasOrdenadas.length || numeroPagina <= paginasMinimas) {
    const page = pdfDoc.addPage([ANCHO_CARTA, ALTO_CARTA]);
    const qrTexto = `EXAMEN:${folio}:P${numeroPagina}`;
    paginasMeta.push({ numero: numeroPagina, qrTexto });

    agregarMarcasRegistro(page, margen);
    await agregarQr(pdfDoc, page, qrTexto, margen);

    page.drawText(titulo, { x: margen, y: ALTO_CARTA - margen - 24, size: 16, font: fuente });
    page.drawText(`Folio: ${folio} | Pagina ${numeroPagina}`, {
      x: margen,
      y: ALTO_CARTA - margen - 44,
      size: 10,
      font: fuente
    });

    let cursorY = ALTO_CARTA - margen - 70;
    const espacioLinea = 14;

    while (indicePregunta < preguntasOrdenadas.length && cursorY > margen + 60) {
      const pregunta = preguntasOrdenadas[indicePregunta];
      const numero = indicePregunta + 1;

      page.drawText(`${numero}. ${pregunta.enunciado}`, { x: margen, y: cursorY, size: 11, font: fuente });
      cursorY -= espacioLinea;

      if (pregunta.imagenUrl) {
        page.drawText('(Imagen adjunta)', { x: margen, y: cursorY, size: 9, font: fuente, color: rgb(0.4, 0.4, 0.4) });
        cursorY -= espacioLinea;
      }

      const ordenOpciones = mapaVariante.ordenOpcionesPorPregunta[pregunta.id] ?? [0, 1, 2, 3, 4];
      ordenOpciones.forEach((indiceOpcion, idx) => {
        const opcion = pregunta.opciones[indiceOpcion];
        const letra = String.fromCharCode(65 + idx);
        page.drawCircle({ x: margen + 6, y: cursorY + 3, size: 4, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
        page.drawText(`${letra}) ${opcion.texto}`, { x: margen + 16, y: cursorY, size: 10, font: fuente });
        cursorY -= espacioLinea;
      });

      cursorY -= espacioLinea / 2;
      indicePregunta += 1;
    }

    numeroPagina += 1;
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes: Buffer.from(pdfBytes), paginas: paginasMeta };
}
