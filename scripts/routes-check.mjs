import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());

function listarArchivosRecursivo(dir, filtro) {
  const out = [];
  const entradas = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entradas) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listarArchivosRecursivo(full, filtro));
      continue;
    }
    if (ent.isFile() && filtro(full)) out.push(full);
  }
  return out;
}

function normalizarRuta(p) {
  return p.split(path.sep).join('/');
}

function leerTexto(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extraerLlamadasRouter(codigo, metodos) {
  // Extrae textos completos de llamadas tipo: router.post(...);
  // Ignora strings y comentarios para no falsos positivos.
  const llamadas = [];

  const isMetodo = (s, i) => metodos.some((m) => s.startsWith(`router.${m}(`, i));

  let i = 0;
  while (i < codigo.length) {
    const ch = codigo[i];

    // Comentarios
    if (ch === '/' && codigo[i + 1] === '/') {
      i += 2;
      while (i < codigo.length && codigo[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && codigo[i + 1] === '*') {
      i += 2;
      while (i < codigo.length && !(codigo[i] === '*' && codigo[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < codigo.length) {
        const c = codigo[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (quote === '`' && c === '$' && codigo[i + 1] === '{') {
          // Salta interpolación simple balanceando llaves
          i += 2;
          let depth = 1;
          while (i < codigo.length && depth > 0) {
            const cc = codigo[i];
            if (cc === '\\') {
              i += 2;
              continue;
            }
            if (cc === '{') depth++;
            else if (cc === '}') depth--;
            else if (cc === '"' || cc === "'" || cc === '`') {
              // string anidado dentro de template
              const q2 = cc;
              i++;
              while (i < codigo.length) {
                const c2 = codigo[i];
                if (c2 === '\\') {
                  i += 2;
                  continue;
                }
                if (c2 === q2) {
                  i++;
                  break;
                }
                i++;
              }
              continue;
            }
            i++;
          }
          continue;
        }
        if (c === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (isMetodo(codigo, i)) {
      const start = i;
      // ubica el primer '('
      const open = codigo.indexOf('(', i);
      if (open < 0) break;

      i = open;
      let depth = 0;
      while (i < codigo.length) {
        const c = codigo[i];

        // Reusar lógica para saltar strings/comentarios dentro de la llamada
        if (c === '/' && codigo[i + 1] === '/') {
          i += 2;
          while (i < codigo.length && codigo[i] !== '\n') i++;
          continue;
        }
        if (c === '/' && codigo[i + 1] === '*') {
          i += 2;
          while (i < codigo.length && !(codigo[i] === '*' && codigo[i + 1] === '/')) i++;
          i += 2;
          continue;
        }
        if (c === '"' || c === "'" || c === '`') {
          const quote = c;
          i++;
          while (i < codigo.length) {
            const c2 = codigo[i];
            if (c2 === '\\') {
              i += 2;
              continue;
            }
            if (quote === '`' && c2 === '$' && codigo[i + 1] === '{') {
              i += 2;
              let d2 = 1;
              while (i < codigo.length && d2 > 0) {
                const c3 = codigo[i];
                if (c3 === '\\') {
                  i += 2;
                  continue;
                }
                if (c3 === '{') d2++;
                else if (c3 === '}') d2--;
                i++;
              }
              continue;
            }
            if (c2 === quote) {
              i++;
              break;
            }
            i++;
          }
          continue;
        }

        if (c === '(') depth++;
        if (c === ')') depth--;

        // Fin de llamada: cerró el paréntesis externo y sigue ';'
        if (depth === 0 && c === ')' && codigo[i + 1] === ';') {
          const end = i + 2;
          llamadas.push(codigo.slice(start, end));
          i = end;
          break;
        }
        i++;
      }
      continue;
    }

    i++;
  }

  return llamadas;
}

function checarBackend() {
  const backendDir = path.join(repoRoot, 'apps/backend/src');
  const rutas = listarArchivosRecursivo(backendDir, (p) => {
    // Escanea TODO el código TS del backend para encontrar handlers con
    // router.post/put/patch, incluso si el archivo no se llama rutas*.ts.
    // (extraerLlamadasRouter ya evita falsos positivos en strings/comentarios)
    return p.endsWith('.ts');
  });

  const metodos = ['post', 'put', 'patch'];
  const violaciones = [];

  for (const archivo of rutas) {
    const txt = leerTexto(archivo);
    const calls = extraerLlamadasRouter(txt, metodos);
    for (const call of calls) {
      const tieneValidar = call.includes('validarCuerpo(');
      const tieneStrict = call.includes('strict: true');
      if (!tieneValidar || !tieneStrict) {
        violaciones.push({
          archivo: normalizarRuta(path.relative(repoRoot, archivo)),
          metodo: metodos.find((m) => call.startsWith(`router.${m}(`)) ?? '?',
          razon: !tieneValidar ? 'falta validarCuerpo(...)' : 'falta strict: true'
        });
      }
    }
  }

  return violaciones;
}

function checarBackendRutasPublicas() {
  const archivo = path.join(repoRoot, 'apps/backend/src/rutas.ts');
  const txt = leerTexto(archivo);

  const violaciones = [];

  const idxAuth = txt.indexOf('router.use(requerirDocente');
  if (idxAuth < 0) {
    violaciones.push({
      archivo: normalizarRuta(path.relative(repoRoot, archivo)),
      metodo: 'use',
      razon: 'no se encontró router.use(requerirDocente)'
    });
    return violaciones;
  }

  const antes = txt.slice(0, idxAuth);
  const reUseConPath = /router\.use\(\s*(['"`])([^'"`]+)\1\s*,/g;
  const permitidas = new Set(['/salud', '/autenticacion']);

  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = reUseConPath.exec(antes))) {
    const ruta = m[2];
    if (!permitidas.has(ruta)) {
      violaciones.push({
        archivo: normalizarRuta(path.relative(repoRoot, archivo)),
        metodo: 'use',
        razon: `ruta pública no permitida antes de requerirDocente: ${ruta}`
      });
    }
  }

  return violaciones;
}

function checarBackendSinEscrituraAntesAuth() {
  const archivo = path.join(repoRoot, 'apps/backend/src/rutas.ts');
  const txt = leerTexto(archivo);

  const violaciones = [];

  const idxAuth = txt.indexOf('router.use(requerirDocente');
  if (idxAuth < 0) return violaciones;

  const antes = txt.slice(0, idxAuth);
  const reWrite = /router\.(post|put|patch|delete)\s*\(/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = reWrite.exec(antes))) {
    violaciones.push({
      archivo: normalizarRuta(path.relative(repoRoot, archivo)),
      metodo: m[1],
      razon: `endpoint de escritura antes de requerirDocente (debe ser publico solo via /autenticacion): router.${m[1]}(...)`
    });
  }

  return violaciones;
}

function checarBackendAutenticacionPublica() {
  const archivo = path.join(repoRoot, 'apps/backend/src/modulos/modulo_autenticacion/rutasAutenticacion.ts');
  if (!fs.existsSync(archivo)) return [];

  const txt = leerTexto(archivo);
  const metodos = ['post', 'put', 'patch'];
  const calls = extraerLlamadasRouter(txt, metodos);

  const violaciones = [];
  for (const call of calls) {
    // En el módulo de autenticación asumimos que todas las rutas son públicas,
    // por lo que deben validar estrictamente el body.
    const tieneValidar = call.includes('validarCuerpo(');
    const tieneStrict = call.includes('strict: true');
    if (!tieneValidar || !tieneStrict) {
      violaciones.push({
        archivo: normalizarRuta(path.relative(repoRoot, archivo)),
        metodo: metodos.find((mm) => call.startsWith(`router.${mm}(`)) ?? '?',
        razon: !tieneValidar ? 'falta validarCuerpo(...) en ruta pública' : 'falta strict: true en ruta pública'
      });
    }
  }

  return violaciones;
}

function checarPortal() {
  const portalDir = path.join(repoRoot, 'apps/portal_alumno_cloud/src');
  const archivos = listarArchivosRecursivo(portalDir, (p) => p.endsWith('.ts'));
  const metodos = ['post', 'put', 'patch'];

  const violaciones = [];
  for (const archivo of archivos) {
    const txt = leerTexto(archivo);
    const calls = extraerLlamadasRouter(txt, metodos);
    for (const call of calls) {
      const m = call.match(/^router\.(post|put|patch)\(\s*(['"`])([^'"`]+)\2/);
      if (!m) {
        violaciones.push({
          archivo: normalizarRuta(path.relative(repoRoot, archivo)),
          metodo: metodos.find((mm) => call.startsWith(`router.${mm}(`)) ?? '?',
          razon: 'ruta no literal: el path debe ser string literal en router.post/put/patch'
        });
        continue;
      }
      const metodo = m[1];
      const ruta = m[3];

      // Regla simple: cada POST/PUT/PATCH del portal debe validar keys del body
      // con tieneSoloClavesPermitidas (es el patrón del proyecto).
      if (!call.includes('tieneSoloClavesPermitidas(')) {
        violaciones.push({
          archivo: normalizarRuta(path.relative(repoRoot, archivo)),
          metodo: metodos.find((mm) => call.startsWith(`router.${mm}(`)) ?? '?',
          razon: 'falta tieneSoloClavesPermitidas(...)'
        });
      }

      // Reglas de auth específicas (anti-regresión)
      if (ruta === '/sincronizar' || ruta === '/limpiar') {
        // Estos endpoints internos deben existir solo como POST.
        if (metodo !== 'post') {
          violaciones.push({
            archivo: normalizarRuta(path.relative(repoRoot, archivo)),
            metodo,
            razon: `no permitido: ${ruta} solo debe existir como POST`
          });
        }

        // Debe validar api key al inicio del handler.
        const tieneApiKey = /requerirApiKey\s*\(\s*req\s*,\s*res\s*\)/.test(call);
        if (!tieneApiKey) {
          violaciones.push({
            archivo: normalizarRuta(path.relative(repoRoot, archivo)),
            metodo: 'post',
            razon: `falta requerirApiKey(req, res) en ${ruta}`
          });
        }
      }

      if (ruta === '/eventos-uso') {
        // Debe exigir sesión (middleware) para el alumno.
        if (!call.includes('requerirSesionAlumno')) {
          violaciones.push({
            archivo: normalizarRuta(path.relative(repoRoot, archivo)),
            metodo: 'post',
            razon: 'falta requerirSesionAlumno en /eventos-uso'
          });
        }
      }
    }
  }

  return violaciones;
}

function main() {
  const violaciones = [
    ...checarBackend(),
    ...checarBackendRutasPublicas(),
    ...checarBackendSinEscrituraAntesAuth(),
    ...checarBackendAutenticacionPublica(),
    ...checarPortal()
  ];

  if (violaciones.length === 0) {
    console.log('[routes-check] ok');
    return;
  }

  console.error('[routes-check] falló: rutas sin validación requerida');
  for (const v of violaciones) {
    console.error(`- ${v.archivo}: router.${v.metodo}(...) -> ${v.razon}`);
  }
  process.exitCode = 1;
}

main();
