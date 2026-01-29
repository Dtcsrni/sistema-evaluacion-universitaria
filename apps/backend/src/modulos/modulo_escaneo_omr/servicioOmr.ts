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
    fiduciales?: { top: { x: number; y: number }; bottom: { x: number; y: number } };
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
  const imagen = sharp(buffer).rotate().normalize();
  const { width, height } = await imagen.metadata();
  if (!width || !height) {
    throw new Error('No se pudo leer la imagen');
  }
  const anchoObjetivo = Math.min(width, 1600);
  const imagenRedimensionada = imagen.resize({ width: anchoObjetivo });
  const { data, info } = await imagenRedimensionada.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width ?? width;
  const h = info.height ?? height;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  const integral = calcularIntegral(gray, w, h);

  return {
    data: new Uint8ClampedArray(data),
    gray,
    integral,
    width: w,
    height: h
  };
}

function detectarQr(data: Uint8ClampedArray, width: number, height: number) {
  const resultado = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return resultado?.data;
}

function obtenerIntensidad(gray: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  const idx = yi * width + xi;
  return gray[idx];
}

function calcularIntegral(gray: Uint8ClampedArray, width: number, height: number) {
  const w1 = width + 1;
  const integral = new Uint32Array(w1 * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let fila = 0;
    for (let x = 1; x <= width; x += 1) {
      fila += gray[(y - 1) * width + (x - 1)];
      integral[y * w1 + x] = integral[(y - 1) * w1 + x] + fila;
    }
  }
  return integral;
}

function mediaEnVentana(integral: Uint32Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number) {
  const w1 = width + 1;
  const xa = Math.max(0, Math.min(width, Math.floor(x0)));
  const ya = Math.max(0, Math.min(height, Math.floor(y0)));
  const xb = Math.max(0, Math.min(width, Math.ceil(x1)));
  const yb = Math.max(0, Math.min(height, Math.ceil(y1)));
  const area = Math.max(1, (xb - xa) * (yb - ya));
  const sum =
    integral[yb * w1 + xb] -
    integral[ya * w1 + xb] -
    integral[yb * w1 + xa] +
    integral[ya * w1 + xa];
  return sum / area;
}

