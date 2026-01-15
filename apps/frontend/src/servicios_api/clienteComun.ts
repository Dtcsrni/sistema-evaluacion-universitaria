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

function esAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'AbortError';
}

function tieneJson(respuesta: unknown): respuesta is { json: () => Promise<unknown> } {
  return esObjeto(respuesta) && typeof respuesta['json'] === 'function';
}

function obtenerStatus(respuesta: unknown): number | undefined {
  return esObjeto(respuesta) && typeof respuesta['status'] === 'number' ? (respuesta['status'] as number) : undefined;
}

export async function leerErrorRemoto(respuesta: unknown): Promise<DetalleErrorRemoto> {
  const status = obtenerStatus(respuesta);
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
  const status = obtenerStatus(respuesta);
  if (status === 204 || status === 205) {
    return undefined as T;
  }

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

function mensajeAmigablePorStatus(status?: number): string | undefined {
  if (status === 401) return 'Tu sesion expiro. Inicia sesion de nuevo.';
  if (status === 403) return 'No tienes permiso para realizar esta accion.';
  if (status === 404) return 'No se encontro el recurso solicitado.';
  if (status === 408) return 'La solicitud tardo demasiado. Intenta de nuevo.';
  if (status === 409) return 'Conflicto al guardar. Actualiza e intenta otra vez.';
  if (status === 413) return 'El archivo o datos son demasiado grandes.';
  if (status === 422) return 'Datos invalidos. Revisa los campos e intenta de nuevo.';
  if (status === 429) return 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
  if (typeof status === 'number' && status >= 500) return 'El servicio tuvo un problema. Intenta mas tarde.';
  return undefined;
}

function mensajeAmigablePorCodigo(codigo?: string): string | undefined {
  if (!codigo) return undefined;
  const c = codigo.toUpperCase();
  if (c.includes('TOKEN') && c.includes('INVALID')) return 'Tu sesion expiro. Inicia sesion de nuevo.';
  if (c.includes('TOKEN') && c.includes('EXPIR')) return 'Tu sesion expiro. Inicia sesion de nuevo.';
  if (c.includes('NO_AUTORIZ')) return 'No tienes permiso para realizar esta accion.';
  if (c.includes('DATOS_INVALID')) return 'Datos invalidos. Revisa los campos e intenta de nuevo.';
  if (c.includes('EXAMEN_NO_ENCONTR')) return 'No se encontro el examen solicitado.';
  if (c.includes('PDF_NO_DISPON')) return 'El PDF no esta disponible aun.';
  if (c.includes('ERROR_INTERNO')) return 'Ocurrio un error interno. Intenta mas tarde.';
  return undefined;
}

export function mensajeUsuarioDeError(error: unknown, fallback: string): string {
  if (error instanceof ErrorRemoto) {
    const detalle = error.detalle;
    const porCodigo = mensajeAmigablePorCodigo(detalle?.codigo);
    if (porCodigo) return porCodigo;

    const porStatus = mensajeAmigablePorStatus(detalle?.status);
    if (porStatus) return porStatus;

    if (detalle?.mensaje) return detalle.mensaje;
    if (detalle?.codigo) return `Error: ${detalle.codigo}`;
    return fallback;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function sugerenciaUsuarioDeError(error: unknown): string | undefined {
  if (error instanceof ErrorRemoto) {
    const detalle = error.detalle;
    const status = detalle?.status;
    if (status === 401) return 'Tip: inicia sesion de nuevo.';
    if (status === 403) return 'Tip: revisa tus permisos o el rol.';
    if (status === 408) return 'Tip: revisa tu conexion e intenta de nuevo.';
    if (status === 429) return 'Tip: espera unos segundos e intenta de nuevo.';
    if (typeof status === 'number' && status >= 500) return 'Tip: intenta mas tarde.';

    const codigo = detalle?.codigo?.toUpperCase();
    if (codigo?.includes('TOKEN')) return 'Tip: inicia sesion de nuevo.';
    if (codigo?.includes('NO_AUTORIZ')) return 'Tip: revisa tus permisos o el rol.';
    if (codigo?.includes('DATOS_INVALID')) return 'Tip: revisa los campos e intenta de nuevo.';
  }
  return undefined;
}

export function mensajeUsuarioDeErrorConSugerencia(error: unknown, fallback: string): string {
  const base = mensajeUsuarioDeError(error, fallback);
  const tip = sugerenciaUsuarioDeError(error);
  if (!tip) return base;
  if (base.toLowerCase().includes(tip.toLowerCase())) return base;
  return `${base} ${tip}`;
}

export async function fetchConManejoErrores<T>(opts: {
  fetcher: (signal: AbortSignal) => Promise<unknown>;
  mensajeServicio: string;
  timeoutMs?: number;
  toastUnreachable: { id: string; title: string; message: string };
  toastTimeout?: { id: string; title: string; message: string };
  toastServerError: { id: string; title: string; message: (status: number | undefined) => string };
}): Promise<T> {
  let respuesta: unknown;

  try {
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? 12_000;
    const timer = timeoutMs > 0 ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      respuesta = await opts.fetcher(controller.signal);
    } finally {
      if (timer) globalThis.clearTimeout(timer);
    }
  } catch (error) {
    if (esAbortError(error)) {
      const toast = opts.toastTimeout ?? {
        id: `${opts.toastUnreachable.id}-timeout`,
        title: 'Tiempo de espera',
        message: 'La solicitud tardo demasiado. Intenta de nuevo.'
      };
      emitToast({ id: toast.id, level: 'error', title: toast.title, message: toast.message, durationMs: 5200 });
      throw new ErrorRemoto(opts.mensajeServicio, { mensaje: toast.message, detalles: 'AbortError', status: 408 });
    }

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
