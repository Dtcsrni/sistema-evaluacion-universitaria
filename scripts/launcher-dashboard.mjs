/*
  Local web dashboard to control the dev stack.
  - Serves a small HTML UI and JSON endpoints on localhost.
  - Starts/stops tasks via cmd.exe and streams logs to the UI.
  - Filters noisy lines by default for readability.
  - Enforces a single running instance using a lock file.
*/
import http from 'http';
import https from 'node:https';
import fs from 'fs';
import path from 'path';
import net from 'net';
import process from 'node:process';
import { X509Certificate } from 'node:crypto';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Resolve paths relative to this script.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// CLI options: --mode dev|prod|none, --port <n>, --no-open, --verbose, --full-logs.
const args = process.argv.slice(2);
const mode = getArgValue('--mode', 'none');
const portArg = getArgValue('--port', '');
const noOpen = args.includes('--no-open');
const verbose = args.includes('--verbose');
const fullLogs = args.includes('--full-logs');

const dashboardStartedAt = Date.now();
let listeningPort = 0;

// Docker/stack bootstrap state (for shortcuts/tray).
const composeFile = path.join(root, 'docker-compose.yml');
const dockerAutostart = {
  state: 'idle', // idle|checking|starting|ready|error
  ready: false,
  version: '',
  attemptedDesktopStart: false,
  stack: {
    state: 'unknown', // unknown|checking|running|starting|skipped|error
    running: false,
    lastError: ''
  },
  lastError: '',
  lastChangedAt: Date.now()
};

let dockerAutostartPromise = null;

// Persist recent logs to disk to aid troubleshooting.
const logDir = path.join(root, 'logs');
const logFile = path.join(logDir, 'dashboard.log');
const lockPath = path.join(logDir, 'dashboard.lock.json');
const singletonPath = path.join(logDir, 'dashboard.singleton.json');
ensureDir(logDir);

// Logging persistence mode:
// - off: no disk writes
// - important: only system/warn/error (+ any entry explicitly marked)
// - all: persist everything
const persistArg = getArgValue('--persist', 'important');
const persistMode = ['off', 'important', 'all'].includes(String(persistArg)) ? String(persistArg) : 'important';

const diskWriter = createDiskWriter(logFile, {
  enabled: persistMode !== 'off',
  flushMs: Number(process.env.DASHBOARD_LOG_FLUSH_MS || 1400),
  maxBytes: Number(process.env.DASHBOARD_LOG_MAX_BYTES || 2_000_000),
  keepFiles: Number(process.env.DASHBOARD_LOG_KEEP || 3)
});

// In-memory log buffers for the UI.
const maxFiltered = 600;
const maxRaw = 2000;
const logLines = [];
const rawLines = [];

// In-memory event buffer for structured activity (small + diagnostic).
const maxEvents = 450;
const events = [];

// Singleton lock to avoid multiple dashboard instances.
let singletonOwned = false;
let singletonPayload = null;

// Track suppressed noisy lines per task.
const noiseStats = new Map();

// Track spawned processes by task name.
const processes = new Map();

// Dev convenience: auto-restart tasks when source files change.
let autoRestart = mode === 'dev';
let restartTimer = null;

// HTML template and assets.
// En DEV se leen desde disco por request para que cambios UI/UX se vean al refrescar.
// En PROD se cachean en memoria (comportamiento estable/reproducible).
const dashboardPath = path.join(__dirname, 'dashboard.html');
const manifestPath = path.join(__dirname, 'dashboard.webmanifest');
const iconPath = path.join(__dirname, 'dashboard-icon.svg');
const swPath = path.join(__dirname, 'dashboard-sw.js');

const cachedDashboardHtml = fs.readFileSync(dashboardPath, 'utf8');
const cachedManifestJson = fs.readFileSync(manifestPath, 'utf8');
const cachedIconSvg = fs.readFileSync(iconPath, 'utf8');
const cachedSwJs = fs.existsSync(swPath) ? fs.readFileSync(swPath, 'utf8') : '';

function shouldLiveReloadUi() {
  // En prod: UI estable (cache en memoria).
  // En dev/none: leer desde disco por request para que cambios de UI se vean al refrescar.
  return mode !== 'prod';
}

function readTextDevOrCache(filePath, cached) {
  if (!shouldLiveReloadUi()) return cached;
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return cached;
  }
}

function readRootPackageInfo() {
  try {
    const raw = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      version: typeof parsed.version === 'string' ? parsed.version : ''
    };
  } catch {
    return { name: '', version: '' };
  }
}

function parseEnvContent(content) {
  const result = {};
  const lines = String(content || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(root, '.env'), 'utf8');
    return parseEnvContent(raw);
  } catch {
    return {};
  }
}

function parseBool(value) {
  return /^(1|true|si|yes)$/i.test(String(value || '').trim());
}

function parseSubject(subject) {
  const result = {};
  String(subject || '').split(',').forEach((segment) => {
    const parts = segment.split('=');
    if (parts.length < 2) return;
    const key = parts.shift().trim();
    const value = parts.join('=').trim();
    if (key) result[key] = value;
  });
  return { cn: result.CN || '', o: result.O || '' };
}

function readCertSubject(certPath) {
  try {
    const pem = fs.readFileSync(certPath);
    const cert = new X509Certificate(pem);
    return parseSubject(cert.subject);
  } catch {
    return { cn: '', o: '' };
  }
}