function detectarMarca(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  region: { x0: number; y0: number; x1: number; y1: number },
  esquina: 'tl' | 'tr' | 'bl' | 'br'
) {
  const paso = 2;
  let sumaX = 0;
  let sumaY = 0;
  let conteo = 0;
  let sum = 0;
  let sumSq = 0;
  const candidatos: Array<{ x: number; y: number; d: number }> = [];

  // Muestreo ligero para ubicar el centro de la marca negra sin procesar cada pixel.
  for (let y = region.y0; y < region.y1; y += paso) {
    for (let x = region.x0; x < region.x1; x += paso) {
      const intensidad = obtenerIntensidad(gray, width, height, x, y);
      sum += intensidad;
      sumSq += intensidad * intensidad;
    }
  }

  const total = Math.max(1, Math.floor(((region.y1 - region.y0) / paso) * ((region.x1 - region.x0) / paso)));
  const media = sum / total;
  const varianza = Math.max(0, sumSq / total - media * media);
  const desviacion = Math.sqrt(varianza);
  const umbral = Math.max(35, media - Math.max(15, desviacion * 1.1));

  for (let y = region.y0; y < region.y1; y += paso) {
    for (let x = region.x0; x < region.x1; x += paso) {
      const intensidad = obtenerIntensidad(gray, width, height, x, y);
      if (intensidad < umbral) {
        sumaX += x;
        sumaY += y;
        conteo += 1;
        const d =
          esquina === 'tl'
            ? x + y
            : esquina === 'tr'
              ? (width - x) + y
              : esquina === 'bl'
                ? x + (height - y)
                : (width - x) + (height - y);
        candidatos.push({ x, y, d });
      }
    }
  }

  if (!conteo || conteo < 12) return null;
  candidatos.sort((a, b) => a.d - b.d);
  const distanciaMin = candidatos[0]?.d ?? Infinity;
  const distanciaMaxima = Math.max(18, Math.min(width, height) * 0.12);
  if (distanciaMin > distanciaMaxima) {
    return null;
  }
  const limite = Math.max(8, Math.floor(candidatos.length * 0.15));
  let accX = 0;
  let accY = 0;
  for (let i = 0; i < Math.min(limite, candidatos.length); i += 1) {
    accX += candidatos[i].x;
    accY += candidatos[i].y;
  }
  const x = accX / Math.max(1, Math.min(limite, candidatos.length));
  const y = accY / Math.max(1, Math.min(limite, candidatos.length));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: sumaX / conteo, y: sumaY / conteo };
  }
  return { x, y };
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
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  advertencias: string[],
  margenMm: number
) {
  const crearEscala = () => {
    const escalaX = width / ANCHO_CARTA;
    const escalaY = height / ALTO_CARTA;
    return (punto: Punto) => ({ x: punto.x * escalaX, y: height - punto.y * escalaY });
  };
  const region = 0.15;
  const regiones = {
    tl: { x0: 0, y0: 0, x1: width * region, y1: height * region },
    tr: { x0: width * (1 - region), y0: 0, x1: width, y1: height * region },
    bl: { x0: 0, y0: height * (1 - region), x1: width * region, y1: height },
    br: { x0: width * (1 - region), y0: height * (1 - region), x1: width, y1: height }
  };

  const tl = detectarMarca(gray, width, height, regiones.tl, 'tl');
  const tr = detectarMarca(gray, width, height, regiones.tr, 'tr');
  const bl = detectarMarca(gray, width, height, regiones.bl, 'bl');
  const br = detectarMarca(gray, width, height, regiones.br, 'br');

  if (!tl || !tr || !bl || !br) {
    // Sin marcas completas, se aproxima con escala simple para no bloquear el flujo.
    advertencias.push('No se detectaron todas las marcas de registro; usando escala simple');
    return { transformar: crearEscala(), tipo: 'escala' as const };
  }
  const margenMax = 0.2;
  const dentro = (p: Punto, esquina: 'tl' | 'tr' | 'bl' | 'br') =>
    (esquina === 'tl' && p.x < width * margenMax && p.y < height * margenMax) ||
    (esquina === 'tr' && p.x > width * (1 - margenMax) && p.y < height * margenMax) ||
    (esquina === 'bl' && p.x < width * margenMax && p.y > height * (1 - margenMax)) ||
    (esquina === 'br' && p.x > width * (1 - margenMax) && p.y > height * (1 - margenMax));

  if (!dentro(tl, 'tl') || !dentro(tr, 'tr') || !dentro(bl, 'bl') || !dentro(br, 'br')) {
    advertencias.push('Marcas de registro fuera de esquina; usando escala simple');
    return { transformar: crearEscala(), tipo: 'escala' as const };
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
    return { transformar: crearEscala(), tipo: 'escala' as const };
  }

  return {
    transformar: (punto: Punto) => aplicarHomografia(h, { x: punto.x, y: ALTO_CARTA - punto.y }),
    tipo: 'homografia' as const
  };
}

