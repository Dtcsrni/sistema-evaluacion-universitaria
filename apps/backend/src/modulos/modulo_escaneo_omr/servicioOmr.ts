/**
 * Servicio de escaneo OMR basado en posiciones del PDF.
 */
import sharp from 'sharp';
import jsQR from 'jsqr';

export type ResultadoOmr = {
  respuestasDetectadas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>;
  advertencias: string[];
  qrTexto?: string;
};

type Punto = { x: number; y: number };

type MapaOmrPagina = {
  numeroPagina: number;
  preguntas: Array<{
    numeroPregunta: number;
    idPregunta: string;
    opciones: Array<{ letra: string; x: number; y: number }>;
  }>;
};

const ANCHO_CARTA = 612;
const ALTO_CARTA = 792;
const MM_A_PUNTOS = 72 / 25.4;

function limpiarBase64(entrada: string) {
  return entrada.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
}

async function decodificarImagen(base64: string) {
  const buffer = Buffer.from(limpiarBase64(base64), 'base64');
  const imagen = sharp(buffer).rotate();
  const { width, height } = await imagen.metadata();
  if (!width || !height) {
    throw new Error('No se pudo leer la imagen');
  }
  const anchoObjetivo = Math.min(width, 1600);
  const imagenRedimensionada = imagen.resize({ width: anchoObjetivo });
  const data = await imagenRedimensionada.ensureAlpha().raw().toBuffer();
  const metadata = await imagenRedimensionada.metadata();

  return {
    data: new Uint8ClampedArray(data),
    width: metadata.width ?? width,
    height: metadata.height ?? height
  };
}

function detectarQr(data: Uint8ClampedArray, width: number, height: number) {
  const resultado = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return resultado?.data;
}

function obtenerIntensidad(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  const idx = (yi * width + xi) * 4;
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return (r + g + b) / 3;
}

function detectarMarca(data: Uint8ClampedArray, width: number, height: number, region: { x0: number; y0: number; x1: number; y1: number }) {
  const umbral = 60;
  let sumaX = 0;
  let sumaY = 0;
  let conteo = 0;

  for (let y = region.y0; y < region.y1; y += 2) {
    for (let x = region.x0; x < region.x1; x += 2) {
      const intensidad = obtenerIntensidad(data, width, height, x, y);
      if (intensidad < umbral) {
        sumaX += x;
        sumaY += y;
        conteo += 1;
      }
    }
  }

  if (!conteo) return null;
  return { x: sumaX / conteo, y: sumaY / conteo };
}

function calcularHomografia(origen: Punto[], destino: Punto[]) {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = origen[i];
    const { x: u, y: v } = destino[i];

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = resolverSistema(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function resolverSistema(A: number[][], b: number[]) {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);

  for (let i = 0; i < n; i += 1) {
    let maxFila = i;
    for (let k = i + 1; k < n; k += 1) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxFila][i])) {
        maxFila = k;
      }
    }

    if (Math.abs(M[maxFila][i]) < 1e-8) return null;
    [M[i], M[maxFila]] = [M[maxFila], M[i]];

    const pivote = M[i][i];
    for (let j = i; j <= n; j += 1) {
      M[i][j] /= pivote;
    }

    for (let k = 0; k < n; k += 1) {
      if (k === i) continue;
      const factor = M[k][i];
      for (let j = i; j <= n; j += 1) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  return M.map((fila) => fila[n]);
}

function aplicarHomografia(h: number[], punto: Punto) {
  const [h11, h12, h13, h21, h22, h23, h31, h32] = h;
  const denom = h31 * punto.x + h32 * punto.y + 1;
  const x = (h11 * punto.x + h12 * punto.y + h13) / denom;
  const y = (h21 * punto.x + h22 * punto.y + h23) / denom;
  return { x, y };
}

