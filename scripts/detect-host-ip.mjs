import fs from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const certName = 'EvaluaPro';
const certCompany = 'Cybersys Tech';

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function resolveCertDir() {
  const localApp = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (localApp) return path.join(localApp, 'EvaluaPro', 'certs');
  return path.join(root, 'logs', 'certs');
}

function ensureDevCertificate(hostIp, certDir) {
  if (process.platform !== 'win32') return;
  const scriptPath = path.join(root, 'scripts', 'ensure-dev-cert.ps1');
  if (!fs.existsSync(scriptPath)) return;

  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const psExe = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-OutDir',
    certDir
  ];
  if (hostIp) args.push('-HostIp', hostIp);

  spawnSync(psExe, args, { stdio: 'ignore' });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getEnvValue(content, key) {
  const re = new RegExp(`^${escapeRegex(key)}=(.*)$`, 'm');
  const match = content.match(re);
  return match ? String(match[1] ?? '').trim() : '';
}

function isValidIpv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isPrivateIpv4(ip) {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const seg = Number(ip.split('.')[1] ?? -1);
    return seg >= 16 && seg <= 31;
  }
  return false;
}

function isLinkLocal(ip) {
  return ip.startsWith('169.254.');
}

function scoreCandidate(ip, name) {
  if (!isValidIpv4(ip) || isLinkLocal(ip)) return -1;
  const lname = String(name || '').toLowerCase();
  let score = 0;
  if (ip.startsWith('192.168.')) score += 100;
  else if (ip.startsWith('10.')) score += 95;
  else if (isPrivateIpv4(ip)) score += 80;
  else score += 40;

  if (lname.includes('docker') || lname.includes('veth') || lname.includes('virtual')) score -= 25;
  if (lname.includes('loopback')) score -= 100;
  return score;
}

function detectarHostIp() {
  const redes = os.networkInterfaces();
  const candidatos = [];
  for (const [name, entradas] of Object.entries(redes)) {
    for (const item of entradas ?? []) {
      if (!item || item.internal) continue;
      if (item.family !== 'IPv4') continue;
      const ip = String(item.address || '').trim();
      const score = scoreCandidate(ip, name);
      if (score < 0) continue;
      candidatos.push({ ip, score, name });
    }
  }
  candidatos.sort((a, b) => b.score - a.score);
  return candidatos[0]?.ip || '';
}

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const base = content.trimEnd();
  return `${base}${base ? '\n' : ''}${line}\n`;
}

function setEnvValueIfMissing(content, key, value) {
  const re = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');
  if (re.test(content)) return content;
  const base = content.trimEnd();
  return `${base}${base ? '\n' : ''}${key}=${value}\n`;
}

function actualizarEnv(hostIp) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  content = setEnvValueIfMissing(content, 'VITE_HTTPS', '1');
  const httpsFlag = getEnvValue(content, 'VITE_HTTPS');
  const usarHttps = /^(1|true|si|yes)$/i.test(httpsFlag);

  const certDir = resolveCertDir();
  if (usarHttps) ensureDevCertificate(hostIp, certDir);
  const certPath = path.join(certDir, 'evaluapro-dev-cert.pem');
  const keyPath = path.join(certDir, 'evaluapro-dev-key.pem');
  const certReady = fs.existsSync(certPath) && fs.existsSync(keyPath);
  const fallback = usarHttps && !certReady;

  const apiBase = usarHttps ? '/api' : `http://${hostIp}:4000/api`;
  const portalBase = usarHttps ? '/api/portal' : `http://${hostIp}:8080/api/portal`;
  const httpCors = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    `http://${hostIp}:5173`,
    `http://${hostIp}:4173`
  ];
  const httpsCors = [
    'https://localhost:5173',
    'https://127.0.0.1:5173',
    'https://localhost:4173',
    'https://127.0.0.1:4173',
    `https://${hostIp}:5173`,
    `https://${hostIp}:4173`
  ];
  const cors = [...httpCors, ...(usarHttps ? httpsCors : [])].join(',');

  content = setEnvValue(content, 'HOST_IP', hostIp);
  content = setEnvValue(content, 'VITE_API_BASE_URL', apiBase);
  content = setEnvValue(content, 'VITE_PORTAL_BASE_URL', portalBase);
  content = setEnvValue(content, 'CORS_ORIGENES', cors);
  content = setEnvValue(content, 'VITE_HTTPS_CERT_PATH', toPosixPath(certPath));
  content = setEnvValue(content, 'VITE_HTTPS_KEY_PATH', toPosixPath(keyPath));
  content = setEnvValue(content, 'VITE_HTTPS_FALLBACK', fallback ? '1' : '0');
  content = setEnvValueIfMissing(content, 'VITE_HTTPS_CERT_NAME', certName);
  content = setEnvValueIfMissing(content, 'VITE_HTTPS_CERT_COMPANY', certCompany);

  fs.writeFileSync(envPath, content, 'utf8');
}

try {
  const hostIp = detectarHostIp();
  if (!hostIp) {
    process.stdout.write('[host-ip] No se pudo detectar una IP local valida.\n');
    process.exit(0);
  }
  actualizarEnv(hostIp);
  process.stdout.write(`[host-ip] HOST_IP=${hostIp}\n`);
} catch (error) {
  process.stdout.write(`[host-ip] Error: ${error?.message || 'fallo detectando IP'}\n`);
  process.exit(0);
}
