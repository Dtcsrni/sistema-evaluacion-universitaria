/**
 * App docente: panel basico y verificacion de API.
 */
import { useEffect, useState } from 'react';
import { crearClienteApi } from '../../servicios_api/clienteApi';

const clienteApi = crearClienteApi();

export function AppDocente() {
  const [estadoApi, setEstadoApi] = useState('Verificando API...');

  useEffect(() => {
    let activo = true;
    clienteApi
      .obtener<{ tiempoActivo: number }>('/salud')
      .then((payload) => {
        if (!activo) return;
        setEstadoApi(`API lista (tiempo activo ${Math.round(payload.tiempoActivo)}s)`);
      })
      .catch(() => {
        if (!activo) return;
        setEstadoApi('No se pudo contactar la API');
      });

    return () => {
      activo = false;
    };
  }, []);

  return (
    <section className="card">
      <p className="eyebrow">Plataforma Docente</p>
      <h1>Banco y Examenes</h1>
      <p>{estadoApi}</p>
      <div className="meta">
        <span>Banco de preguntas</span>
        <span>Generacion PDF</span>
        <span>Escaneo y calificacion</span>
      </div>
    </section>
  );
}
