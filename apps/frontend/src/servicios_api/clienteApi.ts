/**
 * Cliente API simple para frontend docente/alumno.
 */
import {
  crearGestorEventosUso,
  DetalleErrorRemoto,
  ErrorRemoto,
  fetchConManejoErrores,
  mensajeUsuarioDeError
} from './clienteComun';

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
      const controller = new AbortController();
      const timer = globalThis.setTimeout(() => controller.abort(), 2500);
      try {
        await fetch(`${baseApi}/analiticas/eventos-uso`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ eventos: lote }),
          keepalive: true,
          signal: controller.signal
        });
      } finally {
        globalThis.clearTimeout(timer);
      }
    }
  });

  type RequestOptions = { timeoutMs?: number };

  let refreshEnCurso: Promise<string | null> | null = null;

  async function intentarRefrescarToken(): Promise<string | null> {
    if (refreshEnCurso) return refreshEnCurso;
    refreshEnCurso = (async () => {
      try {
        const resp = await fetchConManejoErrores<{ token: string }>({
          fetcher: (signal) =>
            fetch(`${baseApi}/autenticacion/refrescar`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
              signal
            }),
          mensajeServicio: 'API no disponible',
          timeoutMs: 10_000,
          toastUnreachable: {
            id: 'api-unreachable',
            title: 'Sin conexion',
            message: 'No se pudo contactar la API docente.'
          },
          toastTimeout: {
            id: 'api-timeout',
            title: 'Tiempo de espera',
            message: 'La API tardo demasiado en responder.'
          },
          toastServerError: {
            id: 'api-server-error',
            title: 'API con error',
            message: (status) => `La API respondio con HTTP ${status}.`
          }
        });

        if (resp?.token) {
          guardarTokenDocente(resp.token);
          return resp.token;
        }
        return null;
      } catch {
        return null;
      } finally {
        refreshEnCurso = null;
      }
    })();
    return refreshEnCurso;
  }

  async function obtener<T>(ruta: string, opciones?: RequestOptions): Promise<T> {
    const token = obtenerTokenDocente();
    return fetchConManejoErrores<T>({
      fetcher: async (signal) => {
        const hacer = (t: string | null) =>
          fetch(`${baseApi}${ruta}`, {
            credentials: 'include',
            headers: t ? { Authorization: `Bearer ${t}` } : undefined,
            signal
          });

        let respuesta = await hacer(token);
        if (respuesta && (respuesta as Response).status === 401) {
          const nuevo = await intentarRefrescarToken();
          if (nuevo) respuesta = await hacer(nuevo);
        }
        return respuesta;
      },
      mensajeServicio: 'API no disponible',
      timeoutMs: opciones?.timeoutMs ?? 12_000,
      toastUnreachable: {
        id: 'api-unreachable',
        title: 'Sin conexion',
        message: 'No se pudo contactar la API docente.'
      },
      toastTimeout: {
        id: 'api-timeout',
        title: 'Tiempo de espera',
        message: 'La API tardo demasiado en responder.'
      },
      toastServerError: {
        id: 'api-server-error',
        title: 'API con error',
        message: (status) => `La API respondio con HTTP ${status}.`
      }
    });
  }

  async function enviar<T>(ruta: string, payload: unknown, opciones?: RequestOptions): Promise<T> {
    const token = obtenerTokenDocente();
    return fetchConManejoErrores<T>({
      fetcher: async (signal) => {
        const hacer = (t: string | null) =>
          fetch(`${baseApi}${ruta}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
            body: JSON.stringify(payload),
            signal
          });

        let respuesta = await hacer(token);
        if (respuesta && (respuesta as Response).status === 401) {
          const nuevo = await intentarRefrescarToken();
          if (nuevo) respuesta = await hacer(nuevo);
        }
        return respuesta;
      },
      mensajeServicio: 'API no disponible',
      timeoutMs: opciones?.timeoutMs ?? 15_000,
      toastUnreachable: {
        id: 'api-unreachable',
        title: 'Sin conexion',
        message: 'No se pudo contactar la API docente.'
      },
      toastTimeout: {
        id: 'api-timeout',
        title: 'Tiempo de espera',
        message: 'La API tardo demasiado en responder.'
      },
      toastServerError: {
        id: 'api-server-error',
        title: 'API con error',
        message: (status) => `La API respondio con HTTP ${status}.`
      }
    });
  }

  return { baseApi, obtener, enviar, registrarEventosUso, mensajeUsuarioDeError, intentarRefrescarToken };
}