function detectarOpcion(
  gray: Uint8ClampedArray,
  integral: Uint32Array,
  width: number,
  height: number,
  centro: Punto
) {
  const radio = 8;
  const ringInner = 10;
  const ringOuter = 15;
  const outerOuter = ringOuter + 4;
  const promLocal = mediaEnVentana(integral, width, height, centro.x - ringOuter, centro.y - ringOuter, centro.x + ringOuter, centro.y + ringOuter);
  const umbral = Math.max(40, Math.min(220, promLocal - 15));
  let pixeles = 0;
  let oscuros = 0;
  let pixelesRing = 0;
  let oscurosRing = 0;
  let suma = 0;
  let sumaRing = 0;
  let pixelesOuter = 0;
  let sumaOuter = 0;

  // Cuenta pixeles oscuros dentro de un radio fijo para estimar marca.
  for (let y = -outerOuter; y <= outerOuter; y += 1) {
    for (let x = -outerOuter; x <= outerOuter; x += 1) {
      const dist = x * x + y * y;
      if (dist > outerOuter * outerOuter) continue;
      const intensidad = obtenerIntensidad(gray, width, height, centro.x + x, centro.y + y);
      if (dist <= radio * radio) {
        pixeles += 1;
        suma += intensidad;
        if (intensidad < umbral) oscuros += 1;
      } else if (dist >= ringInner * ringInner) {
        if (dist <= ringOuter * ringOuter) {
          pixelesRing += 1;
          sumaRing += intensidad;
          if (intensidad < umbral) oscurosRing += 1;
        } else {
          pixelesOuter += 1;
          sumaOuter += intensidad;
        }
      }
    }
  }

  const ratio = oscuros / Math.max(1, pixeles);
  const ratioRing = oscurosRing / Math.max(1, pixelesRing);
  const promedio = suma / Math.max(1, pixeles);
  const promedioRing = sumaRing / Math.max(1, pixelesRing);
  const promedioOuter = sumaOuter / Math.max(1, pixelesOuter);
  const contraste = Math.max(0, (promedioRing - promedio) / 255);
  const ringContrast = Math.max(0, (promedioOuter - promedioRing) / 255);
  const score = Math.max(0, ratio - ratioRing * 0.5) + contraste * 0.7;
  return { ratio, ratioRing, contraste, score, ringContrast };
}

function evaluarConOffset(
  gray: Uint8ClampedArray,
  integral: Uint32Array,
  width: number,
  height: number,
  centros: Array<{ letra: string; punto: Punto }>,
  dx: number,
  dy: number
) {
  let mejorOpcion: string | null = null;
  let mejorScore = 0;
  let segundoScore = 0;
  const scores: Array<{ letra: string; score: number }> = [];
  for (const opcion of centros) {
    const punto = { x: opcion.punto.x + dx, y: opcion.punto.y + dy };
    const { score } = detectarOpcion(gray, integral, width, height, punto);
    scores.push({ letra: opcion.letra, score });
    if (score > mejorScore) {
      segundoScore = mejorScore;
      mejorScore = score;
      mejorOpcion = opcion.letra;
    } else if (score > segundoScore) {
      segundoScore = score;
    }
  }
  return { mejorOpcion, mejorScore, segundoScore, scores };
}

function evaluarAlineacionOffset(
  gray: Uint8ClampedArray,
  integral: Uint32Array,
  width: number,
  height: number,
  centros: Array<{ letra: string; punto: Punto }>,
  dx: number,
  dy: number
) {
  let suma = 0;
  for (const opcion of centros) {
    const punto = { x: opcion.punto.x + dx, y: opcion.punto.y + dy };
    const { ringContrast } = detectarOpcion(gray, integral, width, height, punto);
    suma += ringContrast;
  }
  return suma;
}

function localizarMarcaLocal(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  centro: Punto,
  radio = 8
) {
  const x0 = Math.max(0, Math.floor(centro.x - radio));
  const x1 = Math.min(width - 1, Math.ceil(centro.x + radio));
  const y0 = Math.max(0, Math.floor(centro.y - radio));
  const y1 = Math.min(height - 1, Math.ceil(centro.y + radio));

  let suma = 0;
  let sumaSq = 0;
  let total = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const v = obtenerIntensidad(gray, width, height, x, y);
      suma += v;
      sumaSq += v * v;
      total += 1;
    }
  }
  const media = suma / Math.max(1, total);
  const varianza = Math.max(0, sumaSq / Math.max(1, total) - media * media);
  const desviacion = Math.sqrt(varianza);
  const umbral = Math.max(30, media - Math.max(18, desviacion * 1.0));

  let accX = 0;
  let accY = 0;
  let conteo = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const v = obtenerIntensidad(gray, width, height, x, y);
      if (v < umbral) {
        accX += x;
        accY += y;
        conteo += 1;
      }
    }
  }
  if (conteo < 6) return null;
  return { x: accX / conteo, y: accY / conteo };
}