function resolveHttpsState() {
  const env = readEnvFile();
  const enabled = parseBool(env.VITE_HTTPS);
  const certPath = String(env.VITE_HTTPS_CERT_PATH || '').trim();
  const keyPath = String(env.VITE_HTTPS_KEY_PATH || '').trim();
  const certReady = Boolean(certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath));
  const ready = enabled && certReady;
  const fallback = enabled && !certReady;
  const mode = enabled ? (certReady ? 'https' : 'http-fallback') : 'http';

  const hintedName = String(env.VITE_HTTPS_CERT_NAME || '').trim();
  const hintedOrg = String(env.VITE_HTTPS_CERT_COMPANY || '').trim();
  const subject = certReady ? readCertSubject(certPath) : { cn: '', o: '' };
  const certName = subject.cn || hintedName;
  const certOrg = subject.o || hintedOrg;

  let display = enabled ? 'HTTP (fallback)' : 'HTTP';
  if (enabled && certReady) {
    const detail = [certName, certOrg].filter(Boolean).join(' - ');
    display = detail ? `HTTPS (${detail})` : 'HTTPS';
  }

  return {
    enabled,
    ready,
    fallback,
    mode,
    certPath: certPath || '',
    keyPath: keyPath || '',
    certName,
    certOrg,
    display
  };
}

function writeConsole(line) {
  if (!verbose) return;
  process.stdout.write(line + '\n');
}

function timestamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function makeEntry(source, level, text) {
  return { ts: Date.now(), time: timestamp(), source, level, text };
}

function formatEntry(entry) {
  const base = `[${entry.time}] [${entry.source}] [${entry.level}] ${entry.text}`;
  if (entry && entry.meta && typeof entry.meta === 'object') {
    try {
      return `${base} | ${JSON.stringify(entry.meta)}`;
    } catch {
      return base;
    }
  }
  return base;
}

function persistEntry(entry) {
  if (!diskWriter.enabled) return;
  if (persistMode === 'important') {
    const important = entry.level === 'error' || entry.level === 'warn' || entry.level === 'system';
    const forced = Boolean(entry && entry.meta && entry.meta.persist === true);
    if (!important && !forced) return;
  }
  diskWriter.append(formatEntry(entry) + '\n');
}

function pushEntry(buffer, entry, max) {
  buffer.push(entry);
  if (buffer.length > max) buffer.shift();
}

function pushEvent(type, source, level, text, meta = undefined) {
  const evt = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: Date.now(),
    time: timestamp(),
    type,
    source,
    level,
    text,
    meta
  };
  events.unshift(evt);
  if (events.length > maxEvents) events.splice(maxEvents);
}

function shouldConsole(entry, options) {
  if (entry.level === 'error') return true;
  if (options && options.console === true) return true;
  if (!verbose) return false;
  if (options && options.console === false) return false;
  return true;
}

// Central logger for system-level messages.
function logSystem(text, level = 'system', options = {}) {
  const entry = makeEntry('dashboard', level, text);
  if (options && typeof options.meta === 'object') entry.meta = options.meta;
  pushEntry(rawLines, entry, maxRaw);
  pushEntry(logLines, entry, maxFiltered);
  if (shouldConsole(entry, options)) writeConsole(formatEntry(entry));
  persistEntry(entry);

  // Emit an event for key system-level messages.
  if (level === 'error' || level === 'warn' || level === 'system') {
    pushEvent('system', 'dashboard', level, text);
  }
}

function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  const id = Number(pid);
  if (!Number.isFinite(id) || id <= 0) return false;
  try {
    process.kill(id, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'ESRCH') return false;
    return true;
  }
}

function writeSingletonLock(payload, exclusive = false) {
  try {
    const data = JSON.stringify(payload, null, 2);
    fs.writeFileSync(singletonPath, data, { flag: exclusive ? 'wx' : 'w' });
    return true;
  } catch {
    return false;
  }
}

function updateSingletonLock(patch) {
  if (!singletonOwned) return;
  const next = Object.assign({}, singletonPayload || {}, patch);
  if (!writeSingletonLock(next, false)) return;
  singletonPayload = next;
}

function clearSingletonLock() {
  if (!singletonOwned) return;
  singletonOwned = false;
  singletonPayload = null;
  try {
    if (fs.existsSync(singletonPath)) fs.unlinkSync(singletonPath);
  } catch {
    // ignore
  }
}

async function ensureSingletonLock() {
  const payload = {
    pid: process.pid,
    port: 0,
    mode,
    state: 'starting',
    startedAt: new Date().toISOString()
  };

  if (writeSingletonLock(payload, true)) {
    singletonOwned = true;
    singletonPayload = payload;
    return { ok: true };
  }

  const existing = readJsonFile(singletonPath);
  if (existing && isPidAlive(existing.pid)) {
    const port = Number(existing.port);
    if (port > 0) {
      const ok = await pingDashboard(port);
      if (ok) {
        const url = `http://127.0.0.1:${port}`;
        logSystem(`Dashboard ya esta activo: ${url}`, 'ok', { console: true });
        if (!noOpen) openBrowser(url);
      } else {
        logSystem('Otra instancia del dashboard ya esta iniciando.', 'warn', { console: true });
      }
    } else {
      logSystem('Otra instancia del dashboard ya esta iniciando.', 'warn', { console: true });
    }
    return { ok: false, existing };
  }

  try {
    if (fs.existsSync(singletonPath)) fs.unlinkSync(singletonPath);
  } catch {
    logSystem('No se pudo eliminar lock singleton obsoleto.', 'warn');
    return { ok: true, degraded: true };
  }

  if (writeSingletonLock(payload, true)) {
    singletonOwned = true;
    singletonPayload = payload;
    return { ok: true, recovered: true };
  }

  logSystem('No se pudo adquirir lock singleton.', 'error', { console: true });
  return { ok: false };
}

