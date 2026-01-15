import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');
const shouldCheck = args.has('--check');

if (!shouldWrite && !shouldCheck) {
  console.error('Uso: node scripts/diagramas.mjs --write | --check');
  process.exit(2);
}

const srcDiagramasDir = path.join(rootDir, 'docs', 'diagramas', 'src');

function normalizarSaltosLinea(texto) {
  return texto.replace(/\r\n/g, '\n');
}

function rutaRel(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.DS_Store')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
      continue;
    }
    files.push(full);
  }
  return files;
}

function extraerPrimerMatch(regex, texto) {
  const m = regex.exec(texto);
  return m ? m[1] : null;
}

async function leerArchivoRel(relPath) {
  const full = path.join(rootDir, relPath);
  const content = await fs.readFile(full, 'utf8');
  return normalizarSaltosLinea(content);
}

function extraerPrefijoApiDesdeApp(appTsContent) {
  // Busca un `app.use('/xxx', ...)` que apunte a un router.
  // Esto es intencionalmente simple (regex) y estable.
  const re = /app\.use\(\s*['"]([^'"]+)['"]\s*,/;
  const m = re.exec(appTsContent);
  return m?.[1] ?? null;
}

function extraerMontajesRouterUse(rutasTsContent) {
  const re = /router\.use\(\s*['"]([^'"]+)['"]\s*,/g;
  const matches = [];
  for (const m of rutasTsContent.matchAll(re)) {
    matches.push({ path: m[1], index: m.index ?? -1 });
  }
  return matches;
}

function extraerRutasRouter(rutasTsContent) {
  // Extrae rutas con path literal: router.get('/x', ...)
  const re = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]\s*,/g;
  const rutas = [];
  for (const m of rutasTsContent.matchAll(re)) {
    rutas.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return rutas;
}

function unicoOrdenado(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'es'));
}

function clasificarPorMetodo(rutas) {
  const map = new Map();
  for (const r of rutas) {
    const prev = map.get(r.method) ?? [];
    prev.push(r.path);
    map.set(r.method, prev);
  }
  for (const [k, v] of map.entries()) map.set(k, unicoOrdenado(v));
  return map;
}

async function construirModeloSistema() {
  const backendApp = await leerArchivoRel('apps/backend/src/app.ts');
  const backendRutas = await leerArchivoRel('apps/backend/src/rutas.ts');

  const portalApp = await leerArchivoRel('apps/portal_alumno_cloud/src/app.ts');
  const portalRutas = await leerArchivoRel('apps/portal_alumno_cloud/src/rutas.ts');

  const backendPrefijo = extraerPrefijoApiDesdeApp(backendApp) ?? '/api';
  const portalPrefijo = extraerPrefijoApiDesdeApp(portalApp) ?? '/api/portal';

  const authIdx = backendRutas.indexOf('router.use(requerirDocente');
  const montajes = extraerMontajesRouterUse(backendRutas).map((m) => ({
    path: m.path,
    protegido: authIdx !== -1 ? m.index > authIdx : true
  }));

  const montajesPublicos = unicoOrdenado(montajes.filter((m) => !m.protegido).map((m) => m.path));
  const montajesProtegidos = unicoOrdenado(montajes.filter((m) => m.protegido).map((m) => m.path));

  const rutasPortal = extraerRutasRouter(portalRutas);
  const rutasPortalPorMetodo = clasificarPorMetodo(rutasPortal);

  return {
    backend: {
      prefijo: backendPrefijo,
      montajesPublicos,
      montajesProtegidos
    },
    portal: {
      prefijo: portalPrefijo,
      rutasPorMetodo: Object.fromEntries([...rutasPortalPorMetodo.entries()])
    }
  };
}

function generarBloqueModeloSistema(modelo) {
  const lineas = [];
  lineas.push('%% AUTO:START system_model');
  lineas.push('%% Generado por scripts/diagramas.mjs (no editar este bloque)');
  lineas.push(`%% Backend:`);
  lineas.push(`%% - prefijo: ${modelo.backend.prefijo}`);
  lineas.push(`%% - montajes publicos: ${modelo.backend.montajesPublicos.join(', ') || '(ninguno)'}`);
  lineas.push(`%% - montajes protegidos: ${modelo.backend.montajesProtegidos.join(', ') || '(ninguno)'}`);
  lineas.push(`%% Portal alumno cloud:`);
  lineas.push(`%% - prefijo: ${modelo.portal.prefijo}`);

  const metodos = Object.keys(modelo.portal.rutasPorMetodo).sort((a, b) => a.localeCompare(b, 'es'));
  for (const metodo of metodos) {
    const rutas = modelo.portal.rutasPorMetodo[metodo] ?? [];
    // Evita bloques gigantes; el objetivo es trazabilidad, no listar todo en pantalla.
    const max = 30;
    const lista = rutas.slice(0, max);
    const resto = rutas.length > max ? ` (+${rutas.length - max} mas)` : '';
    lineas.push(`%% - ${metodo}: ${lista.join(', ') || '(ninguna)'}${resto}`);
  }

  lineas.push('%% AUTO:END system_model');
  return lineas.join('\n');
}

function reemplazarOInsertarBloqueAuto(content, nuevoBloque) {
  const start = '%% AUTO:START system_model';
  const end = '%% AUTO:END system_model';

  if (content.includes(start) && content.includes(end)) {
    const re = /%% AUTO:START system_model[\s\S]*?%% AUTO:END system_model/;
    return content.replace(re, nuevoBloque);
  }

  const lines = content.split('\n');

  // Inserta el bloque después de la línea init si existe, para no interferir con el tipo de diagrama.
  let insertAt = 0;
  if (lines[0]?.startsWith('%%{init:')) insertAt = 1;

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  return [...before, nuevoBloque, ...after].join('\n');
}

async function writeOrCheck(filePath, newContent) {
  const rel = rutaRel(filePath);
  const normalized = normalizarSaltosLinea(newContent);
  const existing = normalizarSaltosLinea(await fs.readFile(filePath, 'utf8'));

  if (shouldCheck) {
    if (existing !== normalized) {
      console.error(`[diagramas] desactualizado: ${rel}`);
      console.error('[diagramas] corre: npm run diagramas:generate');
      process.exitCode = 1;
    }
    return;
  }

  await fs.writeFile(filePath, normalized, 'utf8');
  console.log(`[diagramas] escrito: ${rel}`);
}

const modelo = await construirModeloSistema();
const bloque = generarBloqueModeloSistema(modelo);

const all = await walkFiles(srcDiagramasDir);
const mmd = all.filter((f) => f.toLowerCase().endsWith('.mmd'));

if (mmd.length === 0) {
  console.error('[diagramas] no se encontraron .mmd en docs/diagramas/src');
  process.exit(2);
}

for (const filePath of mmd) {
  const content = normalizarSaltosLinea(await fs.readFile(filePath, 'utf8'));
  const updated = reemplazarOInsertarBloqueAuto(content, bloque);
  await writeOrCheck(filePath, updated);
}

if (shouldCheck && process.exitCode !== 1) {
  console.log('[diagramas] ok');
}
