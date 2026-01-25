import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Carga variables desde el .env del root sin depender de dotenv.
// - Soporta valores con comillas simples/dobles y comentarios finales.
// - No pisa variables ya definidas en el proceso.
function cargarEnvLocal() {
  const rutaEnv = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(rutaEnv)) return;
  const contenido = fs.readFileSync(rutaEnv, 'utf8');
  for (const linea of contenido.split(/\r?\n/)) {
    const entry = parseEnvLine(linea);
    if (!entry) continue;
    const { key, value } = entry;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = value;
  }
}

function parseEnvLine(line) {
  const raw = String(line ?? '').trim();
  if (!raw || raw.startsWith('#')) return null;
  const idx = raw.indexOf('=');
  if (idx < 0) return null;

  const key = raw.slice(0, idx).trim();
  if (!key) return null;
  let value = raw.slice(idx + 1).trim();

  // Elimina comentarios finales cuando el valor no está entrecomillado.
  if (value && !/^['"]/.test(value)) {
    const hash = value.indexOf(' #');
    if (hash >= 0) value = value.slice(0, hash).trim();
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

cargarEnvLocal();

const base = String(process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000').trim();
const healthPath = String(process.env.API_HEALTHCHECK_PATH || '/api/salud').trim() || '/api/salud';
const timeoutMs = clampNumber(process.env.API_HEALTHCHECK_TIMEOUT_MS, 120_000, 5_000, 10 * 60_000);
const intervalMs = clampNumber(process.env.API_HEALTHCHECK_INTERVAL_MS, 500, 150, 10_000);
const strict = /^(1|true|si|yes)$/i.test(String(process.env.API_HEALTHCHECK_STRICT || '').trim());

function crearUrl() {
  try {
    return new URL(healthPath, base).toString();
  } catch {
    return 'http://localhost:4000/api/salud';
  }
}

const url = crearUrl();

function ping(urlDestino) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(urlDestino);
    } catch {
      resolve(false);
      return;
    }

    const esHttps = parsed.protocol === 'https:';
    const lib = esHttps ? https : http;
    const agent = new lib.Agent({ keepAlive: false });
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (esHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: { Connection: 'close' },
        timeout: 4_000,
        agent
      },
      (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300));
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function esperarApi() {
  const limite = Date.now() + timeoutMs;
  console.log(`[wait-api] Esperando backend en ${url}...`);
  while (Date.now() < limite) {
    if (await ping(url)) {
      console.log(`[wait-api] OK ${url}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  console.error(`[wait-api] Timeout esperando ${url}`);
  if (strict) {
    process.exitCode = 1;
    return;
  }
  console.warn('[wait-api] Continuando sin backend listo (modo no estricto).');
}

await esperarApi();

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}