function createDiskWriter(filePath, options) {
  const enabled = Boolean(options && options.enabled);
  const flushMs = Math.max(300, Number(options && options.flushMs) || 1400);
  const maxBytes = Math.max(200_000, Number(options && options.maxBytes) || 2_000_000);
  const keepFiles = Math.max(1, Math.min(10, Number(options && options.keepFiles) || 3));

  let buffer = '';
  let stream = null;
  let timer = null;
  let approxSize = 0;

  function openStream() {
    if (!enabled) return;
    if (stream) return;
    try {
      if (fs.existsSync(filePath)) {
        try {
          approxSize = fs.statSync(filePath).size || 0;
        } catch {
          approxSize = 0;
        }
      }
      stream = fs.createWriteStream(filePath, { flags: 'a' });
      stream.on('error', () => {
        try { stream?.destroy(); } catch {}
        stream = null;
      });
    } catch {
      stream = null;
    }
  }

  function closeStream() {
    try { stream?.end(); } catch {}
    stream = null;
  }

  function rotateIfNeeded() {
    if (!enabled) return;
    if (approxSize < maxBytes) return;

    closeStream();
    try {
      for (let i = keepFiles - 1; i >= 1; i -= 1) {
        const from = `${filePath}.${i}`;
        const to = `${filePath}.${i + 1}`;
        if (fs.existsSync(from)) {
          try { fs.renameSync(from, to); } catch {}
        }
      }
      if (fs.existsSync(filePath)) {
        try { fs.renameSync(filePath, `${filePath}.1`); } catch {}
      }
    } catch {
      // ignore
    }
    approxSize = 0;
    openStream();
  }

  function flush() {
    if (!enabled) return;
    if (!buffer) return;

    openStream();
    if (!stream) {
      buffer = '';
      return;
    }

    rotateIfNeeded();

    const chunk = buffer;
    buffer = '';
    approxSize += Buffer.byteLength(chunk, 'utf8');
    try {
      stream.write(chunk);
    } catch {
      // ignore
    }
  }

  function append(text) {
    if (!enabled) return;
    buffer += text;
    if (buffer.length >= 64_000) flush();
  }

  if (enabled) {
    openStream();
    timer = setInterval(flush, flushMs);
    timer.unref?.();
  }

  process.on('exit', () => {
    try { flush(); } catch {}
    try { closeStream(); } catch {}
  });

  return { enabled, append, flush };
}

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

// Simple argv parser for single-value flags.
function getArgValue(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  return value || fallback;
}

// Runs a command and returns its first line, or a fallback.
function safeExec(command, fallback) {
  try {
    const out = execSync(command, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8'
    }).trim();
    return out.split(/\r?\n/)[0] || fallback;
  } catch {
    return fallback;
  }
}

function safeExecFast(command, fallback, timeoutMs = 1400) {
  try {
    const out = execSync(command, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: Math.max(200, Number(timeoutMs) || 1400)
    }).trim();
    return out.split(/\r?\n/)[0] || fallback;
  } catch {
    return fallback;
  }
}

function setDockerAutostart(patch) {
  Object.assign(dockerAutostart, patch);
  dockerAutostart.lastChangedAt = Date.now();
}

function dockerDisplayString() {
  if (dockerAutostart.state === 'starting') return 'Iniciando Docker...';
  if (dockerAutostart.state === 'checking') return 'Comprobando Docker...';
  if (dockerAutostart.state === 'error') return dockerAutostart.lastError || 'Docker no responde.';
  if (dockerAutostart.ready && dockerAutostart.version) return dockerAutostart.version;
  const v = safeExecFast('docker version --format "{{.Server.Version}}"', '', 900);
  return v || 'No disponible';
}

function tryGetDockerVersion() {
  const v = safeExecFast('docker version --format "{{.Server.Version}}"', '', 1200);
  return v && v !== 'No disponible' ? v : '';
}

function tryStartDockerDesktopWindows() {
  if (process.platform !== 'win32') return false;

  const roots = [
    process.env.ProgramW6432,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)']
  ].filter(Boolean);

  const candidates = [];
  for (const r of roots) {
    candidates.push(path.join(r, 'Docker', 'Docker', 'Docker Desktop.exe'));
  }

  const exe = candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });
  if (!exe) return false;

  try {
    const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function waitForDockerReady(timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const v = tryGetDockerVersion();
    if (v) return v;
    await sleep(1200);
  }
  return '';
}

function composeBaseArgsForMode(desiredMode) {
  const args = ['docker', 'compose', '-f', composeFile];
  if (desiredMode === 'prod') args.push('--profile', 'prod');
  return args;
}

function isComposeServiceRunning(desiredMode, service) {
  if (!composeFile || !fs.existsSync(composeFile)) return false;
  const base = composeBaseArgsForMode(desiredMode);
  const fileQuoted = `"${composeFile.replaceAll('"', '\\"')}"`;
  const profile = desiredMode === 'prod' ? '--profile prod ' : '';
  const cmd = `docker compose -f ${fileQuoted} ${profile}ps -q ${service}`;
  try {
    const out = execSync(cmd, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 1600
    }).trim();
    return Boolean(out);
  } catch {
    return false;
  }
}

function isStackRunning(desiredMode) {
  if (desiredMode === 'prod') {
    return (
      isComposeServiceRunning('prod', 'mongo_local') &&
      isComposeServiceRunning('prod', 'api_docente_prod') &&
      isComposeServiceRunning('prod', 'web_docente_prod')
    );
  }
  // dev
  return (
    isComposeServiceRunning('dev', 'mongo_local') &&
    isComposeServiceRunning('dev', 'api_docente_local')
  );
}

