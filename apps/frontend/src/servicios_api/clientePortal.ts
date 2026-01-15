/**
 * Cliente API del portal alumno (Cloud Run).
 */
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
    const respuesta = await fetch(`${basePortal}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!respuesta.ok) {
      const detalle = await leerErrorRemoto(respuesta);
      throw new ErrorRemoto('Portal no disponible', detalle);
    }
    return respuesta.json() as Promise<T>;
  }

  async function obtener<T>(ruta: string): Promise<T> {
    const token = obtenerTokenAlumno();
    const respuesta = await fetch(`${basePortal}${ruta}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!respuesta.ok) {
      const detalle = await leerErrorRemoto(respuesta);
      throw new ErrorRemoto('Portal no disponible', detalle);
    }
    return respuesta.json() as Promise<T>;
  }

  return { basePortal, enviar, obtener };
}
