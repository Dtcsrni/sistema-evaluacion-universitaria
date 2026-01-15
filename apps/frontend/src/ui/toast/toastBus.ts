export type ToastLevel = 'info' | 'ok' | 'warn' | 'error';

export type ToastAction = {
  label: string;
};

export type ToastPayload = {
  id?: string;
  level?: ToastLevel;
  title?: string;
  message: string;
  durationMs?: number;
  action?: ToastAction;
};

const EVENT_NAME = 'app:toast';

export function emitToast(payload: ToastPayload) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
  } catch {
    // ignore
  }
}

export function onToast(handler: (payload: ToastPayload) => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent;
    handler((custom.detail || {}) as ToastPayload);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
