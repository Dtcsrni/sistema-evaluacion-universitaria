import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import jsQR from 'jsqr';

async function leerImagen(
  file: string,
  crop?: { left: number; top: number; width: number; height: number },
  maxWidth = 2000,
  modo: 'normal' | 'bw' | 'bw_inv' | 'bw_sharp' = 'normal',
  scale = 1
) {
  const buffer = await fs.readFile(file);
  let img = sharp(buffer).rotate().normalize();
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('Imagen invalida');
  if (crop) {
    img = img.extract(crop);
  }
  if (modo !== 'normal') {
    img = img.grayscale();
    if (modo === 'bw_sharp') {
      img = img.sharpen();
    }
    const inv = modo === 'bw_inv';
    img = img.threshold(160);
    if (inv) img = img.negate();
  }
  let anchoObjetivo = maxWidth > 0 ? Math.min(width, maxWidth) : width;
  if (scale !== 1) {
    anchoObjetivo = Math.max(1, Math.round(anchoObjetivo * scale));
  }
  const imgResized = img.resize({ width: anchoObjetivo, kernel: 'nearest' });
  const { data, info } = await imgResized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

function calcularIntegralBinaria(gray: Uint8ClampedArray, width: number, height: number, umbral: number) {
  const w1 = width + 1;
  const integral = new Uint32Array(w1 * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let fila = 0;
    for (let x = 1; x <= width; x += 1) {
      const val = gray[(y - 1) * width + (x - 1)] < umbral ? 1 : 0;
      fila += val;
      integral[y * w1 + x] = integral[(y - 1) * w1 + x] + fila;
    }
  }
  return integral;
}

function sumaVentana(integral: Uint32Array, width: number, x: number, y: number, w: number, h: number) {
  const w1 = width + 1;
  const x2 = x + w;
  const y2 = y + h;
  return integral[y2 * w1 + x2] - integral[y * w1 + x2] - integral[y2 * w1 + x] + integral[y * w1 + x];
}

async function localizarQrRegion(file: string) {
  const buffer = await fs.readFile(file);
  const img = sharp(buffer).rotate().normalize();
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return null;

  const search = {
    left: Math.floor(width * 0.5),
    top: 0,
    width: Math.floor(width * 0.5),
    height: Math.floor(height * 0.45)
  };

  const downW = 420;
  const imgResized = img.extract(search).resize({ width: downW });
  const { data, info } = await imgResized.grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const gray = new Uint8ClampedArray(data);
  const integral = calcularIntegralBinaria(gray, w, h, 140);

  const tamaños = [110, 130, 150, 170];
  let best = { score: 0, x: 0, y: 0, size: 130 };
  for (const size of tamaños) {
    const step = Math.max(4, Math.floor(size / 8));
    for (let y = 0; y + size < h; y += step) {
      for (let x = 0; x + size < w; x += step) {
        const negros = sumaVentana(integral, w, x, y, size, size);
        const ratio = negros / (size * size);
        if (ratio > best.score) {
          best = { score: ratio, x, y, size };
        }
      }
    }
  }

  if (best.score < 0.15) return null;
  const invScale = search.width / info.width;
  const x = search.left + Math.floor(best.x * invScale);
  const y = search.top + Math.floor(best.y * invScale);
  const s = Math.floor(best.size * invScale);
  return { left: x, top: y, width: s, height: s };
}

async function leerQr(file: string) {
  try {
    const base = await sharp(await fs.readFile(file)).metadata();
    const w = base.width ?? 0;
    const h = base.height ?? 0;
    const intentos: Array<Promise<{ data: Uint8ClampedArray; width: number; height: number }>> = [
      leerImagen(file, undefined, 0, 'normal'),
      leerImagen(file, undefined, 2400, 'bw'),
      leerImagen(file, undefined, 2400, 'bw_inv'),
      leerImagen(file, undefined, 2400, 'bw_sharp')
    ];
    if (w && h) {
      const crop = {
        left: Math.floor(w * 0.6),
        top: 0,
        width: Math.floor(w * 0.4),
        height: Math.floor(h * 0.35)
      };
      intentos.push(leerImagen(file, crop, 0, 'normal'));
      intentos.push(leerImagen(file, crop, 0, 'bw'));
      intentos.push(leerImagen(file, crop, 0, 'bw_inv'));
      intentos.push(leerImagen(file, crop, 0, 'bw_sharp'));
      intentos.push(leerImagen(file, crop, 0, 'bw_sharp', 2));

      const region = await localizarQrRegion(file);
      if (region) {
        const margen = Math.floor(region.width * 0.15);
        const regionExpandida = {
          left: Math.max(0, region.left - margen),
          top: Math.max(0, region.top - margen),
          width: region.width + margen * 2,
          height: region.height + margen * 2
        };
        intentos.push(leerImagen(file, regionExpandida, 0, 'bw_sharp', 2));
        intentos.push(leerImagen(file, regionExpandida, 0, 'bw', 2));
      }
    }
    for (const intento of intentos) {
      const { data, width, height } = await intento;
      const resultado = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
      if (resultado?.data) return resultado.data;
    }
    return '';
  } catch {
    return '';
  }
}

async function main() {
  const dir = process.argv[2] || 'omr_samples';
  const ruta = path.resolve(dir);
  const archivos = (await fs.readdir(ruta))
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
    .map((f) => path.join(ruta, f));

  if (!archivos.length) {
    console.log(`Sin imagenes en ${ruta}`);
    return;
  }

  for (const file of archivos) {
    const qr = await leerQr(file);
    const nombre = path.basename(file);
    console.log(`${nombre}\t${qr || '-'}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
