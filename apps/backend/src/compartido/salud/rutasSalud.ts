/**
 * Endpoint de salud para monitoreo de API y base de datos.
 */
import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/', (_req, res) => {
  const estado = mongoose.connection.readyState; // 0,1,2,3
  const textoEstado = ['desconectado', 'conectado', 'conectando', 'desconectando'][estado] ?? 'desconocido';
  res.json({ estado: 'ok', tiempoActivo: process.uptime(), db: { estado, descripcion: textoEstado } });
});

export default router;
