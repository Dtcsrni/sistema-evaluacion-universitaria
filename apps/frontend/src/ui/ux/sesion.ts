export function obtenerSessionId(clave: string) {
  const existente = sessionStorage.getItem(clave);
  if (existente) return existente;

  let nuevo = '';
  try {
    // Navegadores modernos.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cryptoAny = (globalThis as any).crypto;
    if (cryptoAny?.randomUUID) {
      nuevo = String(cryptoAny.randomUUID());
    }
  } catch {
    // Ignorar.
  }

  if (!nuevo) {
    nuevo = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  sessionStorage.setItem(clave, nuevo);
  return nuevo;
}
