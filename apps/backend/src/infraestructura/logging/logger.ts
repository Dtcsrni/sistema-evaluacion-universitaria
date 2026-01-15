export type NivelLog = 'info' | 'warn' | 'error' | 'ok' | 'system';

type Meta = Record<string, unknown>;

const servicio = 'api-docente';

function serializarError(error: unknown) {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return { value: String(error) };
}

export function log(level: NivelLog, msg: string, meta: Meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    service: servicio,
    level,
    msg,
    ...meta
  };

  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logError(msg: string, error?: unknown, meta: Meta = {}) {
  log('error', msg, { ...meta, error: serializarError(error) });
}
