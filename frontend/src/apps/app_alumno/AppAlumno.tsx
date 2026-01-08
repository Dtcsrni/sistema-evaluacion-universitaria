/**
 * App alumno: consulta de resultados en la nube.
 */
import { useState } from 'react';

export function AppAlumno() {
  const [codigoPeriodo, setCodigoPeriodo] = useState('');
  const [mensaje, setMensaje] = useState('Ingresa tu codigo de acceso');

  return (
    <section className="card">
      <p className="eyebrow">Portal Alumno</p>
      <h1>Resultados de examen</h1>
      <label className="campo">
        Codigo de acceso
        <input
          value={codigoPeriodo}
          onChange={(event) => setCodigoPeriodo(event.target.value)}
          placeholder="ABC123"
        />
      </label>
      <button type="button" className="boton" onClick={() => setMensaje('Autenticacion pendiente')}>
        Consultar
      </button>
      <p>{mensaje}</p>
    </section>
  );
}
