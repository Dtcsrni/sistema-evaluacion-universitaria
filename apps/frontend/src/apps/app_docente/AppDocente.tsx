/**
 * App docente: panel basico para banco, examenes, recepcion, escaneo y calificacion.
 */
import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import {
  crearClienteApi,
  guardarTokenDocente,
  limpiarTokenDocente,
  obtenerTokenDocente
} from '../../servicios_api/clienteApi';
import { accionToastSesionParaError, mensajeUsuarioDeErrorConSugerencia, onSesionInvalidada } from '../../servicios_api/clienteComun';
import { emitToast } from '../../ui/toast/toastBus';
import { Icono, Spinner } from '../../ui/iconos';
import { Boton } from '../../ui/ux/componentes/Boton';
import { InlineMensaje } from '../../ui/ux/componentes/InlineMensaje';
import { obtenerSessionId } from '../../ui/ux/sesion';

const clienteApi = crearClienteApi();

type Docente = { id: string; nombreCompleto: string; correo: string; tieneContrasena?: boolean; tieneGoogle?: boolean };

type Alumno = { _id: string; matricula: string; nombreCompleto: string; nombres?: string; apellidos?: string; grupo?: string };

type Periodo = { _id: string; nombre: string };

type Plantilla = { _id: string; titulo: string; tipo: 'parcial' | 'global'; totalReactivos: number };

type Pregunta = { _id: string; versiones: Array<{ enunciado: string }> };

type ResultadoOmr = {
  respuestasDetectadas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>;
  advertencias: string[];
};

type EstadoApi =
  | { estado: 'cargando'; texto: string }
  | { estado: 'ok'; texto: string; tiempoActivo: number }
  | { estado: 'error'; texto: string };

function obtenerSesionDocenteId(): string {
  return obtenerSessionId('sesionDocenteId');
}

function registrarAccionDocente(accion: string, exito: boolean, duracionMs?: number) {
  void clienteApi.registrarEventosUso({
    eventos: [
      {
        sessionId: obtenerSesionDocenteId() ?? undefined,
        pantalla: 'docente',
        accion,
        exito,
        duracionMs
      }
    ]
  });
}

function esMensajeError(texto: string) {
  const lower = texto.toLowerCase();
  return lower.includes('no se pudo') || lower.includes('falta') || lower.includes('inval') || lower.includes('error');
}

function mensajeDeError(error: unknown, fallback: string) {
  return mensajeUsuarioDeErrorConSugerencia(error, fallback);
}

