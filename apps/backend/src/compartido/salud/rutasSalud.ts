/**
 * Endpoint de salud para monitoreo de API y base de datos.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import os from 'node:os';
import QRCode from 'qrcode';

const router = Router();

router.get('/', (_req, res) => {
  const estado = mongoose.connection.readyState; // 0,1,2,3
  const textoEstado = ['desconectado', 'conectado', 'conectando', 'desconectando'][estado] ?? 'desconocido';
  res.json({ estado: 'ok', tiempoActivo: process.uptime(), db: { estado, descripcion: textoEstado } });
});

function esIpPrivada(ip: string) {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const seg = Number(ip.split('.')[1] ?? -1);
    return seg >= 16 && seg <= 31;
  }
  return false;
}

function obtenerIpsLocales() {
  const redes = os.networkInterfaces();
  const ips: string[] = [];
  for (const entradas of Object.values(redes)) {
    for (const item of entradas ?? []) {
      if (!item || item.internal) continue;
      if (item.family !== 'IPv4') continue;
      ips.push(item.address);
    }
  }
  const unicas = Array.from(new Set(ips));
  const privadas = unicas.filter((ip) => esIpPrivada(ip));
  const publicas = unicas.filter((ip) => !esIpPrivada(ip));
  const preferida = privadas[0] ?? publicas[0] ?? null;
  return { ips: [...privadas, ...publicas], preferida };
}

router.get('/ip-local', (_req, res) => {
  res.json(obtenerIpsLocales());
});

router.get('/qr', async (req, res) => {
  const texto = typeof req.query.texto === 'string' ? req.query.texto.trim() : '';
  if (!texto) {
    res.status(400).json({ error: { codigo: 'QR_TEXTO_VACIO', mensaje: 'texto requerido' } });
    return;
  }
  try {
    const buffer = await QRCode.toBuffer(texto, {
      margin: 1,
      width: 360,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: { codigo: 'QR_FALLO', mensaje: error instanceof Error ? error.message : 'Error' } });
  }
});

export default router;
