import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onToast, type ToastPayload } from './toastBus';

export type ToastLevel = 'info' | 'ok' | 'warn' | 'error';

export type ToastItem = {
  key: string;
  id?: string;
  level: ToastLevel;
  title: string;
  message: string;
  durationMs: number;
  actionLabel?: string;
};

export type ToastApi = {
  push: (payload: ToastPayload) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function iconFor(level: ToastLevel) {
  if (level === 'ok') return 'OK';
  if (level === 'warn') return '!';
  if (level === 'error') return 'X';
  return 'i';
}

function defaultTitle(level: ToastLevel) {
  if (level === 'error') return 'Error';
  if (level === 'warn') return 'Atencion';
  if (level === 'ok') return 'Listo';
  return 'Info';
}

function normalizeDuration(ms: number) {
  const value = Number.isFinite(ms) ? ms : 2800;
  if (value >= 5000) return 5200;
  if (value >= 3600) return 3800;
  if (value >= 2600) return 2800;
  return 2200;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());
  const remaining = useRef<Map<string, number>>(new Map());
  const startedAt = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
    const t = timers.current.get(key);
    if (t) window.clearTimeout(t);
    timers.current.delete(key);
    remaining.current.delete(key);
    startedAt.current.delete(key);
  }, []);

  const schedule = useCallback((key: string, durationMs: number) => {
    const ms = Math.max(1200, durationMs);
    remaining.current.set(key, ms);
    startedAt.current.set(key, Date.now());
    const handle = window.setTimeout(() => dismiss(key), ms);
    timers.current.set(key, handle);
  }, [dismiss]);

  const pause = useCallback((key: string) => {
    const handle = timers.current.get(key);
    const start = startedAt.current.get(key);
    const rem = remaining.current.get(key);
    if (!handle || !start || rem === undefined) return;
    window.clearTimeout(handle);
    timers.current.delete(key);
    const elapsed = Date.now() - start;
    remaining.current.set(key, Math.max(300, rem - elapsed));
  }, []);

  const resume = useCallback((key: string) => {
    if (timers.current.has(key)) return;
    const rem = remaining.current.get(key);
    if (rem === undefined) return;
    startedAt.current.set(key, Date.now());
    const handle = window.setTimeout(() => dismiss(key), Math.max(300, rem));
    timers.current.set(key, handle);
  }, [dismiss]);

  const push = useCallback((payload: ToastPayload) => {
    const level = (payload.level || 'info') as ToastLevel;
    const id = typeof payload.id === 'string' ? payload.id : undefined;
    const key = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const durationMs = normalizeDuration(Number(payload.durationMs || 2800));

    const title = typeof payload.title === 'string' ? payload.title : defaultTitle(level);
    const message = String(payload.message || '').trim();
    const actionLabel = payload.action?.label;

    setToasts((prev) => {
      const withoutDup = id ? prev.filter((t) => t.id !== id) : prev;
      const next = [{ key, id, level, title, message, durationMs, actionLabel }, ...withoutDup];
      return next.slice(0, 4);
    });

    schedule(key, durationMs);
  }, [schedule]);

  useEffect(() => {
    return onToast((payload) => push(payload));
  }, [push]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      push({
        id: 'unhandled-error',
        level: 'error',
        title: 'Error inesperado',
        message: event.message || 'Ocurrio un error no controlado.',
        durationMs: 5200
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason || 'Ocurrio un error no controlado.');
      push({
        id: 'unhandled-rejection',
        level: 'error',
        title: 'Error inesperado',
        message: msg,
        durationMs: 5200
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [push]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((handle) => window.clearTimeout(handle));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.key}
            className={`toast ${t.level} dur-${t.durationMs}`}
            onPointerEnter={() => pause(t.key)}
            onPointerLeave={() => resume(t.key)}
            role="status"
          >
            <div className="toast-icon" aria-hidden="true">{iconFor(t.level)}</div>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              <div className="toast-text">{t.message}</div>
            </div>
            <div className="toast-actions">
              {t.actionLabel ? (
                <button className="toast-btn action" type="button" onClick={() => dismiss(t.key)}>
                  {t.actionLabel}
                </button>
              ) : null}
              <button className="toast-btn close" type="button" aria-label="Cerrar" onClick={() => dismiss(t.key)}>
                ×
              </button>
            </div>
            <div className="toast-life" />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToasts debe usarse dentro de <ToastProvider>');
  return ctx;
}
