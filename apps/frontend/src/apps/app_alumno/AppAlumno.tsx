/**
 * App alumno: consulta de resultados en la nube.
 */
import { useState } from 'react';
import {
  crearClientePortal,
  guardarTokenAlumno,
  limpiarTokenAlumno,
  obtenerTokenAlumno
} from '../../servicios_api/clientePortal';

const clientePortal = crearClientePortal();
const basePortal = import.meta.env.VITE_PORTAL_BASE_URL || 'http://localhost:8080/api/portal';

type Resultado = {
  folio: string;
  tipoExamen: string;
  calificacionExamenFinalTexto: string;
  calificacionParcialTexto?: string;
  calificacionGlobalTexto?: string;
};

export function AppAlumno() {
  const [codigo, setCodigo] = useState('');
  const [matricula, setMatricula] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);

  async function ingresar() {
    try {
      const respuesta = await clientePortal.enviar<{ token: string }>('/ingresar', { codigo, matricula });
      guardarTokenAlumno(respuesta.token);
      setMensaje('Sesion iniciada');
      await cargarResultados();
    } catch (error) {
      setMensaje('No se pudo ingresar');
    }
  }

  async function cargarResultados() {
    try {
      const respuesta = await clientePortal.obtener<{ resultados: Resultado[] }>('/resultados');
      setResultados(respuesta.resultados);
    } catch (error) {
      setMensaje('No se pudieron cargar resultados');
    }
  }

  return (
    <section className="card">
      <div className="cabecera">
        <p className="eyebrow">Portal Alumno</p>
        {obtenerTokenAlumno() && (
          <button
            className="boton secundario"
            type="button"
            onClick={() => {
              limpiarTokenAlumno();
              setResultados([]);
            }}
          >
            Salir
          </button>
        )}
      </div>
      <h1>Resultados de examen</h1>
      {!obtenerTokenAlumno() && (
        <>
          <label className="campo">
            Codigo de acceso
            <input value={codigo} onChange={(event) => setCodigo(event.target.value)} placeholder="ABC123" />
          </label>
          <label className="campo">
            Matricula
            <input value={matricula} onChange={(event) => setMatricula(event.target.value)} placeholder="2024-001" />
          </label>
          <button type="button" className="boton" onClick={ingresar}>
            Consultar
          </button>
        </>
      )}

      {mensaje && <p>{mensaje}</p>}

      {obtenerTokenAlumno() && resultados.length > 0 && (
        <div className="resultado">
          <h3>Resultados disponibles</h3>
          <ul className="lista">
            {resultados.map((resultado) => (
              <li key={resultado.folio}>
                Folio {resultado.folio} - {resultado.tipoExamen} - Examen {resultado.calificacionExamenFinalTexto}
                {resultado.calificacionParcialTexto && ` / Parcial ${resultado.calificacionParcialTexto}`}
                {resultado.calificacionGlobalTexto && ` / Global ${resultado.calificacionGlobalTexto}`}
                <button
                  className="boton secundario"
                  type="button"
                  onClick={async () => {
                    const token = obtenerTokenAlumno();
                    if (!token) return;
                    const respuesta = await fetch(`${basePortal}/examen/${resultado.folio}`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!respuesta.ok) return;
                    const blob = await respuesta.blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                  }}
                >
                  Ver PDF
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
