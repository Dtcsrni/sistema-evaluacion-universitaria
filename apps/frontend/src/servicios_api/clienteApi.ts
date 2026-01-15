/**
 * Cliente API simple para frontend docente/alumno.
 */
import { crearGestorEventosUso, DetalleErrorRemoto, ErrorRemoto, fetchConManejoErrores } from './clienteComun';

const baseApi = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const claveToken = 'tokenDocente';

export type { DetalleErrorRemoto };
export { ErrorRemoto };

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
  type EventoUso = {
    sessionId?: string;
    pantalla?: string;
    accion: string;
    exito?: boolean;
    duracionMs?: number;
    meta?: unknown;
  };

  const { registrarEventosUso } = crearGestorEventosUso<EventoUso>({
    obtenerToken: obtenerTokenDocente,
    publicarLote: async (lote, token) => {
      await fetch(`${baseApi}/analiticas/eventos-uso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventos: lote }),
        keepalive: true
      });
    }
  });

  async function obtener<T>(ruta: string): Promise<T> {
    const token = obtenerTokenDocente();
    return fetchConManejoErrores<T>({
      fetcher: () =>
        fetch(`${baseApi}${ruta}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        }),
      mensajeServicio: 'API no disponible',
      toastUnreachable: {
        id: 'api-unreachable',
        title: 'Sin conexion',
        message: 'No se pudo contactar la API docente.'
      },
      toastServerError: {
        id: 'api-server-error',
        title: 'API con error',
        message: (status) => `La API respondio con HTTP ${status}.`
      }
    });
  }

  async function enviar<T>(ruta: string, payload: unknown): Promise<T> {
    const token = obtenerTokenDocente();
    return fetchConManejoErrores<T>({
      fetcher: () =>
        fetch(`${baseApi}${ruta}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(payload)
        }),
      mensajeServicio: 'API no disponible',
      toastUnreachable: {
        id: 'api-unreachable',
        title: 'Sin conexion',
        message: 'No se pudo contactar la API docente.'
      },
      toastServerError: {
        id: 'api-server-error',
        title: 'API con error',
        message: (status) => `La API respondio con HTTP ${status}.`
      }
    });
  }

  return { baseApi, obtener, enviar, registrarEventosUso };
}