function obtenerTransformacion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  advertencias: string[],
  margenMm: number
) {
  const region = 0.15;
  const regiones = {
    tl: { x0: 0, y0: 0, x1: width * region, y1: height * region },
    tr: { x0: width * (1 - region), y0: 0, x1: width, y1: height * region },
    bl: { x0: 0, y0: height * (1 - region), x1: width * region, y1: height },
    br: { x0: width * (1 - region), y0: height * (1 - region), x1: width, y1: height }
  };

  const tl = detectarMarca(data, width, height, regiones.tl);
  const tr = detectarMarca(data, width, height, regiones.tr);
  const bl = detectarMarca(data, width, height, regiones.bl);
  const br = detectarMarca(data, width, height, regiones.br);

  if (!tl || !tr || !bl || !br) {
    advertencias.push('No se detectaron todas las marcas de registro; usando escala simple');
    const escalaX = width / ANCHO_CARTA;
    const escalaY = height / ALTO_CARTA;
    return (punto: Punto) => ({ x: punto.x * escalaX, y: height - punto.y * escalaY });
  }

  const margen = margenMm * MM_A_PUNTOS;
  const origen = [
    { x: margen, y: margen },
    { x: ANCHO_CARTA - margen, y: margen },
    { x: margen, y: ALTO_CARTA - margen },
    { x: ANCHO_CARTA - margen, y: ALTO_CARTA - margen }
  ];
  const destino = [tl, tr, bl, br];
  const h = calcularHomografia(origen, destino);

  if (!h) {
    advertencias.push('No se pudo calcular homografia; usando escala simple');
    const escalaX = width / ANCHO_CARTA;
    const escalaY = height / ALTO_CARTA;
    return (punto: Punto) => ({ x: punto.x * escalaX, y: height - punto.y * escalaY });
  }

  return (punto: Punto) => aplicarHomografia(h, { x: punto.x, y: ALTO_CARTA - punto.y });
}

function detectarOpcion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centro: Punto
) {
  const radio = 6;
  let pixeles = 0;
  let oscuros = 0;

  for (let y = -radio; y <= radio; y += 1) {
    for (let x = -radio; x <= radio; x += 1) {
      const intensidad = obtenerIntensidad(data, width, height, centro.x + x, centro.y + y);
      pixeles += 1;
      if (intensidad < 120) oscuros += 1;
    }
  }

  const ratio = oscuros / Math.max(1, pixeles);
  return { ratio };
}

export async function analizarOmr(
  imagenBase64: string,
  mapaPagina: MapaOmrPagina,
  qrEsperado?: string,
  margenMm = 10
): Promise<ResultadoOmr> {
  const advertencias: string[] = [];
  const { data, width, height } = await decodificarImagen(imagenBase64);
  const qrTexto = detectarQr(data, width, height);

  if (!qrTexto) {
    advertencias.push('No se detecto QR en la imagen');
  }
  if (qrEsperado && qrTexto && qrTexto !== qrEsperado) {
    advertencias.push('El QR no coincide con el examen esperado');
  }

  const transformar = obtenerTransformacion(data, width, height, advertencias, margenMm);
  const respuestasDetectadas: ResultadoOmr['respuestasDetectadas'] = [];

  mapaPagina.preguntas.forEach((pregunta) => {
    let mejorOpcion: string | null = null;
    let mejorRatio = 0;

    pregunta.opciones.forEach((opcion) => {
      const centro = transformar({ x: opcion.x, y: opcion.y });
      const { ratio } = detectarOpcion(data, width, height, centro);
      if (ratio > mejorRatio) {
        mejorRatio = ratio;
        mejorOpcion = opcion.letra;
      }
    });

    const confianza = Math.min(1, mejorRatio * 1.5);
    respuestasDetectadas.push({ numeroPregunta: pregunta.numeroPregunta, opcion: mejorRatio > 0.15 ? mejorOpcion : null, confianza });
  });

  return { respuestasDetectadas, advertencias, qrTexto };
}
