export function normalizarDominio(dominio: string): string {
  const limpio = String(dominio || '').trim().toLowerCase();
  return limpio.startsWith('@') ? limpio.slice(1) : limpio;
}

export function obtenerDominioCorreo(correo: string): string | null {
  const valor = String(correo || '').trim().toLowerCase();
  const at = valor.lastIndexOf('@');
  if (at < 0) return null;
  const dominio = valor.slice(at + 1).trim();
  return dominio ? dominio : null;
}

export function esCorreoDeDominioPermitido(correo: string, dominiosPermitidos: string[]): boolean {
  const dominioCorreo = obtenerDominioCorreo(correo);
  if (!dominioCorreo) return false;

  const lista = Array.isArray(dominiosPermitidos) ? dominiosPermitidos.map(normalizarDominio).filter(Boolean) : [];
  if (lista.length === 0) return true;

  return lista.includes(dominioCorreo);
}
