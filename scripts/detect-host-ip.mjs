import fs from 'fs';
import os from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

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

function actualizarEnv(hostIp) {
  const contenido = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const linea = `HOST_IP=${hostIp}`;
  if (/^HOST_IP=.*$/m.test(contenido)) {
    const actualizado = contenido.replace(/^HOST_IP=.*$/m, linea);
    if (actualizado !== contenido) fs.writeFileSync(envPath, actualizado, 'utf8');
    return;
  }
  const base = contenido.trimEnd();
  const salida = `${base}${base ? '\n' : ''}${linea}\n`;
  fs.writeFileSync(envPath, salida, 'utf8');
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
