/**
 * Cliente API del portal alumno (Cloud Run).
 */
const basePortal = import.meta.env.VITE_PORTAL_BASE_URL || 'http://localhost:8080/api/portal';
const claveTokenAlumno = 'tokenAlumno';

export function guardarTokenAlumno(token: string) {
  localStorage.setItem(claveTokenAlumno, token);
}

export function obtenerTokenAlumno() {
  return localStorage.getItem(claveTokenAlumno);
}

export function limpiarTokenAlumno() {
  localStorage.removeItem(claveTokenAlumno);
}

export function crearClientePortal() {
  async function enviar<T>(ruta: string, payload: unknown): Promise<T> {
    const respuesta = await fetch(`${basePortal}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!respuesta.ok) throw new Error('Portal no disponible');
    return respuesta.json() as Promise<T>;
  }

  async function obtener<T>(ruta: string): Promise<T> {
    const token = obtenerTokenAlumno();
    const respuesta = await fetch(`${basePortal}${ruta}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!respuesta.ok) throw new Error('Portal no disponible');
    return respuesta.json() as Promise<T>;
  }

  return { basePortal, enviar, obtener };
}