function ajustarCentrosPorFiduciales(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  centros: Array<{ letra: string; punto: Punto }>,
  fidTop: Punto,
  fidBottom: Punto
) {
  const detTop = localizarMarcaLocal(gray, width, height, fidTop, 10);
  const detBottom = localizarMarcaLocal(gray, width, height, fidBottom, 10);
  if (!detTop || !detBottom) return null;
  const dyEsperado = fidBottom.y - fidTop.y;
  const dyReal = detBottom.y - detTop.y;
  if (Math.abs(dyEsperado) < 1) return null;
  const scaleY = dyReal / dyEsperado;
  const offsetY = detTop.y - fidTop.y * scaleY;
  const offsetX = (detTop.x - fidTop.x + detBottom.x - fidBottom.x) / 2;
  return centros.map((opcion) => ({
    letra: opcion.letra,
    punto: {
      x: opcion.punto.x + offsetX,
      y: opcion.punto.y * scaleY + offsetY
    }
  }));
}

function ajustarCentrosVertical(
  gray: Uint8ClampedArray,
  integral: Uint32Array,
  width: number,
  height: number,
  centros: Array<{ letra: string; punto: Punto }>
) {
  if (centros.length < 2) return centros;
  const baseY = centros[0].punto.y;
  let mejorScore = -Infinity;
  let mejorScale = 1;
  let mejorOffset = 0;
  for (let scale = 0.96; scale <= 1.04 + 1e-6; scale += 0.01) {
    for (let offset = -6; offset <= 6 + 1e-6; offset += 2) {
      let suma = 0;
      for (const opcion of centros) {
        const y = baseY + (opcion.punto.y - baseY) * scale + offset;
        const { ringContrast } = detectarOpcion(gray, integral, width, height, { x: opcion.punto.x, y });
        suma += ringContrast;
      }
      if (suma > mejorScore) {
        mejorScore = suma;
        mejorScale = scale;
        mejorOffset = offset;
      }
    }
  }
  return centros.map((opcion) => ({
    letra: opcion.letra,
    punto: {
      x: opcion.punto.x,
      y: baseY + (opcion.punto.y - baseY) * mejorScale + mejorOffset
    }
  }));
}

export async function leerQrDesdeImagen(imagenBase64: string): Promise<string | undefined> {
  const { data, width, height } = await decodificarImagen(imagenBase64);
  return detectarQr(data, width, height);
}

