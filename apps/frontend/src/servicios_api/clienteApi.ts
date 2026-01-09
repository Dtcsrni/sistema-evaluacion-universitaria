/**
 * Cliente API simple para frontend docente/alumno.
 */
const baseApi = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const claveToken = 'tokenDocente';

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
  async function obtener<T>(ruta: string): Promise<T> {
    const token = obtenerTokenDocente();
    const respuesta = await fetch(`${baseApi}${ruta}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!respuesta.ok) throw new Error('API no disponible');
    return respuesta.json() as Promise<T>;
  }

  async function enviar<T>(ruta: string, payload: unknown): Promise<T> {
    const token = obtenerTokenDocente();
    const respuesta = await fetch(`${baseApi}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload)
    });
    if (!respuesta.ok) throw new Error('API no disponible');
    return respuesta.json() as Promise<T>;
  }

  return { baseApi, obtener, enviar };
}
