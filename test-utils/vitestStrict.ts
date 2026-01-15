import { afterAll, afterEach, beforeAll, vi } from 'vitest';

type StrictHarnessOptions = {
  /**
   * Si es true, permite console.warn/error sin fallar tests.
   * Útil para depurar, pero por defecto se desaconseja.
   */
  allowConsole?: boolean;

  /**
   * Patrones (string/regex) permitidos para console.warn/error.
   * Si el mensaje coincide, no falla.
   */
  allowConsolePatterns?: Array<string | RegExp>;

  /**
   * Si es true, permite process warnings (DeprecationWarning, etc.).
   */
  allowNodeWarnings?: boolean;

  /**
   * Patrones permitidos para warnings de Node.
   */
  allowNodeWarningPatterns?: Array<string | RegExp>;
};

function matchesAny(text: string, patterns: Array<string | RegExp>): boolean {
  for (const p of patterns) {
    if (typeof p === 'string') {
      if (text.includes(p)) return true;
    } else {
      if (p.test(text)) return true;
    }
  }
  return false;
}

function stringifyArgs(args: unknown[]): string {
  try {
    return args
      .map((a) => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        if (typeof a === 'string') return a;
        return JSON.stringify(a);
      })
      .join(' ');
  } catch {
    return args.map((a) => String(a)).join(' ');
  }
}

/**
 * Endurece la suite de tests:
 * - Falla si hay `console.warn`/`console.error` (salvo allowlist) => detecta warnings graves.
 * - Captura `unhandledRejection`, `uncaughtException` y `process.warning`.
 *
 * Se puede relajar con:
 * - `ALLOW_TEST_CONSOLE=1`
 * - `ALLOW_NODE_WARNINGS=1`
 */
export function instalarTestHardening(opts: StrictHarnessOptions = {}) {
  const allowConsole = Boolean(opts.allowConsole) || process.env.ALLOW_TEST_CONSOLE === '1';
  const allowNodeWarnings = Boolean(opts.allowNodeWarnings) || process.env.ALLOW_NODE_WARNINGS === '1';
  const allowConsolePatterns = opts.allowConsolePatterns ?? [];
  const allowNodeWarningPatterns = opts.allowNodeWarningPatterns ?? [];

  const consoleWarnCalls: string[] = [];
  const consoleErrorCalls: string[] = [];
  const unhandled: string[] = [];
  const nodeWarnings: string[] = [];

  const onUnhandledRejection = (reason: unknown) => {
    const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    unhandled.push(`unhandledRejection: ${msg}`);
  };

  const onUncaughtException = (error: unknown) => {
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    unhandled.push(`uncaughtException: ${msg}`);
  };

  const onNodeWarning = (warning: Error) => {
    const text = `${warning.name}: ${warning.message}`;
    if (matchesAny(text, allowNodeWarningPatterns)) return;
    nodeWarnings.push(text);
  };

  const onWindowError = (event: unknown) => {
    // JSDOM: event suele ser ErrorEvent. Evitamos depender de tipos DOM aquí.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEvt = event as any;
    const msg = anyEvt?.error instanceof Error ? `${anyEvt.error.name}: ${anyEvt.error.message}` : String(anyEvt?.message ?? event);
    unhandled.push(`window.error: ${msg}`);
  };

  const onWindowUnhandledRejection = (event: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEvt = event as any;
    const reason = anyEvt?.reason;
    const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? event);
    unhandled.push(`window.unhandledrejection: ${msg}`);
  };

  let restoreWarn: (() => void) | undefined;
  let restoreError: (() => void) | undefined;

  beforeAll(() => {
    if (!allowConsole) {
      const originalWarn = console.warn.bind(console);
      const originalError = console.error.bind(console);

      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');

      warnSpy.mockImplementation((...args: unknown[]) => {
        const msg = stringifyArgs(args);
        if (!matchesAny(msg, allowConsolePatterns)) consoleWarnCalls.push(msg);
        // Mantener salida ayuda a diagnosticar flakes en CI.
        originalWarn(...args);
      });

      errorSpy.mockImplementation((...args: unknown[]) => {
        const msg = stringifyArgs(args);
        if (!matchesAny(msg, allowConsolePatterns)) consoleErrorCalls.push(msg);
        originalError(...args);
      });

      restoreWarn = () => warnSpy.mockRestore();
      restoreError = () => errorSpy.mockRestore();
    }

    process.on('unhandledRejection', onUnhandledRejection);
    process.on('uncaughtException', onUncaughtException);
    process.on('warning', onNodeWarning);

    // Browser-like (jsdom)
    if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
      window.addEventListener('error', onWindowError);
      window.addEventListener('unhandledrejection', onWindowUnhandledRejection);
    }
  });

  afterEach(() => {
    const issues: string[] = [];

    if (!allowConsole) {
      if (consoleWarnCalls.length > 0) issues.push(`console.warn: ${consoleWarnCalls.slice(0, 3).join(' | ')}`);
      if (consoleErrorCalls.length > 0) issues.push(`console.error: ${consoleErrorCalls.slice(0, 3).join(' | ')}`);
    }

    if (!allowNodeWarnings && nodeWarnings.length > 0) {
      issues.push(`process.warning: ${nodeWarnings.slice(0, 3).join(' | ')}`);
    }

    if (unhandled.length > 0) {
      issues.push(`unhandled: ${unhandled.slice(0, 3).join(' | ')}`);
    }

    // Limpia para el siguiente test.
    consoleWarnCalls.length = 0;
    consoleErrorCalls.length = 0;
    nodeWarnings.length = 0;
    unhandled.length = 0;

    if (issues.length > 0) {
      throw new Error(`Fallo por warnings/errores en entorno de test: ${issues.join(' ; ')}`);
    }
  });

  afterAll(() => {
    process.off('unhandledRejection', onUnhandledRejection);
    process.off('uncaughtException', onUncaughtException);
    process.off('warning', onNodeWarning);

    if (typeof window !== 'undefined' && window && typeof window.removeEventListener === 'function') {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onWindowUnhandledRejection);
    }

    restoreWarn?.();
    restoreError?.();
  });
}