function obtenerDominiosCorreoPermitidosFrontend(): string[] {
  return String(import.meta.env.VITE_DOMINIOS_CORREO_PERMITIDOS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

function obtenerDominioCorreo(correo: string): string | null {
  const valor = String(correo || '').trim().toLowerCase();
  const at = valor.lastIndexOf('@');
  if (at < 0) return null;
  const dominio = valor.slice(at + 1).trim();
  return dominio ? dominio : null;
}

function esCorreoDeDominioPermitidoFrontend(correo: string, dominiosPermitidos: string[]): boolean {
  const lista = Array.isArray(dominiosPermitidos) ? dominiosPermitidos : [];
  if (lista.length === 0) return true;
  const dominio = obtenerDominioCorreo(correo);
  if (!dominio) return false;
  return lista.includes(dominio);
}

function textoDominiosPermitidos(dominios: string[]): string {
  return dominios.map((d) => `@${d}`).join(', ');
}

export function AppDocente() {
  const [estadoApi, setEstadoApi] = useState<EstadoApi>({ estado: 'cargando', texto: 'Verificando API...' });
  const [docente, setDocente] = useState<Docente | null>(null);
  const [vista, setVista] = useState('inicio');
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [resultadoOmr, setResultadoOmr] = useState<ResultadoOmr | null>(null);
  const [respuestasEditadas, setRespuestasEditadas] = useState<
    Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>
  >([]);
  const [examenIdOmr, setExamenIdOmr] = useState<string | null>(null);
  const [examenAlumnoId, setExamenAlumnoId] = useState<string | null>(null);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  function cerrarSesion() {
    // Best-effort: limpia refresh token server-side.
    void clienteApi.enviar('/autenticacion/salir', {});
    limpiarTokenDocente();
    setDocente(null);
    emitToast({ level: 'info', title: 'Sesion', message: 'Sesion cerrada', durationMs: 2200 });
    registrarAccionDocente('logout', true);
  }

  useEffect(() => {
    return onSesionInvalidada((tipo) => {
      if (tipo !== 'docente') return;
      cerrarSesion();
    });
  }, []);

  const itemsVista = useMemo(
    () =>
      [
        { id: 'inicio', label: 'Inicio', icono: 'inicio' as const },
        { id: 'periodos', label: 'Periodos', icono: 'periodos' as const },
        { id: 'alumnos', label: 'Alumnos', icono: 'alumnos' as const },
        { id: 'banco', label: 'Banco', icono: 'banco' as const },
        { id: 'plantillas', label: 'Plantillas', icono: 'plantillas' as const },
        { id: 'recepcion', label: 'Recepcion', icono: 'recepcion' as const },
        { id: 'escaneo', label: 'Escaneo', icono: 'escaneo' as const },
        { id: 'calificar', label: 'Calificar', icono: 'calificar' as const },
        { id: 'publicar', label: 'Publicar', icono: 'publicar' as const },
        { id: 'cuenta', label: 'Cuenta', icono: 'info' as const }
      ],
    []
  );

  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    clienteApi
      .obtener<{ tiempoActivo: number }>('/salud')
      .then((payload) =>
        setEstadoApi({
          estado: 'ok',
          tiempoActivo: payload.tiempoActivo,
          texto: `API lista (tiempo activo ${Math.round(payload.tiempoActivo)}s)`
        })
      )
      .catch(() => setEstadoApi({ estado: 'error', texto: 'No se pudo contactar la API' }));
  }, []);

  useEffect(() => {
    let activo = true;

    (async () => {
      // Si no hay token local, intenta restaurar sesion via refresh token (cookie httpOnly).
      if (!obtenerTokenDocente()) {
        await clienteApi.intentarRefrescarToken();
      }
      if (!activo) return;
      if (!obtenerTokenDocente()) return;

      clienteApi
        .obtener<{ docente: Docente }>('/autenticacion/perfil')
        .then((payload) => {
          if (!activo) return;
          setDocente(payload.docente);
        })
        .catch(() => {
          if (!activo) return;
          setDocente(null);
        });
    })();

    return () => {
      activo = false;
    };
  }, []);

  // Sesion de UI (no sensible) para analiticas best-effort.
  useEffect(() => {
    if (!obtenerTokenDocente()) return;
    obtenerSessionId('sesionDocenteId');
  }, []);

  useEffect(() => {
    if (!docente) return;
    let activo = true;
    Promise.resolve().then(() => {
      if (!activo) return;
      setCargandoDatos(true);
    });
    Promise.all([
      clienteApi.obtener<{ alumnos: Alumno[] }>('/alumnos'),
      clienteApi.obtener<{ periodos: Periodo[] }>('/periodos'),
      clienteApi.obtener<{ plantillas: Plantilla[] }>('/examenes/plantillas'),
      clienteApi.obtener<{ preguntas: Pregunta[] }>('/banco-preguntas')
    ])
      .then(([al, pe, pl, pr]) => {
        setAlumnos(al.alumnos);
        setPeriodos(pe.periodos);
        setPlantillas(pl.plantillas);
        setPreguntas(pr.preguntas);
      })
      .finally(() => {
        Promise.resolve().then(() => {
          if (!activo) return;
          setCargandoDatos(false);
        });
      });

    return () => {
      activo = false;
    };
  }, [docente]);

  const contenido = docente ? (
    <div className="panel">
      <nav
        className="tabs"
        aria-label="Secciones del portal docente"
      >
        {itemsVista.map((item, idx) => (
          <button
            key={item.id}
            ref={(el) => {
              tabsRef.current[idx] = el;
            }}
            type="button"
            className={vista === item.id ? 'tab activa' : 'tab'}
            aria-current={vista === item.id ? 'page' : undefined}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
                return;
              }
              event.preventDefault();

              const ultimo = itemsVista.length - 1;
              let idxNuevo = idx;

              if (event.key === 'ArrowLeft') idxNuevo = Math.max(0, idx - 1);
              if (event.key === 'ArrowRight') idxNuevo = Math.min(ultimo, idx + 1);
              if (event.key === 'Home') idxNuevo = 0;
              if (event.key === 'End') idxNuevo = ultimo;

              const nuevoId = itemsVista[idxNuevo]?.id;
              if (!nuevoId) return;
              setVista(nuevoId);
              requestAnimationFrame(() => tabsRef.current[idxNuevo]?.focus());
            }}
            onClick={() => setVista(item.id)}
          >
            <Icono nombre={item.icono} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="panel" aria-live="polite">
        <div className={estadoApi.estado === 'ok' ? 'badge ok' : estadoApi.estado === 'error' ? 'badge error' : 'badge'}>
          <span className="dot" aria-hidden="true" />
          <span>{estadoApi.texto}</span>
        </div>
        {cargandoDatos && (
          <InlineMensaje tipo="info" leading={<Spinner />}>
            Cargando datos…
          </InlineMensaje>
        )}
      </div>

      {vista === 'inicio' && (
        <div className="panel">
          <p className="eyebrow">
            <Icono nombre="docente" /> Panel Docente
          </p>
          <h1>Banco y Examenes</h1>
          <p>Atajos</p>
          <div className="meta" aria-label="Atajos rapidos">
            <button type="button" className="chip" onClick={() => setVista('banco')}>
              <Icono nombre="banco" /> Banco de preguntas
            </button>
            <button type="button" className="chip" onClick={() => setVista('plantillas')}>
              <Icono nombre="plantillas" /> Generacion PDF
            </button>
            <button type="button" className="chip" onClick={() => setVista('escaneo')}>
              <Icono nombre="escaneo" /> Escaneo y calificacion
            </button>
          </div>
        </div>
      )}

      {vista === 'banco' && (
        <SeccionBanco preguntas={preguntas} onRefrescar={() => clienteApi.obtener<{ preguntas: Pregunta[] }>('/banco-preguntas').then((p) => setPreguntas(p.preguntas))} />
      )}

      {vista === 'periodos' && (
        <SeccionPeriodos
          periodos={periodos}
          onRefrescar={() => clienteApi.obtener<{ periodos: Periodo[] }>('/periodos').then((p) => setPeriodos(p.periodos))}
        />
      )}

      {vista === 'alumnos' && (
        <SeccionAlumnos
          alumnos={alumnos}
          periodos={periodos}
          onRefrescar={() => clienteApi.obtener<{ alumnos: Alumno[] }>('/alumnos').then((p) => setAlumnos(p.alumnos))}
        />
      )}

      {vista === 'plantillas' && (
        <SeccionPlantillas
          plantillas={plantillas}
          periodos={periodos}
          preguntas={preguntas}
          alumnos={alumnos}
          onRefrescar={() => clienteApi.obtener<{ plantillas: Plantilla[] }>('/examenes/plantillas').then((p) => setPlantillas(p.plantillas))}
        />
      )}

      {vista === 'recepcion' && (
        <SeccionRecepcion alumnos={alumnos} onVincular={(folio, alumnoId) => clienteApi.enviar('/entregas/vincular-folio', { folio, alumnoId })} />
      )}

      {vista === 'escaneo' && (
        <SeccionEscaneo
          onAnalizar={async (folio, numeroPagina, imagenBase64) => {
            const respuesta = await clienteApi.enviar<{ resultado: ResultadoOmr; examenId: string }>('/omr/analizar', {
              folio,
              numeroPagina,
              imagenBase64
            });
            setResultadoOmr(respuesta.resultado);
            setRespuestasEditadas(respuesta.resultado.respuestasDetectadas);
            setExamenIdOmr(respuesta.examenId);
            const detalle = await clienteApi.obtener<{ examen?: { alumnoId?: string | null } }>(`/examenes/generados/folio/${folio}`);
            setExamenAlumnoId(detalle.examen?.alumnoId ?? null);
          }}
          resultado={resultadoOmr}
          respuestas={respuestasEditadas}
          onActualizar={(nuevas) => setRespuestasEditadas(nuevas)}
        />
      )}

      {vista === 'calificar' && (
        <SeccionCalificar
          examenId={examenIdOmr}
          alumnoId={examenAlumnoId}
          respuestasDetectadas={respuestasEditadas}
          onCalificar={(payload) => clienteApi.enviar('/calificaciones/calificar', payload)}
        />
      )}

      {vista === 'publicar' && (
        <SeccionPublicar
          periodos={periodos}
          onPublicar={(periodoId) => clienteApi.enviar('/sincronizaciones/publicar', { periodoId })}
          onCodigo={(periodoId) =>
            clienteApi.enviar<{ codigo?: string; expiraEn?: string }>('/sincronizaciones/codigo-acceso', { periodoId })
          }
        />
      )}

      {vista === 'cuenta' && <SeccionCuenta docente={docente} />}
    </div>
  ) : (
    <SeccionAutenticacion
      onIngresar={(token) => {
        guardarTokenDocente(token);
        clienteApi
          .obtener<{ docente: Docente }>('/autenticacion/perfil')
          .then((payload) => setDocente(payload.docente));
      }}
    />
  );

  return (
    <section className="card anim-entrada">
      <div className="cabecera">
        <div>
          <p className="eyebrow">
            <Icono nombre="docente" /> Plataforma Docente
          </p>
          <h1>Banco y Examenes</h1>
        </div>
        {docente && (
          <Boton
            variante="secundario"
            type="button"
            icono={<Icono nombre="salir" />}
            onClick={() => cerrarSesion()}
          >
            Salir
          </Boton>
        )}
      </div>
      {docente && (
        <InlineMensaje tipo="ok">
          Sesion: {docente.nombreCompleto} ({docente.correo})
        </InlineMensaje>
      )}
      {contenido}
    </section>
  );
}