function requestDockerAutostart(reason = 'startup') {
  if (mode !== 'dev' && mode !== 'prod') return;
  if (dockerAutostartPromise) return;

  dockerAutostartPromise = (async () => {
    pushEvent('docker', 'dashboard', 'info', 'Autostart solicitado', { reason, mode });

    setDockerAutostart({ state: 'checking', lastError: '' });
    dockerAutostart.stack.state = 'checking';
    dockerAutostart.stack.lastError = '';

    let version = tryGetDockerVersion();
    if (!version) {
      setDockerAutostart({ state: 'starting', ready: false, version: '' });
      if (!dockerAutostart.attemptedDesktopStart) {
        dockerAutostart.attemptedDesktopStart = true;
        const started = tryStartDockerDesktopWindows();
        logSystem(started ? 'Docker Desktop iniciado (si estaba instalado).' : 'Docker no esta listo. Inicia Docker Desktop.', started ? 'warn' : 'warn');
      }
      version = await waitForDockerReady(Number(process.env.DASHBOARD_DOCKER_TIMEOUT_MS || 120_000));
    }

    if (!version) {
      setDockerAutostart({ state: 'error', ready: false, version: '', lastError: 'Docker no responde.' });
      dockerAutostart.stack.state = 'error';
      dockerAutostart.stack.lastError = 'Docker no responde.';
      logSystem('Docker no responde. No se pudo iniciar el stack automaticamente.', 'error', { console: true });
      return;
    }

    setDockerAutostart({ state: 'ready', ready: true, version, lastError: '' });

    // Evita recrear el stack si ya esta levantado.
    const alreadyRunning = isStackRunning(mode);
    dockerAutostart.stack.running = alreadyRunning;
    if (alreadyRunning) {
      dockerAutostart.stack.state = 'skipped';
      logSystem('Stack Docker ya esta activo. No se reinicia.', 'ok');
      return;
    }

    dockerAutostart.stack.state = 'starting';
    logSystem(`Iniciando stack Docker (${mode})...`, 'system');
    if (!isRunning(mode)) startTask(mode, commands[mode]);
  })()
    .catch((err) => {
      setDockerAutostart({ state: 'error', ready: false, version: '', lastError: err?.message || 'Error iniciando Docker' });
      dockerAutostart.stack.state = 'error';
      dockerAutostart.stack.lastError = err?.message || 'Error iniciando Docker';
      logSystem(`Fallo autostart Docker: ${err?.message || 'error'}`, 'error', { console: true });
    })
    .finally(() => {
      dockerAutostartPromise = null;
    });
}

// Check a local endpoint with a small timeout for health reporting.
async function checkHealth(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const started = Date.now();
    try {
      const u = new URL(url);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;
      const req = client.request({
        hostname: u.hostname,
        port: u.port ? Number(u.port) : (isHttps ? 443 : 80),
        path: u.pathname + (u.search || ''),
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: false
      }, (res) => {
        res.resume();
        const ok = res.statusCode >= 200 && res.statusCode < 400;
        resolve({ ok, status: res.statusCode || 0, ms: Date.now() - started });
      });
      req.on('error', (error) => resolve({ ok: false, error: error?.name || 'error', ms: Date.now() - started }));
      req.on('timeout', () => {
        try { req.destroy(); } catch {}
        resolve({ ok: false, error: 'timeout', ms: Date.now() - started });
      });
      req.end();
    } catch (error) {
      resolve({ ok: false, error: error?.name || 'error', ms: Date.now() - started });
    }
  });
}

// Aggregate health checks for the main services used by the dashboard.
async function collectHealth() {
  const httpsState = resolveHttpsState();
  const devScheme = httpsState.mode === 'https' ? 'https' : 'http';
  const targets = {
    apiDocente: 'http://localhost:4000/api/salud',
    apiPortal: 'http://localhost:8080/api/portal/salud',
    webDocenteDev: `${devScheme}://localhost:5173`,
    webDocenteProd: 'http://localhost:4173'
  };

  const entries = await Promise.all(
    Object.entries(targets).map(async ([name, url]) => [name, await checkHealth(url)])
  );
  return Object.fromEntries(entries);
}

function truncateLine(text) {
  const limit = 900;
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '...';
}

function normalizeLine(text) {
  const trimmed = text.trim();
  const pipeIndex = trimmed.indexOf('|');
  if (pipeIndex !== -1) {
    const after = trimmed.slice(pipeIndex + 1).trim();
    if (after.startsWith('{') || after.includes('"msg"')) return after;
  }
  return trimmed;
}

function classifyLine(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeLine(trimmed);
  const lower = normalized.toLowerCase();
  const isJson = normalized.startsWith('{') && normalized.includes('"msg"');

  const isMongoNoise = isJson && (
    normalized.includes('"c":"NETWORK"') ||
    normalized.includes('"c":"ACCESS"') ||
    normalized.includes('"c":"WTCHKPT"') ||
    normalized.includes('"msg":"Connection ended"') ||
    normalized.includes('"msg":"Connection accepted"') ||
    normalized.includes('"msg":"Received first command"') ||
    normalized.includes('"msg":"client metadata"') ||
    normalized.includes('"msg":"Connection not authenticating"') ||
    normalized.includes('"msg":"WiredTiger message"') ||
    normalized.includes('WT_VERB_CHECKPOINT_PROGRESS')
  );

  const isMongoVerbose = (lower.includes('mongo') || lower.includes('mongo_local')) && (
    lower.includes('connection ended') ||
    lower.includes('connection accepted') ||
    lower.includes('received first command') ||
    lower.includes('client metadata') ||
    lower.includes('not authenticating') ||
    lower.includes('wiredtiger') ||
    lower.includes('wtchkpt') ||
    lower.includes('checkpoint')
  );

  let level = 'info';
  if (lower.includes('error') || lower.includes('err!') || lower.includes('failed')) {
    level = 'error';
  } else if (lower.includes('warn')) {
    level = 'warn';
  } else if (lower.includes('ready') || lower.includes('listening') || lower.includes('compiled') || lower.includes('healthy')) {
    level = 'ok';
  }

  const noisy = (isMongoNoise || isMongoVerbose) && level !== 'error';
  return { text: truncateLine(trimmed), level, noisy };
}

