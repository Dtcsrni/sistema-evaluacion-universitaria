import { emitToast } from '../ui/toast/toastBus';

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

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function tieneJson(respuesta: unknown): respuesta is { json: () => Promise<unknown> } {
  return esObjeto(respuesta) && typeof respuesta['json'] === 'function';
}

export async function leerErrorRemoto(respuesta: unknown): Promise<DetalleErrorRemoto> {
  const status = esObjeto(respuesta) && typeof respuesta['status'] === 'number' ? (respuesta['status'] as number) : undefined;
  const base: DetalleErrorRemoto = { status };

  if (!tieneJson(respuesta)) return base;

  try {
    const data: unknown = await respuesta.json().catch(() => null);
    const err = esObjeto(data) ? data['error'] : undefined;
    if (esObjeto(err)) {
      return {
        ...base,
        codigo: typeof err['codigo'] === 'string' ? err['codigo'] : undefined,
        mensaje: typeof err['mensaje'] === 'string' ? err['mensaje'] : undefined,
        detalles: err['detalles']
      };
    }
    return base;
  } catch {
    return base;
  }
}

export async function leerJsonOk<T>(respuesta: unknown, mensajeServicio: string): Promise<T> {
  if (!tieneJson(respuesta)) {
    throw new ErrorRemoto(mensajeServicio, { mensaje: 'Respuesta invalida', detalles: 'La respuesta no incluye JSON.' });
  }

  try {
    return (await respuesta.json()) as T;
  } catch (error) {
    throw new ErrorRemoto(mensajeServicio, { mensaje: 'Respuesta invalida', detalles: String(error) });
  }
}

export function crearGestorEventosUso<EventoUso>(opts: {
  obtenerToken: () => string | null;
  publicarLote: (lote: EventoUso[], token: string) => Promise<void>;
}) {
  const colaEventos: EventoUso[] = [];
  let flushEnCurso = false;
  let flushTimer: number | null = null;

  async function flushEventosUso() {
    const token = opts.obtenerToken();
    if (!token) {
      colaEventos.length = 0;
      return;
    }
    if (flushEnCurso) return;
    if (!colaEventos.length) return;
    flushEnCurso = true;

    try {
      while (colaEventos.length) {
        const lote = colaEventos.splice(0, 100);
        await opts.publicarLote(lote, token);
      }
    } catch {
      // best-effort: si falla, descartamos para no crecer sin límite.
      colaEventos.length = 0;
    } finally {
      flushEnCurso = false;
    }
  }

  function programarFlush() {
    if (flushTimer) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flushEventosUso();
    }, 1200);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushEventosUso();
    });
    window.addEventListener('pagehide', () => {
      void flushEventosUso();
    });
  }

  async function registrarEventosUso(payload: { eventos: EventoUso[] }) {
    if (!payload?.eventos?.length) return;
    colaEventos.push(...payload.eventos);
    if (colaEventos.length >= 20) {
      void flushEventosUso();
      return;
    }
    programarFlush();
  }

  return { registrarEventosUso };
}

export async function fetchConManejoErrores<T>(opts: {
  fetcher: () => Promise<unknown>;
  mensajeServicio: string;
  toastUnreachable: { id: string; title: string; message: string };
  toastServerError: { id: string; title: string; message: (status: number | undefined) => string };
}): Promise<T> {
  let respuesta: unknown;
  try {
    respuesta = await opts.fetcher();
  } catch (error) {
    emitToast({
      id: opts.toastUnreachable.id,
      level: 'error',
      title: opts.toastUnreachable.title,
      message: opts.toastUnreachable.message,
      durationMs: 5200
    });
    throw new ErrorRemoto(opts.mensajeServicio, { mensaje: 'Sin conexion', detalles: String(error) });
  }

  const ok = esObjeto(respuesta) && typeof respuesta['ok'] === 'boolean' ? (respuesta['ok'] as boolean) : false;
  const status = esObjeto(respuesta) && typeof respuesta['status'] === 'number' ? (respuesta['status'] as number) : undefined;

  if (!ok) {
    const detalle = await leerErrorRemoto(respuesta);
    if (status !== undefined && status >= 500) {
      emitToast({
        id: opts.toastServerError.id,
        level: 'error',
        title: opts.toastServerError.title,
        message: opts.toastServerError.message(status),
        durationMs: 5200
      });
    }
    throw new ErrorRemoto(opts.mensajeServicio, { ...detalle, status });
  }

  return leerJsonOk<T>(respuesta, opts.mensajeServicio);
}
