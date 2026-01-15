/**
 * Cliente API simple para frontend docente/alumno.
 */
import { emitToast } from '../ui/toast/toastBus';

const baseApi = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const claveToken = 'tokenDocente';

export type DetalleErrorRemoto = {
  status?: number;
  codigo?: string;
  mensaje?: string;
  detalles?: unknown;
};

export class ErrorRemoto extends Error {
  detalle: DetalleErrorRemoto;

  constructor(mensaje: string, detalle: DetalleErrorRemoto = {}) {
    super(mensaje);
    this.detalle = detalle;
  }
}

async function leerErrorRemoto(respuesta: Response): Promise<DetalleErrorRemoto> {
  const base: DetalleErrorRemoto = { status: respuesta.status };
  try {
    const data = (await respuesta.json().catch(() => null)) as any;
    const err = data?.error;
    if (err && typeof err === 'object') {
      return {
        ...base,
        codigo: typeof err.codigo === 'string' ? err.codigo : undefined,
        mensaje: typeof err.mensaje === 'string' ? err.mensaje : undefined,
        detalles: err.detalles
      };
    }
    return base;
  } catch {
    return base;
  }
}

export function guardarTokenDocente(token: string) {
  localStorage.setItem(claveToken, token);
}

export function obtenerTokenDocente() {
  return localStorage.getItem(claveToken);
}

export function limpiarTokenDocente() {
  localStorage.removeItem(claveToken);
}

export function crearClienteApi() {
  async function obtener<T>(ruta: string): Promise<T> {
    const token = obtenerTokenDocente();
    let respuesta: Response;
    try {
      respuesta = await fetch(`${baseApi}${ruta}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
    } catch (error) {
      emitToast({
        id: 'api-unreachable',
        level: 'error',
        title: 'Sin conexion',
        message: 'No se pudo contactar la API docente.',
        durationMs: 5200
      });
      throw new ErrorRemoto('API no disponible', { mensaje: 'Sin conexion', detalles: String(error) });
    }
    if (!respuesta.ok) {
      const detalle = await leerErrorRemoto(respuesta);
      if (respuesta.status >= 500) {
        emitToast({
          id: 'api-server-error',
          level: 'error',
          title: 'API con error',
          message: `La API respondio con HTTP ${respuesta.status}.`,
          durationMs: 5200
        });
      }
      throw new ErrorRemoto('API no disponible', detalle);
    }
    return respuesta.json() as Promise<T>;
  }

  async function enviar<T>(ruta: string, payload: unknown): Promise<T> {
    const token = obtenerTokenDocente();
    let respuesta: Response;
    try {
      respuesta = await fetch(`${baseApi}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      emitToast({
        id: 'api-unreachable',
        level: 'error',
        title: 'Sin conexion',
        message: 'No se pudo contactar la API docente.',
        durationMs: 5200
      });
      throw new ErrorRemoto('API no disponible', { mensaje: 'Sin conexion', detalles: String(error) });
    }
    if (!respuesta.ok) {
      const detalle = await leerErrorRemoto(respuesta);
      if (respuesta.status >= 500) {
        emitToast({
          id: 'api-server-error',
          level: 'error',
          title: 'API con error',
          message: `La API respondio con HTTP ${respuesta.status}.`,
          durationMs: 5200
        });
      }
      throw new ErrorRemoto('API no disponible', detalle);
    }
    return respuesta.json() as Promise<T>;
  }

  return { baseApi, obtener, enviar };
}
