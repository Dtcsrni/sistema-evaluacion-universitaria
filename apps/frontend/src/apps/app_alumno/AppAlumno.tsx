/**
 * App alumno: consulta de resultados en la nube.
 */
import { useState } from 'react';
import {
  crearClientePortal,
  ErrorRemoto,
  guardarTokenAlumno,
  limpiarTokenAlumno,
  obtenerTokenAlumno
} from '../../servicios_api/clientePortal';
import { Icono, IlustracionSinResultados, Spinner } from '../../ui/iconos';

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
  const [cargando, setCargando] = useState(false);

  function mensajeDeError(error: unknown, fallback: string) {
    if (error instanceof ErrorRemoto) {
      const detalle = error.detalle;
      if (detalle?.mensaje) return detalle.mensaje;
      if (detalle?.codigo) return `Error: ${detalle.codigo}`;
      return fallback;
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }

  async function ingresar() {
    try {
      setCargando(true);
      setMensaje('');
      const respuesta = await clientePortal.enviar<{ token: string }>('/ingresar', { codigo, matricula });
      guardarTokenAlumno(respuesta.token);
      setMensaje('Sesion iniciada');
      await cargarResultados();
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo ingresar'));
    } finally {
      setCargando(false);
    }
  }

  async function cargarResultados() {
    try {
      setCargando(true);
      const respuesta = await clientePortal.obtener<{ resultados: Resultado[] }>('/resultados');
      setResultados(respuesta.resultados);
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudieron cargar resultados'));
    } finally {
      setCargando(false);
    }
  }

  const token = obtenerTokenAlumno();
  const puedeIngresar = Boolean(codigo.trim() && matricula.trim());

  return (
    <section className="card anim-entrada">
      <div className="cabecera">
        <p className="eyebrow">
          <Icono nombre="alumno" /> Portal Alumno
        </p>
        {token && (
          <button
            className="boton secundario"
            type="button"
            onClick={() => {
              limpiarTokenAlumno();
              setResultados([]);
              setMensaje('Sesion cerrada');
            }}
          >
            <Icono nombre="salir" /> Salir
          </button>
        )}
      </div>
      <h1>Resultados de examen</h1>

      {mensaje && (
        <p
          className={
            mensaje.toLowerCase().includes('no se pudo') || mensaje.toLowerCase().includes('error')
              ? 'mensaje error'
              : 'mensaje ok'
          }
          role="status"
        >
          <Icono
            nombre={
              mensaje.toLowerCase().includes('no se pudo') || mensaje.toLowerCase().includes('error') ? 'alerta' : 'ok'
            }
          />
          {mensaje}
        </p>
      )}

      {cargando && (
        <p className="mensaje" role="status">
          <Spinner /> Cargando…
        </p>
      )}

      {!token && (
        <>
          <label className="campo">
            Codigo de acceso
            <input
              value={codigo}
              onChange={(event) => setCodigo(event.target.value)}
              placeholder="ABC123"
              autoComplete="one-time-code"
              inputMode="text"
            />
          </label>
          <label className="campo">
            Matricula
            <input
              value={matricula}
              onChange={(event) => setMatricula(event.target.value)}
              placeholder="2024-001"
              autoComplete="username"
              inputMode="text"
            />
          </label>
          <button type="button" className="boton" disabled={!puedeIngresar || cargando} onClick={ingresar}>
            <Icono nombre="entrar" /> Consultar
          </button>
        </>
      )}

      {token && resultados.length === 0 && !cargando && (
        <div className="resultado">
          <h3>
            <Icono nombre="info" /> Sin resultados
          </h3>
          <IlustracionSinResultados />
          <p>Si acabas de ingresar, intenta recargar.</p>
          <button className="boton secundario" type="button" onClick={cargarResultados}>
            <Icono nombre="recargar" /> Recargar
          </button>
        </div>
      )}

      {token && resultados.length > 0 && (
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
                    if (!token) return;
                    const respuesta = await fetch(`${basePortal}/examen/${resultado.folio}`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!respuesta.ok) return;
                    const blob = await respuesta.blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <Icono nombre="pdf" /> Ver PDF
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
