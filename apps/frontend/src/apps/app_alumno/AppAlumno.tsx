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
import { emitToast } from '../../ui/toast/toastBus';
import { Icono, IlustracionSinResultados, Spinner } from '../../ui/iconos';
import { Boton } from '../../ui/ux/componentes/Boton';
import { CampoTexto } from '../../ui/ux/componentes/CampoTexto';
import { InlineMensaje } from '../../ui/ux/componentes/InlineMensaje';
import { obtenerSessionId } from '../../ui/ux/sesion';

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

  const obtenerSesionId = () => obtenerSessionId('sesionAlumnoId');

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
      const inicio = Date.now();
      setCargando(true);
      setMensaje('');
      const respuesta = await clientePortal.enviar<{ token: string }>('/ingresar', { codigo, matricula });
      guardarTokenAlumno(respuesta.token);
      emitToast({ level: 'ok', title: 'Bienvenido', message: 'Sesion iniciada', durationMs: 2200 });
      void clientePortal.registrarEventosUso({
        eventos: [
          {
            sessionId: obtenerSesionId(),
            pantalla: 'alumno',
            accion: 'login',
            exito: true,
            duracionMs: Date.now() - inicio
          }
        ]
      });
      await cargarResultados();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo ingresar');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo ingresar', message: msg, durationMs: 5200 });
      void clientePortal.registrarEventosUso({
        eventos: [{ sessionId: obtenerSesionId(), pantalla: 'alumno', accion: 'login', exito: false }]
      });
    } finally {
      setCargando(false);
    }
  }

  async function cargarResultados() {
    try {
      const inicio = Date.now();
      setCargando(true);
      const respuesta = await clientePortal.obtener<{ resultados: Resultado[] }>('/resultados');
      setResultados(respuesta.resultados);
      void clientePortal.registrarEventosUso({
        eventos: [
          {
            sessionId: obtenerSesionId(),
            pantalla: 'alumno',
            accion: 'cargar_resultados',
            exito: true,
            duracionMs: Date.now() - inicio
          }
        ]
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudieron cargar resultados');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudieron cargar', message: msg, durationMs: 5200 });
      void clientePortal.registrarEventosUso({
        eventos: [{ sessionId: obtenerSesionId(), pantalla: 'alumno', accion: 'cargar_resultados', exito: false }]
      });
    } finally {
      setCargando(false);
    }
  }

  const token = obtenerTokenAlumno();
  const puedeIngresar = Boolean(codigo.trim() && matricula.trim());
  const codigoValido = !codigo.trim() || /^[a-zA-Z0-9]{4,12}$/.test(codigo.trim());
  const matriculaValida = !matricula.trim() || /^[A-Za-z0-9\-]{3,20}$/.test(matricula.trim());

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
              setMensaje('');
              emitToast({ level: 'info', title: 'Sesion', message: 'Sesion cerrada', durationMs: 2200 });
              void clientePortal.registrarEventosUso({
                eventos: [{ sessionId: obtenerSesionId(), pantalla: 'alumno', accion: 'logout', exito: true }]
              });
            }}
          >
            <Icono nombre="salir" /> Salir
          </button>
        )}
      </div>
      <h1>Resultados de examen</h1>

      {mensaje && (
        <InlineMensaje
          tipo={
            mensaje.toLowerCase().includes('no se pudo') || mensaje.toLowerCase().includes('error') ? 'error' : 'ok'
          }
        >
          {mensaje}
        </InlineMensaje>
      )}

      {cargando && (
        <p className="mensaje" role="status">
          <Spinner /> Cargando…
        </p>
      )}

      {!token && (
        <>
          <CampoTexto
            etiqueta="Codigo de acceso"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
            placeholder="ABC123"
            autoComplete="one-time-code"
            inputMode="text"
            error={
              !codigoValido && codigo.trim() ? 'Usa 4-12 caracteres alfanumericos.' : undefined
            }
          />
          <CampoTexto
            etiqueta="Matricula"
            value={matricula}
            onChange={(event) => setMatricula(event.target.value)}
            placeholder="2024-001"
            autoComplete="username"
            inputMode="text"
            error={
              !matriculaValida && matricula.trim() ? 'Usa 3-20 caracteres (letras/numeros/guion).' : undefined
            }
          />
          <Boton
            type="button"
            icono={<Icono nombre="entrar" />}
            cargando={cargando}
            disabled={!puedeIngresar || !codigoValido || !matriculaValida}
            onClick={ingresar}
          >
            Consultar
          </Boton>
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
                    const inicio = Date.now();
                    try {
                      const respuesta = await fetch(`${basePortal}/examen/${resultado.folio}`, {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      if (!respuesta.ok) {
                        emitToast({ level: 'error', title: 'PDF no disponible', message: `HTTP ${respuesta.status}`, durationMs: 5200 });
                        void clientePortal.registrarEventosUso({
                          eventos: [
                            {
                              sessionId: obtenerSesionId(),
                              pantalla: 'alumno',
                              accion: 'ver_pdf',
                              exito: false,
                              meta: { folio: resultado.folio, status: respuesta.status }
                            }
                          ]
                        });
                        return;
                      }
                      const blob = await respuesta.blob();
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank', 'noopener,noreferrer');
                      void clientePortal.registrarEventosUso({
                        eventos: [
                          {
                            sessionId: obtenerSesionId(),
                            pantalla: 'alumno',
                            accion: 'ver_pdf',
                            exito: true,
                            duracionMs: Date.now() - inicio,
                            meta: { folio: resultado.folio }
                          }
                        ]
                      });
                    } catch (error) {
                      emitToast({ level: 'error', title: 'Error al abrir PDF', message: String((error as any)?.message || error), durationMs: 5200 });
                      void clientePortal.registrarEventosUso({
                        eventos: [{ sessionId: obtenerSesionId(), pantalla: 'alumno', accion: 'ver_pdf', exito: false, meta: { folio: resultado.folio } }]
                      });
                    }
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