function SeccionAutenticacion({ onIngresar }: { onIngresar: (token: string) => void }) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [modo, setModo] = useState<'ingresar' | 'registrar'>('ingresar');
  const [enviando, setEnviando] = useState(false);
  const [credentialRegistroGoogle, setCredentialRegistroGoogle] = useState<string | null>(null);
  const [crearContrasenaAhora, setCrearContrasenaAhora] = useState(true);
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [credentialRecuperarGoogle, setCredentialRecuperarGoogle] = useState<string | null>(null);
  const [contrasenaRecuperar, setContrasenaRecuperar] = useState('');
  const [mostrarFormularioIngresar, setMostrarFormularioIngresar] = useState(false);
  const [mostrarFormularioRegistrar, setMostrarFormularioRegistrar] = useState(false);

  function hayGoogleConfigurado() {
    return Boolean(String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim());
  }

  const googleDisponible = hayGoogleConfigurado();
  const esDev = import.meta.env.DEV;
  const mostrarFormulario = modo === 'ingresar'
    ? (!googleDisponible || mostrarFormularioIngresar)
    : (!googleDisponible || mostrarFormularioRegistrar || Boolean(credentialRegistroGoogle));

  const dominiosPermitidos = obtenerDominiosCorreoPermitidosFrontend();
  const politicaDominiosTexto = dominiosPermitidos.length > 0 ? textoDominiosPermitidos(dominiosPermitidos) : '';

  function nombreCompletoParaEnviar() {
    return [nombres.trim(), apellidos.trim()].filter(Boolean).join(' ').trim();
  }

  function correoPermitido(correoAValidar: string) {
    return esCorreoDeDominioPermitidoFrontend(correoAValidar, dominiosPermitidos);
  }

  function decodificarPayloadJwt(jwt: string): Record<string, unknown> | null {
    const partes = String(jwt || '').split('.');
    if (partes.length < 2) return null;
    try {
      const base64 = partes[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(partes[1].length / 4) * 4, '=');
      const json = atob(base64);
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async function ingresar() {
    try {
      const inicio = Date.now();
      if (dominiosPermitidos.length > 0 && !correoPermitido(correo)) {
        const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
        registrarAccionDocente('login', false);
        return;
      }
      setEnviando(true);
      setMensaje('');
      const respuesta = await clienteApi.enviar<{ token: string }>('/autenticacion/ingresar', { correo, contrasena });
      onIngresar(respuesta.token);
      emitToast({ level: 'ok', title: 'Sesion', message: 'Bienvenido/a', durationMs: 2200 });
      registrarAccionDocente('login', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo ingresar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo ingresar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('login', false);
    } finally {
      setEnviando(false);
    }
  }

  async function ingresarConGoogle(credential: string) {
    try {
      const inicio = Date.now();
      const payload = decodificarPayloadJwt(credential);
      const email = typeof payload?.email === 'string' ? payload.email : undefined;
      if (email && dominiosPermitidos.length > 0 && !correoPermitido(email)) {
        const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
        registrarAccionDocente('login_google', false);
        return;
      }
      setEnviando(true);
      setMensaje('');
      const respuesta = await clienteApi.enviar<{ token: string }>('/autenticacion/google', { credential });
      onIngresar(respuesta.token);
      emitToast({ level: 'ok', title: 'Sesion', message: 'Bienvenido/a', durationMs: 2200 });
      registrarAccionDocente('login_google', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo ingresar con Google');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo ingresar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('login_google', false);
    } finally {
      setEnviando(false);
    }
  }

  async function recuperarConGoogle() {
    try {
      const inicio = Date.now();
      setEnviando(true);
      setMensaje('');
      if (!credentialRecuperarGoogle) {
        setMensaje('Reautentica con Google para recuperar.');
        return;
      }

      const payload = decodificarPayloadJwt(credentialRecuperarGoogle);
      const email = typeof payload?.email === 'string' ? payload.email : undefined;
      if (email && dominiosPermitidos.length > 0 && !correoPermitido(email)) {
        const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
        registrarAccionDocente('recuperar_contrasena_google', false);
        return;
      }

      const respuesta = await clienteApi.enviar<{ token: string }>('/autenticacion/recuperar-contrasena-google', {
        credential: credentialRecuperarGoogle,
        contrasenaNueva: contrasenaRecuperar
      });
      onIngresar(respuesta.token);
      emitToast({ level: 'ok', title: 'Cuenta', message: 'Contrasena actualizada', durationMs: 2600 });
      registrarAccionDocente('recuperar_contrasena_google', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo recuperar la contrasena');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo recuperar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('recuperar_contrasena_google', false);
    } finally {
      setEnviando(false);
    }
  }

  async function registrar() {
    try {
      const inicio = Date.now();
      if (dominiosPermitidos.length > 0 && !correoPermitido(correo)) {
        const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
        registrarAccionDocente(credentialRegistroGoogle ? 'registrar_google' : 'registrar', false);
        return;
      }

      if (!nombres.trim() || !apellidos.trim()) {
        const msg = 'Completa tus nombres y apellidos.';
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Datos incompletos', message: msg, durationMs: 4200 });
        registrarAccionDocente(credentialRegistroGoogle ? 'registrar_google' : 'registrar', false);
        return;
      }
      setEnviando(true);
      setMensaje('');
      const nombre = nombreCompletoParaEnviar();
      const correoFinal = correo.trim();

      const debeEnviarContrasena = Boolean(
        contrasena.trim() && (!credentialRegistroGoogle || crearContrasenaAhora)
      );

      const respuesta = credentialRegistroGoogle
        ? await clienteApi.enviar<{ token: string }>('/autenticacion/registrar-google', {
            credential: credentialRegistroGoogle,
            nombreCompleto: nombre,
            ...(debeEnviarContrasena ? { contrasena } : {})
          })
        : await clienteApi.enviar<{ token: string }>('/autenticacion/registrar', {
            nombreCompleto: nombre,
            correo: correoFinal,
            contrasena
          });
      onIngresar(respuesta.token);
      emitToast({ level: 'ok', title: 'Cuenta creada', message: 'Sesion iniciada', durationMs: 2800 });
      registrarAccionDocente(credentialRegistroGoogle ? 'registrar_google' : 'registrar', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo registrar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo registrar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('registrar', false);
    } finally {
      setEnviando(false);
    }
  }

  const puedeIngresar = Boolean(correo.trim() && contrasena.trim());
  const puedeRegistrar = credentialRegistroGoogle
    ? Boolean(nombres.trim() && apellidos.trim() && correo.trim() && (crearContrasenaAhora ? contrasena.trim() : true))
    : Boolean(nombres.trim() && apellidos.trim() && correo.trim() && contrasena.trim());

  return (
    <div className="auth-grid">
      <div className="auth-hero">
        <p className="eyebrow">Acceso</p>
        <h2>
          <Icono nombre="docente" /> Acceso docente
        </h2>
        <p className="auth-subtitulo">Entra al banco, examenes y calificacion.</p>
        <ul className="auth-beneficios" aria-label="Beneficios">
          <li>
            <Icono nombre="ok" /> Sesion persistente segura (refresh token httpOnly).
          </li>
          {googleDisponible ? (
            <li>
              <Icono nombre="inicio" /> Acceso rapido con Google (correo institucional).
            </li>
          ) : (
            <li>
              <Icono nombre="inicio" /> Acceso con correo y contrasena.
            </li>
          )}
          <li>
            <Icono nombre="banco" /> Todo en un solo panel.
          </li>
        </ul>
        <div className="auth-ilustracion" aria-hidden="true">
          <div className="auth-blob" />
          <div className="auth-blob auth-blob--2" />
        </div>
      </div>

      <div className="auth-form">
        {!googleDisponible && esDev && (
          <InlineMensaje tipo="info">
            Inicio de sesion con Google deshabilitado en este entorno. Para habilitarlo en desarrollo, define
            {' '}VITE_GOOGLE_CLIENT_ID en el .env del root y reinicia Vite.
          </InlineMensaje>
        )}
        {googleDisponible && modo === 'ingresar' && (
          <div className="auth-google auth-google--mb">
            <GoogleLogin
              onSuccess={(cred) => {
                const token = cred.credential;
                if (!token) {
                  setMensaje('No se recibio credencial de Google.');
                  return;
                }
                void ingresarConGoogle(token);
              }}
              onError={() => setMensaje('No se pudo iniciar sesion con Google.')}
              useOneTap
            />
            <p className="nota nota--mt">
              Acceso principal: Google (correo institucional).
            </p>
            {dominiosPermitidos.length > 0 && (
              <p className="nota nota--mt">Solo se permiten: {politicaDominiosTexto}</p>
            )}

            <div className="acciones acciones--mt">
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setMostrarFormularioIngresar((v) => !v);
                  setMensaje('');
                }}
              >
                {mostrarFormularioIngresar ? 'Ocultar formulario' : 'Ingresar con correo y contrasena'}
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setMostrarRecuperar((v) => !v);
                  setMensaje('');
                }}
              >
                {mostrarRecuperar ? 'Cerrar recuperacion' : 'Recuperar contrasena con Google'}
              </button>
            </div>

            {mostrarRecuperar && (
              <div className="panel mt-10">
                <p className="nota">Si tu cuenta tiene Google vinculado, puedes establecer una nueva contrasena.</p>
                {dominiosPermitidos.length > 0 && (
                  <p className="nota nota--mt">Solo se permiten: {politicaDominiosTexto}</p>
                )}
                <GoogleLogin
                  onSuccess={(cred) => {
                    const token = cred.credential;
                    if (!token) {
                      setMensaje('No se recibio credencial de Google.');
                      return;
                    }
                    setCredentialRecuperarGoogle(token);
                    setMensaje('Google listo. Define tu nueva contrasena.');
                  }}
                  onError={() => setMensaje('No se pudo reautenticar con Google.')}
                />
                <label className="campo mt-10">
                  Nueva contrasena
                  <input
                    type="password"
                    value={contrasenaRecuperar}
                    onChange={(event) => setContrasenaRecuperar(event.target.value)}
                    autoComplete="new-password"
                  />
                  <span className="ayuda">Minimo 8 caracteres.</span>
                </label>
                <div className="acciones">
                  <Boton
                    type="button"
                    icono={<Icono nombre="ok" />}
                    cargando={enviando}
                    disabled={!credentialRecuperarGoogle || contrasenaRecuperar.trim().length < 8}
                    onClick={recuperarConGoogle}
                  >
                    {enviando ? 'Actualizando…' : 'Actualizar contrasena'}
                  </Boton>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="acciones">
          <button
            className={modo === 'ingresar' ? 'boton' : 'boton secundario'}
            type="button"
            onClick={() => {
              setModo('ingresar');
              setCredentialRegistroGoogle(null);
              setCrearContrasenaAhora(true);
              setMostrarFormularioIngresar(false);
              setNombres('');
              setApellidos('');
              setMensaje('');
            }}
          >
            Ingresar
          </button>
          <button
            className={modo === 'registrar' ? 'boton' : 'boton secundario'}
            type="button"
            onClick={() => {
              setModo('registrar');
              setCrearContrasenaAhora(true);
              setMostrarFormularioRegistrar(false);
              setNombres('');
              setApellidos('');
              setMensaje('');
            }}
          >
            Registrar
          </button>
        </div>

        {googleDisponible && modo === 'registrar' && !mostrarFormularioRegistrar && (
          <div className="auth-google auth-google--mb">
            <GoogleLogin
              onSuccess={(cred) => {
                const token = cred.credential;
                if (!token) {
                  setMensaje('No se recibio credencial de Google.');
                  return;
                }

                const payload = decodificarPayloadJwt(token);
                const email = typeof payload?.email === 'string' ? payload.email : undefined;
                const name = typeof payload?.name === 'string' ? payload.name : undefined;
                const givenName = typeof payload?.given_name === 'string' ? payload.given_name : undefined;
                const familyName = typeof payload?.family_name === 'string' ? payload.family_name : undefined;

                if (email && dominiosPermitidos.length > 0 && !correoPermitido(email)) {
                  const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
                  setMensaje(msg);
                  emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
                  return;
                }

                if (email) setCorreo(email);

                const nombresActual = nombres.trim();
                const apellidosActual = apellidos.trim();

                if (givenName && !nombresActual) setNombres(givenName);
                if (familyName && !apellidosActual) setApellidos(familyName);
                if (name && (!nombresActual || !apellidosActual)) {
                  const partes = name
                    .split(' ')
                    .map((p) => p.trim())
                    .filter(Boolean);
                  if (partes.length >= 2) {
                    if (!nombresActual) setNombres(partes.slice(0, -1).join(' '));
                    if (!apellidosActual) setApellidos(partes.slice(-1).join(' '));
                  } else if (partes.length === 1 && !nombresActual) {
                    setNombres(partes[0]);
                  }
                }
                setCredentialRegistroGoogle(token);
                setCrearContrasenaAhora(false);
                setContrasena('');
                setMensaje('Correo tomado de Google. Completa tus datos para crear la cuenta.');
              }}
              onError={() => setMensaje('No se pudo obtener datos de Google.')}
            />
            <div className="acciones acciones--mt">
              <button
                className={credentialRegistroGoogle ? 'chip' : 'chip'}
                type="button"
                onClick={() => {
                  setCredentialRegistroGoogle(null);
                  setCorreo('');
                  setCrearContrasenaAhora(true);
                  setMensaje('');
                }}
                disabled={!credentialRegistroGoogle}
              >
                Cambiar correo
              </button>
              <button
                className="chip"
                type="button"
                onClick={() => {
                  setMostrarFormularioRegistrar(true);
                  setCredentialRegistroGoogle(null);
                  setCorreo('');
                  setNombres('');
                  setApellidos('');
                  setContrasena('');
                  setCrearContrasenaAhora(true);
                  setMensaje('');
                }}
              >
                Registrar con correo y contrasena
              </button>
            </div>
            <p className="nota nota--mt">
              Registro principal: Google (correo institucional).
            </p>
            {dominiosPermitidos.length > 0 && (
              <p className="nota nota--mt">Solo se permiten: {politicaDominiosTexto}</p>
            )}
          </div>
        )}

        {googleDisponible && modo === 'registrar' && mostrarFormularioRegistrar && (
          <div className="panel">
            <p className="nota">
              Registro por formulario (fallback). Recomendado: usa Google para correo institucional.
            </p>
            <div className="acciones acciones--mt">
              <button
                className="chip"
                type="button"
                onClick={() => {
                  setMostrarFormularioRegistrar(false);
                  setMensaje('');
                }}
              >
                Volver a Google
              </button>
            </div>
          </div>
        )}

        {modo === 'registrar' && mostrarFormulario && (
          <>
            <label className="campo">
              Nombres
              <input
                value={nombres}
                onChange={(event) => setNombres(event.target.value)}
                autoComplete="given-name"
                placeholder="Ej. Juan Carlos"
              />
            </label>
            <label className="campo">
              Apellidos
              <input
                value={apellidos}
                onChange={(event) => setApellidos(event.target.value)}
                autoComplete="family-name"
                placeholder="Ej. Perez Lopez"
              />
            </label>
          </>
        )}

        {mostrarFormulario && (
          <label className="campo">
            Correo
            <input
              type="email"
              value={correo}
              onChange={(event) => setCorreo(event.target.value)}
              autoComplete="email"
              readOnly={modo === 'registrar' && Boolean(credentialRegistroGoogle)}
            />
            {modo === 'registrar' && credentialRegistroGoogle && <span className="ayuda">Correo bloqueado por Google.</span>}
          </label>
        )}

        {modo === 'registrar' && credentialRegistroGoogle && mostrarFormulario && (
          <label className="campo">
            Crear contrasena ahora (opcional)
            <span className="ayuda">Si no, podras definirla luego desde Cuenta.</span>
            <input
              type="checkbox"
              checked={crearContrasenaAhora}
              onChange={(event) => {
                setCrearContrasenaAhora(event.target.checked);
                if (!event.target.checked) setContrasena('');
              }}
            />
          </label>
        )}

        {mostrarFormulario && (modo === 'ingresar' || !credentialRegistroGoogle || crearContrasenaAhora) && (
          <label className="campo">
            Contrasena
            {modo === 'ingresar' ? (
              <input
                type="password"
                value={contrasena}
                onChange={(event) => setContrasena(event.target.value)}
                autoComplete="current-password"
              />
            ) : (
              <input
                type="password"
                value={contrasena}
                onChange={(event) => setContrasena(event.target.value)}
                autoComplete="new-password"
              />
            )}
            {modo === 'registrar' && credentialRegistroGoogle && (
              <span className="ayuda">Minimo 8 caracteres.</span>
            )}
          </label>
        )}

        {mostrarFormulario && (
          <div className="acciones">
            <Boton
              type="button"
              icono={<Icono nombre={modo === 'ingresar' ? 'entrar' : 'nuevo'} />}
              cargando={enviando}
              disabled={modo === 'ingresar' ? !puedeIngresar : !puedeRegistrar}
              onClick={modo === 'ingresar' ? ingresar : registrar}
            >
              {modo === 'ingresar' ? (enviando ? 'Ingresando…' : 'Ingresar') : enviando ? 'Creando…' : 'Crear cuenta'}
            </Boton>
          </div>
        )}

        {mensaje && <InlineMensaje tipo={esMensajeError(mensaje) ? 'error' : 'ok'}>{mensaje}</InlineMensaje>}
      </div>
    </div>
  );
}

function SeccionCuenta({ docente }: { docente: Docente }) {
  const [contrasenaNueva, setContrasenaNueva] = useState('');
  const [contrasenaNueva2, setContrasenaNueva2] = useState('');
  const [contrasenaActual, setContrasenaActual] = useState('');
  const [credentialReauth, setCredentialReauth] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const coincide = contrasenaNueva && contrasenaNueva === contrasenaNueva2;
  const requierePwdActual = Boolean(docente.tieneContrasena);
  const requiereGoogle = Boolean(docente.tieneGoogle && !docente.tieneContrasena);

  const reauthOk = requierePwdActual ? Boolean(contrasenaActual.trim()) : requiereGoogle ? Boolean(credentialReauth) : Boolean(contrasenaActual.trim() || credentialReauth);
  const puedeGuardar = Boolean(contrasenaNueva.trim().length >= 8 && coincide && reauthOk);

  function hayGoogleConfigurado() {
    return Boolean(String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim());
  }

  async function guardar() {
    try {
      const inicio = Date.now();
      setGuardando(true);
      setMensaje('');

      const payload: Record<string, unknown> = { contrasenaNueva };
      if (contrasenaActual.trim()) payload.contrasenaActual = contrasenaActual;
      if (credentialReauth) payload.credential = credentialReauth;

      await clienteApi.enviar('/autenticacion/definir-contrasena', payload);
      setMensaje('Contrasena actualizada');
      emitToast({ level: 'ok', title: 'Cuenta', message: 'Contrasena actualizada', durationMs: 2400 });
      registrarAccionDocente('definir_contrasena', true, Date.now() - inicio);
      setContrasenaNueva('');
      setContrasenaNueva2('');
      setContrasenaActual('');
      setCredentialReauth(null);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo actualizar la contrasena');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'Cuenta',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('definir_contrasena', false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="info" /> Cuenta
      </h2>
      <p className="nota">Define o cambia tu contrasena. Por seguridad, se requiere reautenticacion.</p>

      <div className="meta" aria-label="Estado de la cuenta">
        <span className={docente.tieneGoogle ? 'badge ok' : 'badge'}>
          <span className="dot" aria-hidden="true" /> Google {docente.tieneGoogle ? 'vinculado' : 'no vinculado'}
        </span>
        <span className={docente.tieneContrasena ? 'badge ok' : 'badge'}>
          <span className="dot" aria-hidden="true" /> Contrasena {docente.tieneContrasena ? 'definida' : 'no definida'}
        </span>
      </div>

      {Boolean(docente.tieneGoogle && hayGoogleConfigurado()) && (
        <div className="auth-google auth-google--mb">
          <p className="nota">Reautenticacion con Google (recomendado).</p>
          <GoogleLogin
            onSuccess={(cred) => {
              const token = cred.credential;
              if (!token) {
                setMensaje('No se recibio credencial de Google.');
                return;
              }
              setCredentialReauth(token);
              setMensaje('Reautenticacion con Google lista.');
            }}
            onError={() => setMensaje('No se pudo reautenticar con Google.')}
          />
          <div className="acciones acciones--mt">
            <button type="button" className="chip" disabled={!credentialReauth} onClick={() => setCredentialReauth(null)}>
              Limpiar reauth
            </button>
          </div>
        </div>
      )}

      {docente.tieneContrasena && (
        <label className="campo">
          Contrasena actual
          <input
            type="password"
            value={contrasenaActual}
            onChange={(event) => setContrasenaActual(event.target.value)}
            autoComplete="current-password"
          />
        </label>
      )}

      <label className="campo">
        Nueva contrasena
        <input
          type="password"
          value={contrasenaNueva}
          onChange={(event) => setContrasenaNueva(event.target.value)}
          autoComplete="new-password"
        />
        <span className="ayuda">Minimo 8 caracteres.</span>
      </label>

      <label className="campo">
        Confirmar contrasena
        {contrasenaNueva2 && !coincide ? (
          <input
            type="password"
            value={contrasenaNueva2}
            onChange={(event) => setContrasenaNueva2(event.target.value)}
            autoComplete="new-password"
            aria-invalid="true"
          />
        ) : (
          <input
            type="password"
            value={contrasenaNueva2}
            onChange={(event) => setContrasenaNueva2(event.target.value)}
            autoComplete="new-password"
          />
        )}
        {contrasenaNueva2 && !coincide && <span className="ayuda error">Las contrasenas no coinciden.</span>}
      </label>

      <div className="acciones">
        <Boton type="button" icono={<Icono nombre="ok" />} cargando={guardando} disabled={!puedeGuardar} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar contrasena'}
        </Boton>
      </div>

      {mensaje && <InlineMensaje tipo={esMensajeError(mensaje) ? 'error' : 'ok'}>{mensaje}</InlineMensaje>}
    </div>
  );
}

function SeccionBanco({ preguntas, onRefrescar }: { preguntas: Pregunta[]; onRefrescar: () => void }) {
  const [enunciado, setEnunciado] = useState('');
  const [tema, setTema] = useState('');
  const [opciones, setOpciones] = useState([
    { texto: '', esCorrecta: true },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false }
  ]);
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const puedeGuardar = Boolean(
    enunciado.trim() &&
      tema.trim() &&
      opciones.every((opcion) => opcion.texto.trim()) &&
      opciones.some((opcion) => opcion.esCorrecta)
  );

  async function guardar() {
    try {
      const inicio = Date.now();
      setGuardando(true);
      setMensaje('');
      await clienteApi.enviar('/banco-preguntas', {
        enunciado: enunciado.trim(),
        tema: tema.trim(),
        opciones: opciones.map((item) => ({ ...item, texto: item.texto.trim() }))
      });
      setMensaje('Pregunta guardada');
      emitToast({ level: 'ok', title: 'Banco', message: 'Pregunta guardada', durationMs: 2200 });
      registrarAccionDocente('crear_pregunta', true, Date.now() - inicio);
      setEnunciado('');
      setOpciones([
        { texto: '', esCorrecta: true },
        { texto: '', esCorrecta: false },
        { texto: '', esCorrecta: false },
        { texto: '', esCorrecta: false },
        { texto: '', esCorrecta: false }
      ]);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo guardar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo guardar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('crear_pregunta', false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="banco" /> Banco de preguntas
      </h2>
      <label className="campo">
        Enunciado
        <textarea value={enunciado} onChange={(event) => setEnunciado(event.target.value)} />
      </label>
      <label className="campo">
        Tema
        <input value={tema} onChange={(event) => setTema(event.target.value)} />
      </label>
      {opciones.map((opcion, idx) => (
        <label key={idx} className="campo opcion">
          Opcion {String.fromCharCode(65 + idx)}
          <input
            value={opcion.texto}
            onChange={(event) => {
              const copia = [...opciones];
              copia[idx] = { ...copia[idx], texto: event.target.value };
              setOpciones(copia);
            }}
          />
          <input
            type="radio"
            name="correcta"
            checked={opcion.esCorrecta}
            onChange={() => {
              setOpciones(opciones.map((item, index) => ({ ...item, esCorrecta: index === idx })));
            }}
          />
          Correcta
        </label>
      ))}
      <Boton type="button" icono={<Icono nombre="ok" />} cargando={guardando} disabled={!puedeGuardar} onClick={guardar}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </Boton>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
      <h3>Preguntas recientes</h3>
      <ul className="lista">
        {preguntas.slice(0, 5).map((pregunta) => (
          <li key={pregunta._id}>{pregunta.versiones?.[0]?.enunciado ?? 'Pregunta'}</li>
        ))}
      </ul>
    </div>
  );
}

function SeccionPeriodos({
  periodos,
  onRefrescar
}: {
  periodos: Periodo[];
  onRefrescar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [grupos, setGrupos] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [creando, setCreando] = useState(false);

  const puedeCrear = Boolean(nombre.trim() && fechaInicio && fechaFin && fechaFin >= fechaInicio);

  async function crearPeriodo() {
    try {
      const inicio = Date.now();
      setCreando(true);
      setMensaje('');
      await clienteApi.enviar('/periodos', {
        nombre: nombre.trim(),
        fechaInicio,
        fechaFin,
        grupos: grupos
          ? grupos
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : []
      });
      setMensaje('Periodo creado');
      emitToast({ level: 'ok', title: 'Periodos', message: 'Periodo creado', durationMs: 2200 });
      registrarAccionDocente('crear_periodo', true, Date.now() - inicio);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo crear el periodo');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo crear',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('crear_periodo', false);
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="periodos" /> Periodos
      </h2>
      <label className="campo">
        Nombre
        <input value={nombre} onChange={(event) => setNombre(event.target.value)} />
      </label>
      <label className="campo">
        Fecha inicio
        <input type="date" value={fechaInicio} onChange={(event) => setFechaInicio(event.target.value)} />
      </label>
      <label className="campo">
        Fecha fin
        <input type="date" value={fechaFin} onChange={(event) => setFechaFin(event.target.value)} />
      </label>
      {fechaInicio && fechaFin && fechaFin < fechaInicio && (
        <InlineMensaje tipo="error">La fecha fin debe ser igual o posterior a la fecha inicio.</InlineMensaje>
      )}
      <label className="campo">
        Grupos (separados por coma)
        <input value={grupos} onChange={(event) => setGrupos(event.target.value)} />
      </label>
      <Boton type="button" icono={<Icono nombre="nuevo" />} cargando={creando} disabled={!puedeCrear} onClick={crearPeriodo}>
        {creando ? 'Creando…' : 'Crear periodo'}
      </Boton>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
      <h3>Periodos activos</h3>
      <ul className="lista">
        {periodos.map((periodo) => (
          <li key={periodo._id}>{periodo.nombre}</li>
        ))}
      </ul>
    </div>
  );
}

function SeccionAlumnos({
  alumnos,
  periodos,
  onRefrescar
}: {
  alumnos: Alumno[];
  periodos: Periodo[];
  onRefrescar: () => void;
}) {
  const [matricula, setMatricula] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [grupo, setGrupo] = useState('');
  const [periodoId, setPeriodoId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [creando, setCreando] = useState(false);

  const dominiosPermitidos = obtenerDominiosCorreoPermitidosFrontend();
  const politicaDominiosTexto = dominiosPermitidos.length > 0 ? textoDominiosPermitidos(dominiosPermitidos) : '';
  const correoValido = !correo.trim() || esCorreoDeDominioPermitidoFrontend(correo, dominiosPermitidos);

  const puedeCrear = Boolean(matricula.trim() && nombres.trim() && apellidos.trim() && periodoId && correoValido);

  async function crearAlumno() {
    try {
      const inicio = Date.now();
      if (dominiosPermitidos.length > 0 && correo.trim() && !correoValido) {
        const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
        registrarAccionDocente('crear_alumno', false);
        return;
      }
      setCreando(true);
      setMensaje('');
      await clienteApi.enviar('/alumnos', {
        matricula: matricula.trim(),
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        ...(correo.trim() ? { correo: correo.trim() } : {}),
        ...(grupo.trim() ? { grupo: grupo.trim() } : {}),
        periodoId
      });
      setMensaje('Alumno creado');
      emitToast({ level: 'ok', title: 'Alumnos', message: 'Alumno creado', durationMs: 2200 });
      registrarAccionDocente('crear_alumno', true, Date.now() - inicio);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo crear el alumno');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo crear',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('crear_alumno', false);
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="alumnos" /> Alumnos
      </h2>
      <label className="campo">
        Matricula
        <input value={matricula} onChange={(event) => setMatricula(event.target.value)} />
      </label>
      <label className="campo">
        Nombres
        <input value={nombres} onChange={(event) => setNombres(event.target.value)} />
      </label>
      <label className="campo">
        Apellidos
        <input value={apellidos} onChange={(event) => setApellidos(event.target.value)} />
      </label>
      <label className="campo">
        Correo
        <input value={correo} onChange={(event) => setCorreo(event.target.value)} />
        {dominiosPermitidos.length > 0 && <span className="ayuda">Opcional. Solo se permiten: {politicaDominiosTexto}</span>}
      </label>
      {dominiosPermitidos.length > 0 && correo.trim() && !correoValido && (
        <InlineMensaje tipo="error">Correo no permitido por politicas. Usa un correo institucional.</InlineMensaje>
      )}
      <label className="campo">
        Grupo
        <input value={grupo} onChange={(event) => setGrupo(event.target.value)} />
      </label>
      <label className="campo">
        Periodo
        <select value={periodoId} onChange={(event) => setPeriodoId(event.target.value)}>
          <option value="">Selecciona</option>
          {periodos.map((periodo) => (
            <option key={periodo._id} value={periodo._id}>
              {periodo.nombre}
            </option>
          ))}
        </select>
      </label>
      <Boton type="button" icono={<Icono nombre="nuevo" />} cargando={creando} disabled={!puedeCrear} onClick={crearAlumno}>
        {creando ? 'Creando…' : 'Crear alumno'}
      </Boton>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
      <h3>Alumnos recientes</h3>
      <ul className="lista">
        {alumnos.slice(0, 10).map((alumno) => (
          <li key={alumno._id}>
            {alumno.matricula} - {alumno.nombreCompleto}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeccionPlantillas({
  plantillas,
  periodos,
  preguntas,
  alumnos,
  onRefrescar
}: {
  plantillas: Plantilla[];
  periodos: Periodo[];
  preguntas: Pregunta[];
  alumnos: Alumno[];
  onRefrescar: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<'parcial' | 'global'>('parcial');
  const [periodoId, setPeriodoId] = useState('');
  const [totalReactivos, setTotalReactivos] = useState(10);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [plantillaId, setPlantillaId] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [mensajeGeneracion, setMensajeGeneracion] = useState('');
  const [creando, setCreando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const puedeCrear = Boolean(titulo.trim() && periodoId && seleccion.length > 0 && totalReactivos > 0);
  const puedeGenerar = Boolean(plantillaId);

  async function crear() {
    try {
      const inicio = Date.now();
      setCreando(true);
      setMensaje('');
      await clienteApi.enviar('/examenes/plantillas', {
        periodoId,
        tipo,
        titulo: titulo.trim(),
        totalReactivos: Math.max(1, Math.floor(totalReactivos)),
        preguntasIds: seleccion
      });
      setMensaje('Plantilla creada');
      emitToast({ level: 'ok', title: 'Plantillas', message: 'Plantilla creada', durationMs: 2200 });
      registrarAccionDocente('crear_plantilla', true, Date.now() - inicio);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo crear');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo crear',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('crear_plantilla', false);
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="plantillas" /> Plantillas
      </h2>
      <label className="campo">
        Titulo
        <input value={titulo} onChange={(event) => setTitulo(event.target.value)} />
      </label>
      <label className="campo">
        Tipo
        <select value={tipo} onChange={(event) => setTipo(event.target.value as 'parcial' | 'global')}>
          <option value="parcial">Parcial</option>
          <option value="global">Global</option>
        </select>
      </label>
      <label className="campo">
        Periodo
        <select value={periodoId} onChange={(event) => setPeriodoId(event.target.value)}>
          <option value="">Selecciona</option>
          {periodos.map((periodo) => (
            <option key={periodo._id} value={periodo._id}>
              {periodo.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        Total reactivos
        <input
          type="number"
          value={totalReactivos}
          onChange={(event) => setTotalReactivos(Number(event.target.value))}
        />
      </label>
      <label className="campo">
        Preguntas
        <select
          multiple
          value={seleccion}
          onChange={(event) =>
            setSeleccion(Array.from(event.target.selectedOptions).map((option) => option.value))
          }
        >
          {preguntas.map((pregunta) => (
            <option key={pregunta._id} value={pregunta._id}>
              {pregunta.versiones?.[0]?.enunciado?.slice(0, 40) ?? 'Pregunta'}
            </option>
          ))}
        </select>
      </label>
      <Boton type="button" icono={<Icono nombre="nuevo" />} cargando={creando} disabled={!puedeCrear} onClick={crear}>
        {creando ? 'Creando…' : 'Crear plantilla'}
      </Boton>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
      <h3>Plantillas existentes</h3>
      <ul className="lista">
        {plantillas.map((plantilla) => (
          <li key={plantilla._id}>{plantilla.titulo}</li>
        ))}
      </ul>
      <h3>Generar examen</h3>
      <label className="campo">
        Plantilla
        <select value={plantillaId} onChange={(event) => setPlantillaId(event.target.value)}>
          <option value="">Selecciona</option>
          {plantillas.map((plantilla) => (
            <option key={plantilla._id} value={plantilla._id}>
              {plantilla.titulo}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        Alumno (opcional)
        <select value={alumnoId} onChange={(event) => setAlumnoId(event.target.value)}>
          <option value="">Sin alumno</option>
          {alumnos.map((alumno) => (
            <option key={alumno._id} value={alumno._id}>
              {alumno.matricula} - {alumno.nombreCompleto}
            </option>
          ))}
        </select>
      </label>
      <Boton
        className="boton"
        type="button"
        icono={<Icono nombre="pdf" />}
        cargando={generando}
        disabled={!puedeGenerar}
        onClick={async () => {
          try {
            const inicio = Date.now();
            setGenerando(true);
            setMensajeGeneracion('');
            await clienteApi.enviar('/examenes/generados', { plantillaId, alumnoId: alumnoId || undefined });
            setMensajeGeneracion('Examen generado');
            emitToast({ level: 'ok', title: 'Examen', message: 'Examen generado', durationMs: 2200 });
            registrarAccionDocente('generar_examen', true, Date.now() - inicio);
          } catch (error) {
            const msg = mensajeDeError(error, 'No se pudo generar');
            setMensajeGeneracion(msg);
            emitToast({
              level: 'error',
              title: 'No se pudo generar',
              message: msg,
              durationMs: 5200,
              action: accionToastSesionParaError(error, 'docente')
            });
            registrarAccionDocente('generar_examen', false);
          } finally {
            setGenerando(false);
          }
        }}
      >
        {generando ? 'Generando…' : 'Generar'}
      </Boton>
      {mensajeGeneracion && (
        <p className={esMensajeError(mensajeGeneracion) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensajeGeneracion}
        </p>
      )}
    </div>
  );
}

function SeccionRecepcion({
  alumnos,
  onVincular
}: {
  alumnos: Alumno[];
  onVincular: (folio: string, alumnoId: string) => Promise<unknown>;
}) {
  const [folio, setFolio] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [vinculando, setVinculando] = useState(false);

  const puedeVincular = Boolean(folio.trim() && alumnoId);

  async function vincular() {
    try {
      const inicio = Date.now();
      setVinculando(true);
      setMensaje('');
      await onVincular(folio.trim(), alumnoId);
      setMensaje('Entrega vinculada');
      emitToast({ level: 'ok', title: 'Recepcion', message: 'Entrega vinculada', durationMs: 2200 });
      registrarAccionDocente('vincular_entrega', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo vincular');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo vincular',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('vincular_entrega', false);
    } finally {
      setVinculando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="recepcion" /> Recepcion de examenes
      </h2>
      <label className="campo">
        Folio
        <input value={folio} onChange={(event) => setFolio(event.target.value)} />
      </label>
      <label className="campo">
        Alumno
        <select value={alumnoId} onChange={(event) => setAlumnoId(event.target.value)}>
          <option value="">Selecciona</option>
          {alumnos.map((alumno) => (
            <option key={alumno._id} value={alumno._id}>
              {alumno.matricula} - {alumno.nombreCompleto}
            </option>
          ))}
        </select>
      </label>
      <Boton type="button" icono={<Icono nombre="recepcion" />} cargando={vinculando} disabled={!puedeVincular} onClick={vincular}>
        {vinculando ? 'Vinculando…' : 'Vincular'}
      </Boton>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
    </div>
  );
}

function SeccionEscaneo({
  onAnalizar,
  resultado,
  respuestas,
  onActualizar
}: {
  onAnalizar: (folio: string, numeroPagina: number, imagenBase64: string) => Promise<void>;
  resultado: ResultadoOmr | null;
  respuestas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>;
  onActualizar: (respuestas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>) => void;
}) {
  const [folio, setFolio] = useState('');
  const [numeroPagina, setNumeroPagina] = useState(1);
  const [imagenBase64, setImagenBase64] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [analizando, setAnalizando] = useState(false);

  const puedeAnalizar = Boolean(folio.trim() && imagenBase64);

  async function cargarArchivo(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      setImagenBase64(String(lector.result || ''));
    };
    lector.readAsDataURL(archivo);
  }

  async function analizar() {
    try {
      const inicio = Date.now();
      setAnalizando(true);
      setMensaje('');
      await onAnalizar(folio.trim(), Math.max(1, Math.floor(numeroPagina)), imagenBase64);
      setMensaje('Analisis completado');
      emitToast({ level: 'ok', title: 'Escaneo', message: 'Analisis completado', durationMs: 2200 });
      registrarAccionDocente('analizar_omr', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo analizar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo analizar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('analizar_omr', false);
    } finally {
      setAnalizando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="escaneo" /> Escaneo OMR
      </h2>
      <label className="campo">
        Folio
        <input value={folio} onChange={(event) => setFolio(event.target.value)} />
      </label>
      <label className="campo">
        Pagina
        <input
          type="number"
          value={numeroPagina}
          onChange={(event) => setNumeroPagina(Number(event.target.value))}
        />
      </label>
      <label className="campo">
        Imagen
        <input type="file" accept="image/*" onChange={cargarArchivo} />
      </label>
      <Boton type="button" icono={<Icono nombre="escaneo" />} cargando={analizando} disabled={!puedeAnalizar} onClick={analizar}>
        {analizando ? 'Analizando…' : 'Analizar'}
      </Boton>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}

      {imagenBase64 && (
        <div className="resultado">
          <h3>Vista previa</h3>
          <img className="preview" src={imagenBase64} alt="Imagen cargada para analisis OMR" />
        </div>
      )}

      {resultado && (
        <div className="resultado">
          <h3>Respuestas detectadas</h3>
          <ul className="lista">
            {respuestas.map((item, idx) => (
              <li key={item.numeroPregunta}>
                <span>
                  {item.numeroPregunta}:
                </span>
                <select
                  aria-label={`Respuesta pregunta ${item.numeroPregunta}`}
                  value={item.opcion ?? ''}
                  onChange={(event) => {
                    const nuevas = [...respuestas];
                    nuevas[idx] = { ...nuevas[idx], opcion: event.target.value || null };
                    onActualizar(nuevas);
                  }}
                >
                  <option value="">-</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="E">E</option>
                </select>
                <span>({Math.round(item.confianza * 100)}%)</span>
              </li>
            ))}
          </ul>
          {resultado.advertencias.length > 0 && (
            <div className="alerta">
              {resultado.advertencias.map((mensajeItem, idx) => (
                <p key={idx}>{mensajeItem}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SeccionCalificar({
  examenId,
  alumnoId,
  respuestasDetectadas,
  onCalificar
}: {
  examenId: string | null;
  alumnoId: string | null;
  respuestasDetectadas: Array<{ numeroPregunta: number; opcion: string | null }>;
  onCalificar: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [bono, setBono] = useState(0);
  const [evaluacionContinua, setEvaluacionContinua] = useState(0);
  const [proyecto, setProyecto] = useState(0);
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const puedeCalificar = Boolean(examenId && alumnoId);

  async function calificar() {
    if (!examenId || !alumnoId) {
      setMensaje('Falta examen o alumno');
      return;
    }
    try {
      const inicio = Date.now();
      setGuardando(true);
      setMensaje('');
      await onCalificar({
        examenGeneradoId: examenId,
        alumnoId,
        bonoSolicitado: bono,
        evaluacionContinua,
        proyecto,
        respuestasDetectadas
      });
      setMensaje('Calificacion guardada');
      emitToast({ level: 'ok', title: 'Calificacion', message: 'Calificacion guardada', durationMs: 2200 });
      registrarAccionDocente('calificar', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo calificar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo calificar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('calificar', false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="calificar" /> Calificar examen
      </h2>
      <p>Examen: {examenId ?? 'Sin examen'}</p>
      <p>Alumno: {alumnoId ?? 'Sin alumno'}</p>
      <label className="campo">
        Bono (max 0.5)
        <input
          type="number"
          step="0.1"
          min={0}
          max={0.5}
          value={bono}
          onChange={(event) => setBono(Math.max(0, Math.min(0.5, Number(event.target.value))))}
        />
      </label>
      <label className="campo">
        Evaluacion continua (parcial)
        <input
          type="number"
          value={evaluacionContinua}
          onChange={(event) => setEvaluacionContinua(Math.max(0, Number(event.target.value)))}
        />
      </label>
      <label className="campo">
        Proyecto (global)
        <input type="number" value={proyecto} onChange={(event) => setProyecto(Math.max(0, Number(event.target.value)))} />
      </label>
      <Boton type="button" icono={<Icono nombre="calificar" />} cargando={guardando} disabled={!puedeCalificar} onClick={calificar}>
        {guardando ? 'Guardando…' : 'Calificar'}
      </Boton>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
    </div>
  );
}

function SeccionPublicar({
  periodos,
  onPublicar,
  onCodigo
}: {
  periodos: Periodo[];
  onPublicar: (periodoId: string) => Promise<unknown>;
  onCodigo: (periodoId: string) => Promise<{ codigo?: string; expiraEn?: string }>;
}) {
  const [periodoId, setPeriodoId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [codigo, setCodigo] = useState('');
  const [expiraEn, setExpiraEn] = useState('');
  const [publicando, setPublicando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const puedeAccionar = Boolean(periodoId);

  async function publicar() {
    try {
      const inicio = Date.now();
      setPublicando(true);
      setMensaje('');
      await onPublicar(periodoId);
      setMensaje('Resultados publicados');
      emitToast({ level: 'ok', title: 'Publicacion', message: 'Resultados publicados', durationMs: 2800 });
      registrarAccionDocente('publicar_resultados', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo publicar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo publicar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('publicar_resultados', false);
    } finally {
      setPublicando(false);
    }
  }

  async function generarCodigo() {
    try {
      const inicio = Date.now();
      setGenerando(true);
      setMensaje('');
      const respuesta = await onCodigo(periodoId);
      setCodigo(respuesta.codigo ?? '');
      setExpiraEn(respuesta.expiraEn ?? '');
      emitToast({ level: 'ok', title: 'Codigo', message: 'Codigo generado', durationMs: 2200 });
      registrarAccionDocente('generar_codigo', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo generar codigo');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo generar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('generar_codigo', false);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="publicar" /> Publicar en portal
      </h2>
      <label className="campo">
        Periodo
        <select value={periodoId} onChange={(event) => setPeriodoId(event.target.value)}>
          <option value="">Selecciona</option>
          {periodos.map((periodo) => (
            <option key={periodo._id} value={periodo._id}>
              {periodo.nombre}
            </option>
          ))}
        </select>
      </label>
      <div className="acciones">
        <Boton type="button" icono={<Icono nombre="publicar" />} cargando={publicando} disabled={!puedeAccionar} onClick={publicar}>
          {publicando ? 'Publicando…' : 'Publicar'}
        </Boton>
        <Boton
          type="button"
          variante="secundario"
          icono={<Icono nombre="info" />}
          cargando={generando}
          disabled={!puedeAccionar}
          onClick={generarCodigo}
        >
          {generando ? 'Generando…' : 'Generar codigo'}
        </Boton>
      </div>
      {codigo && (
        <p>
          Codigo generado: {codigo} {expiraEn ? `(expira ${new Date(expiraEn).toLocaleString()})` : ''}
        </p>
      )}
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
    </div>
  );
}