function recordNoise(source) {
  const stat = noiseStats.get(source) || { count: 0 };
  stat.count += 1;
  noiseStats.set(source, stat);
}

function logTaskOutput(source, data) {
  const lines = String(data).split(/\r?\n/);
  for (const line of lines) {
    const info = classifyLine(line);
    if (!info) continue;
    const entry = makeEntry(source, info.level, info.text);
    if (info.level === 'error') entry.meta = { task: source };
    pushEntry(rawLines, entry, maxRaw);
    if (info.noisy && !fullLogs) {
      recordNoise(source);
      continue;
    }
    pushEntry(logLines, entry, maxFiltered);
    persistEntry(entry);

    if (info.level === 'error' || info.level === 'warn') {
      pushEvent('task_log', source, info.level, info.text);
    }
  }
}

// Start a task in the repo root and attach its output to the log.
function startTask(name, command) {
  const existing = processes.get(name);
  if (existing && existing.proc && existing.proc.exitCode === null) {
    logSystem(`[${name}] ya esta en ejecucion`, 'warn');
    return;
  }

  logSystem(`[${name}] iniciar: ${command}`, 'system');
  pushEvent('task_start', name, 'system', 'Inicio solicitado', { command });
  const proc = spawn('cmd.exe', ['/c', command], {
    cwd: root,
    windowsHide: true
  });

  processes.set(name, { name, command, proc, startedAt: Date.now() });
  logSystem(`[${name}] PID ${proc.pid}`, 'system');
  pushEvent('task_pid', name, 'system', 'Proceso creado', { pid: proc.pid });

  proc.stdout.on('data', (data) => logTaskOutput(name, data));
  proc.stderr.on('data', (data) => logTaskOutput(name, data));
  proc.on('exit', (code) => {
    logSystem(`[${name}] finalizo con codigo ${code}`, 'system');
    pushEvent('task_exit', name, code === 0 ? 'ok' : 'warn', 'Proceso finalizado', { code });
    processes.delete(name);
  });
  proc.on('error', (err) => {
    logSystem(`[${name}] error: ${err.message}`, 'error', { console: true });
    pushEvent('task_error', name, 'error', 'Error del proceso', { message: err.message });
    processes.delete(name);
  });
}

// Stop a running task via taskkill.
function stopTask(name) {
  const entry = processes.get(name);
  if (!entry || !entry.proc || entry.proc.exitCode !== null) {
    logSystem(`[${name}] no esta en ejecucion`, 'warn');
    return;
  }
  logSystem(`[${name}] deteniendo`, 'system');
  pushEvent('task_stop', name, 'warn', 'Detencion solicitada');
  spawn('taskkill', ['/T', '/F', '/PID', String(entry.proc.pid)], { windowsHide: true });
}

