/**
 * Cliente API del portal alumno (Cloud Run).
 */
import { emitToast } from '../ui/toast/toastBus';

const basePortal = import.meta.env.VITE_PORTAL_BASE_URL || 'http://localhost:8080/api/portal';
const claveTokenAlumno = 'tokenAlumno';

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

export function guardarTokenAlumno(token: string) {
  localStorage.setItem(claveTokenAlumno, token);
}

export function obtenerTokenAlumno() {
  return localStorage.getItem(claveTokenAlumno);
}

export function limpiarTokenAlumno() {
  localStorage.removeItem(claveTokenAlumno);
}

export function crearClientePortal() {
  async function enviar<T>(ruta: string, payload: unknown): Promise<T> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${basePortal}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      emitToast({
        id: 'portal-unreachable',
        level: 'error',
        title: 'Sin conexion',
        message: 'No se pudo contactar el portal alumno.',
        durationMs: 5200
      });
      throw new ErrorRemoto('Portal no disponible', { mensaje: 'Sin conexion', detalles: String(error) });
    }
    if (!respuesta.ok) {
      const detalle = await leerErrorRemoto(respuesta);
      if (respuesta.status >= 500) {
        emitToast({
          id: 'portal-server-error',
          level: 'error',
          title: 'Portal con error',
          message: `El portal respondio con HTTP ${respuesta.status}.`,
          durationMs: 5200
        });
      }
      throw new ErrorRemoto('Portal no disponible', detalle);
    }
    return respuesta.json() as Promise<T>;
  }

  async function obtener<T>(ruta: string): Promise<T> {
    const token = obtenerTokenAlumno();
    let respuesta: Response;
    try {
      respuesta = await fetch(`${basePortal}${ruta}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
    } catch (error) {
      emitToast({
        id: 'portal-unreachable',
        level: 'error',
        title: 'Sin conexion',
        message: 'No se pudo contactar el portal alumno.',
        durationMs: 5200
      });
      throw new ErrorRemoto('Portal no disponible', { mensaje: 'Sin conexion', detalles: String(error) });
    }
    if (!respuesta.ok) {
      const detalle = await leerErrorRemoto(respuesta);
      if (respuesta.status >= 500) {
        emitToast({
          id: 'portal-server-error',
          level: 'error',
          title: 'Portal con error',
          message: `El portal respondio con HTTP ${respuesta.status}.`,
          durationMs: 5200
        });
      }
      throw new ErrorRemoto('Portal no disponible', detalle);
    }
    return respuesta.json() as Promise<T>;
  }

  return { basePortal, enviar, obtener };
}