export async function analizarOmr(
  imagenBase64: string,
  mapaPagina: MapaOmrPagina,
  qrEsperado?: string | string[],
  margenMm = 10
): Promise<ResultadoOmr> {
  const advertencias: string[] = [];
  const { data, gray, integral, width, height } = await decodificarImagen(imagenBase64);
  const qrTexto = detectarQr(data, width, height);

  if (!qrTexto) {
    advertencias.push('No se detecto QR en la imagen');
  }
  const qrEsperados = Array.isArray(qrEsperado) ? qrEsperado : qrEsperado ? [qrEsperado] : [];
  if (qrEsperados.length > 0 && qrTexto) {
    const normalizado = String(qrTexto).trim().toUpperCase();
    const coincide = qrEsperados.some((esperado) => {
      const exp = String(esperado).trim().toUpperCase();
      return normalizado === exp || normalizado.startsWith(`${exp}|`) || normalizado.includes(`FOLIO:${exp}`);
    });
    if (!coincide) {
      advertencias.push('El QR no coincide con el examen esperado');
    }
  }

  const transformacionBase = obtenerTransformacion(gray, width, height, advertencias, margenMm);
  const transformarEscala = (punto: Punto) => {
    const escalaX = width / ANCHO_CARTA;
    const escalaY = height / ALTO_CARTA;
    return { x: punto.x * escalaX, y: height - punto.y * escalaY };
  };
  let transformar = transformacionBase.transformar;

  const evaluarTransformacion = (transformador: (p: Punto) => Punto) => {
    const muestras = mapaPagina.preguntas.slice(0, Math.min(5, mapaPagina.preguntas.length));
    let totalScore = 0;
    let totalDelta = 0;
    for (const pregunta of muestras) {
      const centros = pregunta.opciones.map((opcion) => ({
        letra: opcion.letra,
        punto: transformador({ x: opcion.x, y: opcion.y })
      }));
      let mejorScore = 0;
      let segundoScore = 0;
      const rango = 8;
      const paso = 2;
      for (let dy = -rango; dy <= rango; dy += paso) {
        for (let dx = -rango; dx <= rango; dx += paso) {
          const resultado = evaluarConOffset(gray, integral, width, height, centros, dx, dy);
          if (resultado.mejorScore > mejorScore) {
            segundoScore = resultado.segundoScore;
            mejorScore = resultado.mejorScore;
          } else if (resultado.mejorScore > segundoScore) {
            segundoScore = resultado.mejorScore;
          }
        }
      }
      totalScore += mejorScore;
      totalDelta += Math.max(0, mejorScore - segundoScore);
    }
    const denom = Math.max(1, muestras.length);
    return { score: totalScore / denom, delta: totalDelta / denom };
  };

  if (transformacionBase.tipo === 'homografia') {
    const calidadHom = evaluarTransformacion(transformacionBase.transformar);
    const calidadEscala = evaluarTransformacion(transformarEscala);
    const puntajeHom = calidadHom.score + calidadHom.delta * 0.6;
    const puntajeEscala = calidadEscala.score + calidadEscala.delta * 0.6;
    if (puntajeEscala > puntajeHom + 0.03) {
      advertencias.push('Se eligio transformacion por escala por mayor coherencia de marcas');
      transformar = transformarEscala;
    }
  }
  const respuestasDetectadas: ResultadoOmr['respuestasDetectadas'] = [];

  mapaPagina.preguntas.forEach((pregunta) => {
    let mejorOpcion: string | null = null;
    let mejorScore = 0;
    let segundoScore = 0;
    const centrosBase = pregunta.opciones.map((opcion) => ({
      letra: opcion.letra,
      punto: transformar({ x: opcion.x, y: opcion.y })
    }));
    const fiduciales = pregunta.fiduciales
      ? {
          top: transformar({ x: pregunta.fiduciales.top.x, y: pregunta.fiduciales.top.y }),
          bottom: transformar({ x: pregunta.fiduciales.bottom.x, y: pregunta.fiduciales.bottom.y })
        }
      : null;
    const centrosFid = fiduciales ? ajustarCentrosPorFiduciales(gray, width, height, centrosBase, fiduciales.top, fiduciales.bottom) : null;
    const centros = ajustarCentrosVertical(gray, integral, width, height, centrosFid ?? centrosBase);
    const baseResultado = evaluarConOffset(gray, integral, width, height, centros, 0, 0);
    const baseFuertes = baseResultado.scores.filter((item) => item.score >= 0.12).length;
    const baseAmbiguo = baseFuertes > 1;

    const rango = 8;
    const paso = 2;
    let mejorDx = 0;
    let mejorDy = 0;
    let mejorAlineacion = -Infinity;
    for (let dy = -rango; dy <= rango; dy += paso) {
      for (let dx = -rango; dx <= rango; dx += paso) {
        const alineacion = evaluarAlineacionOffset(gray, integral, width, height, centros, dx, dy);
        if (alineacion > mejorAlineacion) {
          mejorAlineacion = alineacion;
          mejorDx = dx;
          mejorDy = dy;
        }
      }
    }
    const resultado = evaluarConOffset(gray, integral, width, height, centros, mejorDx, mejorDy);
    mejorOpcion = resultado.mejorOpcion;
    mejorScore = resultado.mejorScore;
    segundoScore = resultado.segundoScore;

    const delta = mejorScore - segundoScore;
    const candidatosFuertes = resultado.scores.filter((item) => item.score >= 0.12);
    const dobleMarcada =
      baseAmbiguo ||
      candidatosFuertes.length > 1 ||
      (segundoScore >= 0.12 && (segundoScore / Math.max(0.0001, mejorScore)) >= 0.8);
    const suficiente = !dobleMarcada && mejorScore >= 0.12 && delta >= 0.04;
    const confianzaBase = Math.min(1, Math.max(0, mejorScore * 1.8));
    const confianza = suficiente ? Math.min(1, confianzaBase + Math.min(0.5, delta * 3)) : 0;
    respuestasDetectadas.push({ numeroPregunta: pregunta.numeroPregunta, opcion: suficiente ? mejorOpcion : null, confianza });
  });

  return { respuestasDetectadas, advertencias, qrTexto };
}