// Open the dashboard URL in the default browser.
function findBrowserExecutable() {
  const candidates = [
    [process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
    [process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
    [process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
    [process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'],
    [process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'],
    [process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe']
  ];

  for (const parts of candidates) {
    if (!parts[0]) continue;
    const exe = path.join(...parts);
    try {
      if (fs.existsSync(exe)) return exe;
    } catch {
      // ignore
    }
  }
  return '';
}

function openBrowser(url) {
  const browserExe = findBrowserExecutable();
  if (browserExe) {
    const child = spawn(browserExe, [url], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return;
  }
  spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true });
}

function shouldAutostartTray() {
  return !/^(0|false|no)$/i.test(String(process.env.DASHBOARD_TRAY_AUTOSTART || '').trim());
}

function startTrayIfNeeded(activeMode, port) {
  if (process.platform !== 'win32') return;
  if (!shouldAutostartTray()) return;
  if (activeMode !== 'dev' && activeMode !== 'prod') return;

  const psPath = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const trayScript = path.join(root, 'scripts', 'launcher-tray.ps1');
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-STA',
    '-WindowStyle',
    'Hidden',
    '-File',
    trayScript,
    '-Mode',
    activeMode,
    '-Port',
    String(port),
    '-NoOpen',
    '-Attach'
  ];

  try {
    const child = spawn(psPath, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch (err) {
    logSystem(`No se pudo iniciar tray: ${err.message}`, 'warn');
  }
}

// List running task names for the status panel.
function runningTasks() {
  const names = [];
  for (const [name, entry] of processes.entries()) {
    if (entry.proc && entry.proc.exitCode === null) names.push(name);
  }
  return names;
}

function noiseSnapshot() {
  const result = {};
  for (const [name, stat] of noiseStats.entries()) {
    result[name] = stat.count;
  }
  return result;
}

// Known commands exposed via the dashboard.
const commands = {
  dev: 'npm run dev',
  'dev-frontend': 'npm run dev:frontend',
  'dev-backend': 'npm run dev:backend',
  // En dashboard, PROD debe levantar el stack rapidamente (sin correr verify/tests).
  prod: 'npm run stack:prod',
  portal: 'npm run dev:portal',
  status: 'npm run status',
  'docker-ps': 'docker ps',
  'docker-down': 'docker compose down'
};

function isRunning(name) {
  const entry = processes.get(name);
  return Boolean(entry && entry.proc && entry.proc.exitCode === null);
}

function stackDisplayString(runningList = []) {
  const stack = dockerAutostart.stack || {};
  const state = stack.state || 'unknown';
  const lastError = stack.lastError || '';
  const running = Array.isArray(runningList) ? runningList : [];
  const hasStackTask = running.includes('dev') || running.includes('prod') || running.includes('dev-backend');
  const stackRunning = Boolean(stack.running) || hasStackTask;

  if (state === 'error') return lastError || 'Error iniciando stack.';
  if (state === 'checking') return 'Comprobando stack Docker...';
  if (state === 'skipped') return 'Stack Docker ya esta activo.';
  if (stackRunning) return 'Stack activo (procesos en ejecucion).';
  if (state === 'starting') return 'Iniciando stack Docker...';
  return 'Stack detenido.';
}

function restartTask(name, delayMs = 700) {
  const command = commands[name];
  if (!command) {
    logSystem(`[${name}] reinicio solicitado pero no existe comando`, 'warn');
    return;
  }

  const wasRunning = isRunning(name);
  if (wasRunning) stopTask(name);
  pushEvent('task_restart', name, 'warn', 'Reinicio solicitado', { delayMs });
  setTimeout(() => startTask(name, command), wasRunning ? delayMs : 0);
}

function restartAll(runningNames) {
  const unique = Array.from(new Set(runningNames)).filter(Boolean);
  if (unique.length === 0) return;
  logSystem(`Reiniciando: ${unique.join(', ')}`, 'system');
  unique.forEach((name) => restartTask(name));
}

function requestAutoRestart(reason) {
  if (mode !== 'dev' || !autoRestart) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    const running = runningTasks();
    if (running.length === 0) return;

    // In dev we prefer restarting the whole dev stack if it's running.
    if (running.includes('dev')) {
      logSystem(`Auto-reinicio (dev): cambio detectado (${reason}).`, 'warn');
      restartTask('dev');
      return;
    }

    // Otherwise restart granular tasks if they are running.
    const toRestart = [];
    if (running.includes('dev-backend')) toRestart.push('dev-backend');
    if (running.includes('dev-frontend')) toRestart.push('dev-frontend');
    restartAll(toRestart);
  }, 650);
}

function setupDevWatchers() {
  if (mode !== 'dev') return;

  const targets = [
    { label: 'frontend', dir: path.join(root, 'apps', 'frontend', 'src') },
    { label: 'backend', dir: path.join(root, 'apps', 'backend', 'src') }
  ];

  targets.forEach(({ label, dir }) => {
    try {
      if (!fs.existsSync(dir)) return;
      fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const lower = String(filename).toLowerCase();
        if (lower.includes('node_modules')) return;
        if (lower.endsWith('.map') || lower.endsWith('.tsbuildinfo')) return;
        requestAutoRestart(`${label}:${eventType}:${filename}`);
      });
      logSystem(`Watcher dev activo: ${label} (${dir})`, 'ok');
    } catch (error) {
      logSystem(`No se pudo activar watcher para ${label}: ${error?.message || 'error'}`, 'warn');
    }
  });
}

// Read a JSON body safely with a size cap.
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

// Write JSON responses with no-store caching.
function sendJson(res, status, payload) {
  const data = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(data);
}

async function probeHttp(url, timeoutMs = 900) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.get({
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 80,
        path: u.pathname + (u.search || ''),
        timeout: timeoutMs
      }, (res) => {
        res.resume();
        resolve({ ok: true, status: res.statusCode || 0 });
      });
      req.on('error', () => resolve({ ok: false, status: 0 }));
      req.on('timeout', () => {
        try { req.destroy(); } catch {}
        resolve({ ok: false, status: 0 });
      });
    } catch {
      resolve({ ok: false, status: 0 });
    }
  });
}

async function pingDashboard(port) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/api/status',
      timeout: 800
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function fetchDashboardStatus(port) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/api/status',
      timeout: 900
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 250_000) {
          try { req.destroy(); } catch {}
        }
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      try { req.destroy(); } catch {}
      resolve(null);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function terminateProcess(pid) {
  if (!pid || !Number.isFinite(Number(pid))) return;
  const id = String(pid);
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/T', '/F', '/PID', id], { windowsHide: true });
      return;
    }
    process.kill(Number(pid), 'SIGTERM');
  } catch {
    // ignore
  }
}

async function findExistingInstance() {
  if (!fs.existsSync(lockPath)) return null;
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (!lock || !lock.port) return null;
    const ok = await pingDashboard(lock.port);
    if (ok) {
      const status = await fetchDashboardStatus(lock.port);
      const hasModeConfig = Boolean(status && typeof status === 'object' && 'modeConfig' in status);
      const running = status && Array.isArray(status.running) ? status.running : [];
      const inconsistent = status && status.mode === 'none' && (running.includes('dev') || running.includes('prod'));

      // If instance is old (no modeConfig) or inconsistent, restart it so UI updates apply.
      if (!hasModeConfig || inconsistent) {
        logSystem('Instancia previa desactualizada detectada. Reiniciando...', 'warn', { console: true });
        terminateProcess(Number(lock.pid || 0));
        try { fs.unlinkSync(lockPath); } catch {}
        for (let i = 0; i < 7; i++) {
          await sleep(250);
          const stillUp = await pingDashboard(lock.port);
          if (!stillUp) break;
        }
        return null;
      }

      return { port: lock.port };
    }
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // ignore
  }
  return null;
}

