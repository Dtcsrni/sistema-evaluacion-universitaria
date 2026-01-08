/**
 * Cliente API simple para frontend docente/alumno.
 */
const baseApi = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export function crearClienteApi() {
  async function obtener<T>(ruta: string): Promise<T> {
    const respuesta = await fetch(`${baseApi}${ruta}`);
    if (!respuesta.ok) throw new Error('API no disponible');
    return respuesta.json() as Promise<T>;
  }

  async function enviar<T>(ruta: string, payload: unknown): Promise<T> {
    const respuesta = await fetch(`${baseApi}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!respuesta.ok) throw new Error('API no disponible');
    return respuesta.json() as Promise<T>;
  }

  return { baseApi, obtener, enviar };
}
