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
  console.error('Uso: node scripts/docs.mjs --write | --check');
  process.exit(2);
}

const docsDir = path.join(rootDir, 'docs');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'logs',
  'accesos-directos',
  'diagramas',
  '.turbo',
  '.next'
]);

function normalizarSaltosLinea(texto) {
  return texto.replace(/\r\n/g, '\n');
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.DS_Store')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (dir === docsDir && entry.name === 'diagramas') continue;
      files.push(...(await walkFiles(full)));
      continue;
    }
    files.push(full);
  }
  return files;
}

function rutaRel(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function agruparArea(relPath) {
  if (relPath.startsWith('apps/backend/')) return 'Backend';
  if (relPath.startsWith('apps/portal_alumno_cloud/')) return 'Portal alumno cloud';
  if (relPath.startsWith('apps/frontend/')) return 'Frontend';
  if (relPath.startsWith('test-utils/')) return 'Tests';
  if (relPath.startsWith('scripts/')) return 'Scripts';
  return 'Root';
}

async function generarDocsIndex() {
  const entries = await fs.readdir(docsDir, { withFileTypes: true });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name)
    .filter((name) => !name.startsWith('AUTO_'))
    .sort((a, b) => a.localeCompare(b, 'es'));

  const items = [];
  for (const fileName of mdFiles) {
    const full = path.join(docsDir, fileName);
    const content = normalizarSaltosLinea(await fs.readFile(full, 'utf8'));
    const firstHeading = content
      .split('\n')
      .find((line) => line.trimStart().startsWith('# '))
      ?.replace(/^#\s+/, '')
      .trim();
    const label = firstHeading ? ` — ${firstHeading}` : '';
    items.push(`- [${fileName}](${fileName})${label}`);
  }

  // Incluye referencias a docs auto-generadas sin auto-incluir el indice.
  items.push('- [AUTO_ENV.md](AUTO_ENV.md) — Variables de entorno (auto-generado)');

  return (
    [
      '# Índice de documentación (auto-generado)',
      '',
      'Este archivo se genera con `npm run docs:generate`.',
      'No editar a mano: los cambios se pisan al regenerar.',
      '',
      ...items,
      ''
    ].join('\n')
  );
}

async function generarEnvDoc() {
  const allFiles = await walkFiles(rootDir);
  const codeFiles = allFiles.filter((f) => {
    const lower = f.toLowerCase();
    return (
      lower.endsWith('.ts') ||
      lower.endsWith('.tsx') ||
      lower.endsWith('.js') ||
      lower.endsWith('.mjs') ||
      lower.endsWith('.cjs')
    );
  });

  const envToPaths = new Map();

  const reProcessEnv = /process\.env\.([A-Z0-9_]+)/g;
  const reImportMetaEnv = /import\.meta\.env\.([A-Z0-9_]+)/g;

  for (const filePath of codeFiles) {
    const rel = rutaRel(filePath);
    // Evita escanear archivos generados y diagramas.
    if (rel.startsWith('docs/diagramas/')) continue;
    if (rel.startsWith('docs/AUTO_')) continue;

    const content = normalizarSaltosLinea(await fs.readFile(filePath, 'utf8'));
    const vars = new Set();

    for (const match of content.matchAll(reProcessEnv)) vars.add(match[1]);
    for (const match of content.matchAll(reImportMetaEnv)) vars.add(match[1]);

    if (vars.size === 0) continue;
    for (const variable of vars) {
      const prev = envToPaths.get(variable) ?? new Set();
      prev.add(rel);
      envToPaths.set(variable, prev);
    }
  }

  const variables = [...envToPaths.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  const grouped = new Map();
  for (const variable of variables) {
    const paths = [...(envToPaths.get(variable) ?? [])].sort((a, b) => a.localeCompare(b, 'es'));
    const areas = new Set(paths.map(agruparArea));
    for (const area of areas) {
      const arr = grouped.get(area) ?? [];
      arr.push({ variable, paths: paths.filter((p) => agruparArea(p) === area) });
      grouped.set(area, arr);
    }
  }

  const areaOrder = ['Backend', 'Portal alumno cloud', 'Frontend', 'Scripts', 'Tests', 'Root'];
  const sections = [];
  for (const area of areaOrder) {
    const items = grouped.get(area);
    if (!items || items.length === 0) continue;
    sections.push(`## ${area}`);
    for (const { variable, paths } of items) {
      const where = paths.length > 0 ? ` (usado en: ${paths.join(', ')})` : '';
      sections.push(`- \`${variable}\`${where}`);
    }
    sections.push('');
  }

  return (
    [
      '# Variables de entorno (auto-generado)',
      '',
      'Este archivo se genera con `npm run docs:generate`.',
      'No editar a mano: los cambios se pisan al regenerar.',
      '',
      'Nota: esto detecta uso por texto (regex). Si agregas una variable nueva en código,',
      'este documento se actualiza automáticamente al regenerar.',
      '',
      ...sections
    ].join('\n')
  );
}

async function writeOrCheckFile(relOutPath, newContent) {
  const outPath = path.join(rootDir, relOutPath);
  const normalized = normalizarSaltosLinea(newContent);
  let existing = null;
  try {
    existing = normalizarSaltosLinea(await fs.readFile(outPath, 'utf8'));
  } catch {
    existing = null;
  }

  if (shouldCheck) {
    if (existing !== normalized) {
      console.error(`[docs] desactualizado: ${relOutPath}`);
      console.error('[docs] corre: npm run docs:generate');
      process.exitCode = 1;
    }
    return;
  }

  await fs.writeFile(outPath, normalized, 'utf8');
  console.log(`[docs] escrito: ${relOutPath}`);
}

const envDoc = await generarEnvDoc();
await writeOrCheckFile('docs/AUTO_ENV.md', envDoc);

const docsIndex = await generarDocsIndex();
await writeOrCheckFile('docs/AUTO_DOCS_INDEX.md', docsIndex);

if (shouldCheck && process.exitCode !== 1) {
  console.log('[docs] ok');
}