function writeLock(port) {
  const payload = {
    pid: process.pid,
    port,
    mode,
    startedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2));
  } catch {
    // ignore
  }
  updateSingletonLock({ port, state: 'ready', lastSeenAt: new Date().toISOString() });
}

function clearLock() {
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch {
    // ignore
  }
}

function handleExit(signal) {
  if (signal) logSystem(`Cierre solicitado: ${signal}`, 'system');
  clearLock();
  clearSingletonLock();
  process.exit(0);
}

process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));
process.on('exit', () => {
  clearLock();
  clearSingletonLock();
});

// Main HTTP server for UI and API.
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
  const pathName = reqUrl.pathname;

  if (req.method === 'GET' && pathName === '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(readTextDevOrCache(dashboardPath, cachedDashboardHtml));
    return;
  }

  if (req.method === 'GET' && pathName === '/manifest.webmanifest') {
    res.writeHead(200, {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(readTextDevOrCache(manifestPath, cachedManifestJson));
    return;
  }

  if (req.method === 'GET' && pathName === '/assets/dashboard-icon.svg') {
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(readTextDevOrCache(iconPath, cachedIconSvg));
    return;
  }

  if (req.method === 'GET' && pathName === '/sw.js') {
    // Service Worker: debe poder actualizarse rápido.
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Service-Worker-Allowed': '/',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(readTextDevOrCache(swPath, cachedSwJs));
    return;
  }

  if (req.method === 'GET' && pathName === '/api/status') {
    // Autostart en background: el endpoint debe responder rapido.
    if ((mode === 'dev' || mode === 'prod') && dockerAutostart.state === 'idle') {
      requestDockerAutostart('api_status');
    }

    const noise = noiseSnapshot();
    const noiseTotal = Object.values(noise).reduce((acc, val) => acc + val, 0);
    const running = runningTasks();
    const dockerDisplay = dockerDisplayString();
    const stackDisplay = stackDisplayString(running);
    const httpsState = resolveHttpsState();

    const hasDev = running.includes('dev');
    const hasProd = running.includes('prod');
    let uiMode = mode;
    if (mode !== 'dev' && mode !== 'prod') {
      if (hasDev && !hasProd) uiMode = 'dev';
      else if (hasProd && !hasDev) uiMode = 'prod';
      else if (hasDev && hasProd) uiMode = 'dev';
      else uiMode = 'none';
    }

    const payload = {
      root,
      mode: uiMode,
      modeConfig: mode,
      port: listeningPort,
      node: safeExec('node -v', 'No detectado'),
      npm: safeExec('npm -v', 'No detectado'),
      docker: dockerDisplay,
      dockerDisplay,
      stackDisplay,
      https: httpsState,
      dockerState: {
        state: dockerAutostart.state,
        ready: dockerAutostart.ready,
        version: dockerAutostart.version,
        lastError: dockerAutostart.lastError,
        stack: dockerAutostart.stack,
        lastChangedAt: dockerAutostart.lastChangedAt
      },
      running,
      logSize: logLines.length,
      rawSize: rawLines.length,
      noise,
      noiseTotal,
      autoRestart
    };
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === 'GET' && pathName === '/api/install') {
    const pkg = readRootPackageInfo();
    const running = runningTasks();
    const hasDev = running.includes('dev');
    const hasProd = running.includes('prod');
    let uiMode = mode;
    if (mode !== 'dev' && mode !== 'prod') {
      if (hasDev && !hasProd) uiMode = 'dev';
      else if (hasProd && !hasDev) uiMode = 'prod';
      else if (hasDev && hasProd) uiMode = 'dev';
      else uiMode = 'none';
    }
    const payload = {
      app: {
        name: pkg.name || 'evaluapro',
        version: pkg.version || ''
      },
      dashboard: {
        mode: uiMode,
        modeConfig: mode,
        port: listeningPort,
        pid: process.pid,
        startedAt: dashboardStartedAt,
        noOpen,
        verbose,
        fullLogs
      },
      paths: {
        root,
        logDir,
        logFile,
        lockPath,
        dashboardHtml: dashboardPath,
        manifestPath,
        iconPath
      },
      logs: {
        persistMode,
        enabled: diskWriter.enabled,
        flushMs: diskWriter.flushMs,
        maxBytes: diskWriter.maxBytes,
        keepFiles: diskWriter.keepFiles
      },
      runtime: {
        nodeVersion: process.version,
        execPath: process.execPath,
        platform: process.platform,
        arch: process.arch
      }
    };
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === 'GET' && pathName === '/api/mongo-express') {
    const url = 'http://127.0.0.1:8081/';
    const probe = await probeHttp(url);
    // 401/403 suele indicar que el servicio esta arriba con basic auth.
    const reachable = probe.ok && probe.status >= 100;
    sendJson(res, 200, {
      url,
      reachable,
      status: probe.status || 0
    });
    return;
  }

  if (req.method === 'GET' && pathName === '/api/config') {
    sendJson(res, 200, { autoRestart });
    return;
  }

  if (req.method === 'POST' && pathName === '/api/config') {
    const body = await readBody(req);
    const next = Boolean(body.autoRestart);
    autoRestart = mode === 'dev' ? next : false;
    logSystem(`Auto-reinicio: ${autoRestart ? 'ACTIVO' : 'DESACTIVADO'}`, autoRestart ? 'ok' : 'warn');
    sendJson(res, 200, { ok: true, autoRestart });
    return;
  }

  if (req.method === 'GET' && pathName === '/api/health') {
    const services = await collectHealth();
    sendJson(res, 200, { checkedAt: Date.now(), services });
    return;
  }

  if (req.method === 'GET' && pathName === '/api/logs') {
    const wantFull = reqUrl.searchParams.get('full') === '1';
    const entries = wantFull ? rawLines : logLines;
    sendJson(res, 200, { entries });
    return;
  }

  if (req.method === 'GET' && pathName === '/api/events') {
    sendJson(res, 200, { entries: events });
    return;
  }

  if (req.method === 'GET' && pathName === '/api/logfile') {
    let content = '';
    try {
      content = fs.readFileSync(logFile, 'utf8');
    } catch {
      content = '';
    }
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline; filename="dashboard.log"',
      'Cache-Control': 'no-store'
    });
    res.end(content);
    return;
  }

  if (req.method === 'POST' && pathName === '/api/logs/clear') {
    logLines.length = 0;
    rawLines.length = 0;
    noiseStats.clear();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathName === '/api/start') {
    const body = await readBody(req);
    const task = String(body.task || '').trim();
    const command = commands[task];
    if (!command) return sendJson(res, 400, { error: 'Tarea desconocida' });
    pushEvent('api', 'dashboard', 'info', 'POST /api/start', { task });
    startTask(task, command);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathName === '/api/stop') {
    const body = await readBody(req);
    const task = String(body.task || '').trim();
    if (!task) return sendJson(res, 400, { error: 'Tarea requerida' });
    pushEvent('api', 'dashboard', 'info', 'POST /api/stop', { task });
    stopTask(task);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathName === '/api/restart') {
    const body = await readBody(req);
    const task = String(body.task || '').trim();

    if (!task) return sendJson(res, 400, { error: 'Tarea requerida' });

    pushEvent('api', 'dashboard', 'info', 'POST /api/restart', { task });

    if (task === 'all') {
      const running = runningTasks();
      restartAll(running);
      return sendJson(res, 200, { ok: true, restarted: running });
    }

    if (task === 'stack') {
      const running = runningTasks();
      const candidates = ['dev', 'prod', 'portal', 'dev-frontend', 'dev-backend'];
      const toRestart = candidates.filter((name) => running.includes(name));
      restartAll(toRestart);
      return sendJson(res, 200, { ok: true, restarted: toRestart });
    }

    if (!commands[task]) return sendJson(res, 400, { error: 'Tarea desconocida' });
    restartTask(task);
    return sendJson(res, 200, { ok: true, restarted: [task] });
  }

  if (req.method === 'POST' && pathName === '/api/run') {
    const body = await readBody(req);
    const task = String(body.task || '').trim();
    const command = commands[task];
    if (!command) return sendJson(res, 400, { error: 'Comando desconocido' });
    pushEvent('api', 'dashboard', 'info', 'POST /api/run', { task });
    startTask(task, command);
    return sendJson(res, 200, { ok: true });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// Start server on a free port and auto-start tasks for the chosen mode.
(async () => {
  const singleton = await ensureSingletonLock();
  if (!singleton.ok) return;

  const existing = await findExistingInstance();
  if (existing) {
    const url = `http://127.0.0.1:${existing.port}`;
    logSystem(`Dashboard ya esta activo: ${url}`, 'ok', { console: true });
    if (!noOpen) openBrowser(url);
    clearSingletonLock();
    return;
  }

  const requestedPort = portArg ? Number(portArg) : null;
  const hasRequestedPort = Number.isFinite(requestedPort);
  let port = hasRequestedPort ? requestedPort : await findPort(4519);

  if (!await isPortFree(port)) {
    const url = `http://127.0.0.1:${port}`;
    const ok = await pingDashboard(port);
    if (ok) {
      logSystem(`Dashboard ya esta activo: ${url}`, 'ok', { console: true });
      if (!noOpen) openBrowser(url);
      return;
    }

    if (hasRequestedPort) {
      const fallback = await findPort(port + 1);
      const fallbackOk = fallback !== port && await isPortFree(fallback);
      if (fallbackOk) {
        logSystem(`Puerto ocupado: ${port}. Usando ${fallback}.`, 'warn', { console: true });
        port = fallback;
      } else {
        logSystem(`Puerto ocupado: ${port}. Cierra la instancia previa o cambia --port.`, 'error', { console: true });
        clearSingletonLock();
        return;
      }
    } else {
      const fallback = await findPort(port + 1);
      const fallbackOk = fallback !== port && await isPortFree(fallback);
      if (fallbackOk) {
        port = fallback;
      } else {
        logSystem('No se encontro puerto libre para dashboard.', 'error', { console: true });
        clearSingletonLock();
        return;
      }
    }
  }

  server.on('error', (err) => {
    logSystem(`Error del servidor: ${err.message}`, 'error', { console: true });
  });
  server.listen(port, '127.0.0.1', () => {
    listeningPort = port;
    const url = `http://127.0.0.1:${port}`;
    writeLock(port);
    logSystem(`Dashboard listo: ${url}`, 'ok', { console: true });
    if (!noOpen) openBrowser(url);
    // En accesos directos/tray: primero confirma Docker y luego inicia el stack.
    if (mode === 'dev' || mode === 'prod') requestDockerAutostart('startup');
    startTrayIfNeeded(mode, port);

    setupDevWatchers();
  });
})();

// Scan a small range to find a free localhost port.
async function findPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    const ok = await isPortFree(port);
    if (ok) return port;
  }
  return startPort;
}

// Check if a port is free by attempting to bind.
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}
