/**
 * App docente: panel basico para banco, examenes, recepcion, escaneo y calificacion.
 */
import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import {
  crearClienteApi,
  guardarTokenDocente,
  limpiarTokenDocente,
  obtenerTokenDocente
} from '../../servicios_api/clienteApi';
import { ErrorRemoto, accionToastSesionParaError, mensajeUsuarioDeErrorConSugerencia, onSesionInvalidada } from '../../servicios_api/clienteComun';
import { emitToast } from '../../ui/toast/toastBus';
import { Icono, Spinner } from '../../ui/iconos';
import { Boton } from '../../ui/ux/componentes/Boton';
import { InlineMensaje } from '../../ui/ux/componentes/InlineMensaje';
import { obtenerSessionId } from '../../ui/ux/sesion';
import { tipoMensajeInline } from './mensajeInline';

const clienteApi = crearClienteApi();

type Docente = {
  id: string;
  nombreCompleto: string;
  nombres?: string;
  apellidos?: string;
  correo: string;
  tieneContrasena?: boolean;
  tieneGoogle?: boolean;
};

type Alumno = {
  _id: string;
  matricula: string;
  nombreCompleto: string;
  periodoId?: string;
  nombres?: string;
  apellidos?: string;
  correo?: string;
  grupo?: string;
  activo?: boolean;
};

type Periodo = {
  _id: string;
  nombre: string;
  fechaInicio?: string;
  fechaFin?: string;
  grupos?: string[];
  activo?: boolean;
  createdAt?: string;
  archivadoEn?: string;
  resumenArchivado?: {
    alumnos?: number;
    bancoPreguntas?: number;
    plantillas?: number;
    examenesGenerados?: number;
    calificaciones?: number;
    codigosAcceso?: number;
  };
};

type Plantilla = {
  _id: string;
  titulo: string;
  tipo: 'parcial' | 'global';
  totalReactivos: number;
  periodoId?: string;
  preguntasIds?: string[];
  temas?: string[];
};

type Pregunta = {
  _id: string;
  periodoId?: string;
  tema?: string;
  activo?: boolean;
  versionActual?: number;
  versiones: Array<{
    numeroVersion?: number;
    enunciado: string;
    imagenUrl?: string;
    opciones?: Array<{ texto: string; esCorrecta: boolean }>;
  }>;
  createdAt?: string;
};

function obtenerVersionPregunta(pregunta: Pregunta): Pregunta['versiones'][number] | null {
  const versiones = Array.isArray(pregunta.versiones) ? pregunta.versiones : [];
  if (versiones.length === 0) return null;
  const actual = versiones.find((v) => v.numeroVersion === pregunta.versionActual);
  return actual ?? versiones[versiones.length - 1] ?? null;
}

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

function mensajeDeError(error: unknown, fallback: string) {
  return mensajeUsuarioDeErrorConSugerencia(error, fallback);
}

function esMensajeError(texto: string): boolean {
  return tipoMensajeInline(texto) === 'error';
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

const LARGO_ID_MATERIA = 8;

function idCortoMateria(id?: string, largo = LARGO_ID_MATERIA): string {
  const valor = String(id || '').trim();
  if (!valor) return '-';
  if (valor.length <= largo) return valor;
  return valor.slice(-largo);
}

function etiquetaMateriaConId(nombre?: string, id?: string): string {
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) return '-';
  const idLimpio = String(id || '').trim();
  if (!idLimpio) return nombreLimpio;
  return `${nombreLimpio} (ID: ${idCortoMateria(idLimpio)})`;
}

function etiquetaMateria(periodo?: { _id?: string; nombre?: string } | null): string {
  return etiquetaMateriaConId(periodo?.nombre, periodo?._id);
}

function AyudaFormulario({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="panel">
      <h3>
        <Icono nombre="info" /> {titulo}
      </h3>
      <div className="nota">{children}</div>
    </div>
  );
}

export function AppDocente() {
  const [estadoApi, setEstadoApi] = useState<EstadoApi>({ estado: 'cargando', texto: 'Verificando API...' });
  const [docente, setDocente] = useState<Docente | null>(null);
  const [vista, setVista] = useState('inicio');
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodosArchivados, setPeriodosArchivados] = useState<Periodo[]>([]);
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
        { id: 'periodos', label: 'Materias', icono: 'periodos' as const },
        { id: 'periodos_archivados', label: 'Archivadas', icono: 'periodos' as const },
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
      clienteApi.obtener<{ periodos?: Periodo[]; materias?: Periodo[] }>('/periodos?activo=1'),
      clienteApi.obtener<{ periodos?: Periodo[]; materias?: Periodo[] }>('/periodos?activo=0'),
      clienteApi.obtener<{ plantillas: Plantilla[] }>('/examenes/plantillas'),
      clienteApi.obtener<{ preguntas: Pregunta[] }>('/banco-preguntas')
    ])
      .then(([al, peActivas, peArchivadas, pl, pr]) => {
        setAlumnos(al.alumnos);
        const activas = (peActivas as unknown as { periodos?: Periodo[]; materias?: Periodo[] }).periodos ??
          (peActivas as unknown as { periodos?: Periodo[]; materias?: Periodo[] }).materias ??
          [];
        const archivadas = (peArchivadas as unknown as { periodos?: Periodo[]; materias?: Periodo[] }).periodos ??
          (peArchivadas as unknown as { periodos?: Periodo[]; materias?: Periodo[] }).materias ??
          [];

        const activasArray = Array.isArray(activas) ? activas : [];
        const archivadasArray = Array.isArray(archivadas) ? archivadas : [];

        const ids = (lista: Periodo[]) => lista.map((m) => m._id).filter(Boolean).sort().join('|');
        const mismoContenido = activasArray.length > 0 && ids(activasArray) === ids(archivadasArray);

        // Fallback: si el backend ignora ?activo y devuelve lo mismo, separa localmente.
        if (mismoContenido) {
          setPeriodos(activasArray.filter((m) => m.activo !== false));
          setPeriodosArchivados(activasArray.filter((m) => m.activo === false));
        } else {
          setPeriodos(activasArray);
          setPeriodosArchivados(archivadasArray);
        }
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

  function refrescarMaterias() {
    return Promise.all([
      clienteApi.obtener<{ periodos?: Periodo[]; materias?: Periodo[] }>('/periodos?activo=1'),
      clienteApi.obtener<{ periodos?: Periodo[]; materias?: Periodo[] }>('/periodos?activo=0')
    ]).then(([peActivas, peArchivadas]) => {
      const activas = peActivas.periodos ?? peActivas.materias ?? [];
      const archivadas = peArchivadas.periodos ?? peArchivadas.materias ?? [];

      const activasArray = Array.isArray(activas) ? activas : [];
      const archivadasArray = Array.isArray(archivadas) ? archivadas : [];

      const ids = (lista: Periodo[]) => lista.map((m) => m._id).filter(Boolean).sort().join('|');
      const mismoContenido = activasArray.length > 0 && ids(activasArray) === ids(archivadasArray);

      if (mismoContenido) {
        setPeriodos(activasArray.filter((m) => m.activo !== false));
        setPeriodosArchivados(activasArray.filter((m) => m.activo === false));
      } else {
        setPeriodos(activasArray);
        setPeriodosArchivados(archivadasArray);
      }
    });
  }

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
        <SeccionBanco
          preguntas={preguntas}
          periodos={periodos}
          onRefrescar={() =>
            clienteApi.obtener<{ preguntas: Pregunta[] }>('/banco-preguntas').then((p) => setPreguntas(p.preguntas))
          }
        />
      )}

      {vista === 'periodos' && (
        <SeccionPeriodos
          periodos={periodos}
          onRefrescar={refrescarMaterias}
          onVerArchivadas={() => setVista('periodos_archivados')}
        />
      )}

      {vista === 'periodos_archivados' && (
        <SeccionPeriodosArchivados
          periodos={periodosArchivados}
          onRefrescar={refrescarMaterias}
          onVerActivas={() => setVista('periodos')}
        />
      )}

      {vista === 'alumnos' && (
        <SeccionAlumnos
          alumnos={alumnos}
          periodosActivos={periodos}
          periodosTodos={[...periodos, ...periodosArchivados]}
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
        <InlineMensaje tipo="info">
          Sesion: {[docente.nombres, docente.apellidos].filter(Boolean).join(' ').trim() || docente.nombreCompleto} ({docente.correo})
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

  function invitarARegistrar() {
    setModo('registrar');
    setMostrarFormularioRegistrar(true);
    setCredentialRegistroGoogle(null);
    setCrearContrasenaAhora(true);
    setNombres('');
    setApellidos('');
    setContrasena('');
    setMensaje('No existe una cuenta para ese correo. Completa tus datos para registrarte.');
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

      const codigo = error instanceof ErrorRemoto ? error.detalle?.codigo : undefined;
      const esNoRegistrado = typeof codigo === 'string' && codigo.toUpperCase() === 'DOCENTE_NO_REGISTRADO';

      emitToast({
        level: 'error',
        title: 'No se pudo ingresar',
        message: msg,
        durationMs: 5200,
        action: esNoRegistrado
          ? { label: 'Registrar', onClick: invitarARegistrar }
          : accionToastSesionParaError(error, 'docente')
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

      const codigo = error instanceof ErrorRemoto ? error.detalle?.codigo : undefined;
      const esNoRegistrado = typeof codigo === 'string' && codigo.toUpperCase() === 'DOCENTE_NO_REGISTRADO';

      emitToast({
        level: 'error',
        title: 'No se pudo ingresar',
        message: msg,
        durationMs: 5200,
        action: esNoRegistrado
          ? { label: 'Registrar', onClick: () => setModo('registrar') }
          : accionToastSesionParaError(error, 'docente')
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
      const correoFinal = correo.trim();

      const debeEnviarContrasena = Boolean(
        contrasena.trim() && (!credentialRegistroGoogle || crearContrasenaAhora)
      );

      const respuesta = credentialRegistroGoogle
        ? await clienteApi.enviar<{ token: string }>('/autenticacion/registrar-google', {
            credential: credentialRegistroGoogle,
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            ...(debeEnviarContrasena ? { contrasena } : {})
          })
        : await clienteApi.enviar<{ token: string }>('/autenticacion/registrar', {
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
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
        <AyudaFormulario titulo="Como llenar este formulario">
          <p>
            <b>Proposito:</b> ingresar o crear tu cuenta de docente para administrar materias, alumnos, banco de preguntas,
            generar examenes y calificar.
          </p>
          <p>
            <b>Ingresar:</b> usa tu correo y contrasena (o Google si esta habilitado). Si el boton &quot;Ingresar&quot; no se habilita,
            revisa que ambos campos esten completos.
          </p>
          <p>
            <b>Registrar:</b> completa nombres, apellidos y correo. La contrasena requiere minimo 8 caracteres.
            Si registras con Google, el correo puede quedar bloqueado (tomado de Google) y la contrasena puede ser opcional.
          </p>
          <ul className="lista">
            <li>
              Ejemplo de correo: <code>docente@universidad.edu</code>
            </li>
            <li>
              Ejemplo de nombres/apellidos: <code>Juan Carlos</code> / <code>Perez Lopez</code>
            </li>
          </ul>
          <p>
            <b>Politica institucional:</b> si se configuro una lista de dominios permitidos, solo podras usar correos de esos dominios.
          </p>
        </AyudaFormulario>

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

        {mensaje && <InlineMensaje tipo={tipoMensajeInline(mensaje)}>{mensaje}</InlineMensaje>}
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
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> definir o cambiar tu contrasena para acceder con correo/contrasena.
        </p>
        <ul className="lista">
          <li>
            <b>Contrasena actual:</b> requerida si tu cuenta ya tenia contrasena.
          </li>
          <li>
            <b>Nueva contrasena:</b> minimo 8 caracteres.
          </li>
          <li>
            <b>Confirmar contrasena:</b> debe coincidir exactamente.
          </li>
          <li>
            <b>Reautenticacion:</b> si aparece Google, es la opcion recomendada para confirmar identidad.
          </li>
        </ul>
        <p>
          Ejemplo: nueva contrasena <code>MiClaveSegura2026</code> (no uses contrasenas obvias).
        </p>
      </AyudaFormulario>

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

      {mensaje && <InlineMensaje tipo={tipoMensajeInline(mensaje)}>{mensaje}</InlineMensaje>}
    </div>
  );
}

function SeccionBanco({
  preguntas,
  periodos,
  onRefrescar
}: {
  preguntas: Pregunta[];
  periodos: Periodo[];
  onRefrescar: () => void;
}) {
  const [periodoId, setPeriodoId] = useState('');
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
  const [asignandoId, setAsignandoId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editEnunciado, setEditEnunciado] = useState('');
  const [editTema, setEditTema] = useState('');
  const [editOpciones, setEditOpciones] = useState([
    { texto: '', esCorrecta: true },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false }
  ]);
  const [editando, setEditando] = useState(false);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  useEffect(() => {
    if (periodoId) return;
    if (!Array.isArray(periodos) || periodos.length === 0) return;
    setPeriodoId(periodos[0]._id);
  }, [periodoId, periodos]);

  const preguntasMateria = useMemo(() => {
    const lista = Array.isArray(preguntas) ? preguntas : [];
    const filtradas = periodoId ? lista.filter((p) => p.periodoId === periodoId) : [];
    return [...filtradas].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [preguntas, periodoId]);

  const preguntasSinMateria = useMemo(() => {
    const lista = Array.isArray(preguntas) ? preguntas : [];
    return [...lista]
      .filter((p) => !p.periodoId)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [preguntas]);

  const puedeGuardar = Boolean(
    periodoId &&
      enunciado.trim() &&
      tema.trim() &&
      opciones.every((opcion) => opcion.texto.trim()) &&
      opciones.some((opcion) => opcion.esCorrecta)
  );

  const puedeGuardarEdicion = Boolean(
    editandoId && editEnunciado.trim() && editTema.trim() && editOpciones.every((o) => o.texto.trim())
  );

  function iniciarEdicion(pregunta: Pregunta) {
    const version = obtenerVersionPregunta(pregunta);
    setEditandoId(pregunta._id);
    setEditEnunciado(version?.enunciado ?? '');
    setEditTema(String(pregunta.tema ?? '').trim());
    const opcionesActuales = Array.isArray(version?.opciones) ? version?.opciones : [];
    const base = opcionesActuales.length === 5 ? opcionesActuales : editOpciones;
    setEditOpciones(base.map((o) => ({ texto: String(o.texto ?? ''), esCorrecta: Boolean(o.esCorrecta) })));
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setEditEnunciado('');
    setEditTema('');
    setEditOpciones([
      { texto: '', esCorrecta: true },
      { texto: '', esCorrecta: false },
      { texto: '', esCorrecta: false },
      { texto: '', esCorrecta: false },
      { texto: '', esCorrecta: false }
    ]);
  }

  async function guardar() {
    try {
      const inicio = Date.now();
      setGuardando(true);
      setMensaje('');
      await clienteApi.enviar('/banco-preguntas', {
        periodoId,
        enunciado: enunciado.trim(),
        tema: tema.trim(),
        opciones: opciones.map((item) => ({ ...item, texto: item.texto.trim() }))
      });
      setMensaje('Pregunta guardada');
      emitToast({ level: 'ok', title: 'Banco', message: 'Pregunta guardada', durationMs: 2200 });
      registrarAccionDocente('crear_pregunta', true, Date.now() - inicio);
      setEnunciado('');
      setTema('');
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

  async function asignarPreguntaSinMateria(preguntaId: string) {
    if (!periodoId) return;

    try {
      const inicio = Date.now();
      setAsignandoId(preguntaId);
      setMensaje('');
      await clienteApi.enviar(`/banco-preguntas/${preguntaId}/asignar-materia`, { periodoId });
      setMensaje('Pregunta asignada a la materia');
      emitToast({ level: 'ok', title: 'Banco', message: 'Pregunta asignada a la materia', durationMs: 2200 });
      registrarAccionDocente('asignar_pregunta_materia', true, Date.now() - inicio);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo asignar la pregunta');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo asignar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('asignar_pregunta_materia', false);
    } finally {
      setAsignandoId(null);
    }
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    try {
      const inicio = Date.now();
      setEditando(true);
      setMensaje('');
      await clienteApi.enviar(`/banco-preguntas/${editandoId}/actualizar`, {
        enunciado: editEnunciado.trim(),
        tema: editTema.trim(),
        opciones: editOpciones.map((o) => ({ ...o, texto: o.texto.trim() }))
      });
      setMensaje('Pregunta actualizada');
      emitToast({ level: 'ok', title: 'Banco', message: 'Pregunta actualizada', durationMs: 2200 });
      registrarAccionDocente('actualizar_pregunta', true, Date.now() - inicio);
      cancelarEdicion();
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo actualizar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo actualizar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('actualizar_pregunta', false);
    } finally {
      setEditando(false);
    }
  }

  async function eliminar(preguntaId: string) {
    const ok = globalThis.confirm('¿Eliminar esta pregunta? Se desactivará del banco.');
    if (!ok) return;
    try {
      const inicio = Date.now();
      setBorrandoId(preguntaId);
      setMensaje('');
      await clienteApi.eliminar(`/banco-preguntas/${preguntaId}`);
      setMensaje('Pregunta eliminada');
      emitToast({ level: 'ok', title: 'Banco', message: 'Pregunta eliminada', durationMs: 2200 });
      registrarAccionDocente('eliminar_pregunta', true, Date.now() - inicio);
      if (editandoId === preguntaId) cancelarEdicion();
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo eliminar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo eliminar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('eliminar_pregunta', false);
    } finally {
      setBorrandoId(null);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="banco" /> Banco de preguntas
      </h2>
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> construir el banco de reactivos (preguntas) que despues se usan en plantillas y examenes.
        </p>
        <ul className="lista">
          <li>
            <b>Enunciado:</b> el texto completo de la pregunta.
          </li>
          <li>
            <b>Tema:</b> unidad/categoria (sirve para organizar).
          </li>
          <li>
            <b>Opciones A–E:</b> todas deben llevar texto.
          </li>
          <li>
            <b>Correcta:</b> marca exactamente una.
          </li>
        </ul>
        <p>
          Ejemplo:
        </p>
        <ul className="lista">
          <li>
            Enunciado: <code>¿Cuanto es 2 + 2?</code>
          </li>
          <li>
            Tema: <code>Aritmetica</code>
          </li>
          <li>
            Opciones: A=<code>4</code> (correcta), B=<code>3</code>, C=<code>5</code>, D=<code>22</code>, E=<code>0</code>
          </li>
        </ul>
      </AyudaFormulario>
      <label className="campo">
        Materia
        <select value={periodoId} onChange={(event) => setPeriodoId(event.target.value)}>
          <option value="">Selecciona</option>
          {periodos.map((periodo) => (
            <option key={periodo._id} value={periodo._id} title={periodo._id}>
              {etiquetaMateria(periodo)}
            </option>
          ))}
        </select>
        {periodos.length === 0 && <span className="ayuda">Primero crea una materia para poder agregar preguntas.</span>}
      </label>
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

      {editandoId && (
        <div className="resultado">
          <h3>Editando pregunta</h3>
          <label className="campo">
            Enunciado
            <textarea value={editEnunciado} onChange={(event) => setEditEnunciado(event.target.value)} />
          </label>
          <label className="campo">
            Tema
            <input value={editTema} onChange={(event) => setEditTema(event.target.value)} />
          </label>
          {editOpciones.map((opcion, idx) => (
            <label key={idx} className="campo opcion">
              Opcion {String.fromCharCode(65 + idx)}
              <input
                value={opcion.texto}
                onChange={(event) => {
                  const copia = [...editOpciones];
                  copia[idx] = { ...copia[idx], texto: event.target.value };
                  setEditOpciones(copia);
                }}
              />
              <input
                type="radio"
                name="correctaEdit"
                checked={opcion.esCorrecta}
                onChange={() => setEditOpciones(editOpciones.map((item, index) => ({ ...item, esCorrecta: index === idx })))}
              />
              Correcta
            </label>
          ))}
          <div className="acciones">
            <Boton type="button" icono={<Icono nombre="ok" />} cargando={editando} disabled={!puedeGuardarEdicion} onClick={guardarEdicion}>
              {editando ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
            <Boton type="button" variante="secundario" onClick={cancelarEdicion}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
      <h3>Preguntas sin materia</h3>
      <div className="ayuda">
        Preguntas legacy que quedaron sin materia asignada. Selecciona una materia y pulsa &quot;Asignar&quot;.
      </div>
      <ul className="lista lista-items">
        {!periodoId && <li>Selecciona una materia para poder asignar preguntas.</li>}
        {periodoId && preguntasSinMateria.length === 0 && <li>No hay preguntas sin materia.</li>}
        {periodoId &&
          preguntasSinMateria.slice(0, 30).map((pregunta) => (
            <li key={pregunta._id}>
              {(() => {
                const version = obtenerVersionPregunta(pregunta);
                const opcionesActuales = Array.isArray(version?.opciones) ? version?.opciones : [];
                return (
                  <div className="item-glass">
                    <div className="item-row">
                      <div>
                        <div className="item-title">{version?.enunciado ?? 'Pregunta'}</div>
                        <div className="item-meta">
                          <span>ID: {idCortoMateria(pregunta._id)}</span>
                          {pregunta.tema ? <span>Tema: {pregunta.tema}</span> : <span>Tema: -</span>}
                        </div>
                      </div>
                      <div className="item-actions">
                        <Boton
                          variante="secundario"
                          type="button"
                          cargando={asignandoId === pregunta._id}
                          onClick={() => asignarPreguntaSinMateria(pregunta._id)}
                        >
                          Asignar a esta materia
                        </Boton>
                        <Boton variante="secundario" type="button" onClick={() => iniciarEdicion(pregunta)}>
                          Editar
                        </Boton>
                        <Boton type="button" cargando={borrandoId === pregunta._id} onClick={() => eliminar(pregunta._id)}>
                          Eliminar
                        </Boton>
                      </div>
                    </div>
                    {opcionesActuales.length === 5 && (
                      <ul className="item-options">
                        {opcionesActuales.map((op, idx) => (
                          <li key={idx} className={`item-option${op.esCorrecta ? ' item-option--correcta' : ''}`}>
                            <span className="item-option__letra">{String.fromCharCode(65 + idx)}.</span> {op.texto}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </li>
          ))}
      </ul>
      <h3>Preguntas recientes</h3>
      <ul className="lista lista-items">
        {!periodoId && <li>Selecciona una materia para ver sus preguntas.</li>}
        {periodoId && preguntasMateria.length === 0 && <li>No hay preguntas en esta materia.</li>}
        {periodoId &&
          preguntasMateria.map((pregunta) => (
            <li key={pregunta._id}>
              {(() => {
                const version = obtenerVersionPregunta(pregunta);
                const opcionesActuales = Array.isArray(version?.opciones) ? version?.opciones : [];
                return (
                  <div className="item-glass">
                    <div className="item-row">
                      <div>
                        <div className="item-title">{version?.enunciado ?? 'Pregunta'}</div>
                        <div className="item-meta">
                          <span>ID: {idCortoMateria(pregunta._id)}</span>
                          <span>Tema: {pregunta.tema ? pregunta.tema : '-'}</span>
                        </div>
                      </div>
                      <div className="item-actions">
                        <Boton variante="secundario" type="button" onClick={() => iniciarEdicion(pregunta)}>
                          Editar
                        </Boton>
                        <Boton type="button" cargando={borrandoId === pregunta._id} onClick={() => eliminar(pregunta._id)}>
                          Eliminar
                        </Boton>
                      </div>
                    </div>
                    {opcionesActuales.length === 5 && (
                      <ul className="item-options">
                        {opcionesActuales.map((op, idx) => (
                          <li key={idx} className={`item-option${op.esCorrecta ? ' item-option--correcta' : ''}`}>
                            <span className="item-option__letra">{String.fromCharCode(65 + idx)}.</span> {op.texto}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </li>
          ))}
      </ul>
    </div>
  );
}

function SeccionPeriodos({
  periodos,
  onRefrescar,
  onVerArchivadas
}: {
  periodos: Periodo[];
  onRefrescar: () => void;
  onVerArchivadas: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [grupos, setGrupos] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [creando, setCreando] = useState(false);
  const [archivandoId, setArchivandoId] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  function formatearFecha(valor?: string) {
    if (!valor) return '-';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor);
    return d.toLocaleDateString();
  }

  function normalizarNombreMateria(valor: string): string {
    return String(valor || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  const nombreNormalizado = useMemo(() => normalizarNombreMateria(nombre), [nombre]);
  const nombreDuplicado = useMemo(() => {
    if (!nombreNormalizado) return false;
    return periodos.some((p) => normalizarNombreMateria(p.nombre) === nombreNormalizado);
  }, [nombreNormalizado, periodos]);

  const puedeCrear = Boolean(nombre.trim() && fechaInicio && fechaFin && fechaFin >= fechaInicio && !nombreDuplicado);

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
      setMensaje('Materia creada');
      emitToast({ level: 'ok', title: 'Materias', message: 'Materia creada', durationMs: 2200 });
      registrarAccionDocente('crear_periodo', true, Date.now() - inicio);
      setNombre('');
      setFechaInicio('');
      setFechaFin('');
      setGrupos('');
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo crear la materia');
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

  async function borrarMateria(periodo: Periodo) {
    const paso1 = globalThis.confirm(
      `¿Borrar la materia "${etiquetaMateria(periodo)}"?\n\nSe borrara TODO lo asociado: alumnos, banco de preguntas, plantillas, examenes generados, calificaciones y codigos.`
    );
    if (!paso1) return;
    const paso2 = globalThis.confirm(
      `CONFIRMACION FINAL:\n\nEsta accion NO se puede deshacer.\n\n¿Seguro que deseas borrar definitivamente "${etiquetaMateria(periodo)}"?`
    );
    if (!paso2) return;

    try {
      const inicio = Date.now();
      setBorrandoId(periodo._id);
      setMensaje('');
      await clienteApi.eliminar(`/periodos/${periodo._id}`);
      setMensaje('Materia borrada');
      emitToast({ level: 'ok', title: 'Materias', message: 'Materia borrada', durationMs: 2200 });
      registrarAccionDocente('borrar_periodo', true, Date.now() - inicio);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo borrar la materia');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo borrar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('borrar_periodo', false);
    } finally {
      setBorrandoId(null);
    }
  }

  async function archivarMateria(periodo: Periodo) {
    const confirmado = globalThis.confirm(
      `¿Archivar la materia "${etiquetaMateria(periodo)}"?\n\nSe ocultara de la lista de activas, pero NO se borraran sus datos.`
    );
    if (!confirmado) return;

    try {
      const inicio = Date.now();
      setArchivandoId(periodo._id);
      setMensaje('');
      await clienteApi.enviar(`/periodos/${periodo._id}/archivar`, {});
      setMensaje('Materia archivada');
      emitToast({ level: 'ok', title: 'Materias', message: 'Materia archivada', durationMs: 2200 });
      registrarAccionDocente('archivar_periodo', true, Date.now() - inicio);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo archivar la materia');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo archivar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('archivar_periodo', false);
    } finally {
      setArchivandoId(null);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="periodos" /> Materias
      </h2>
      <div className="acciones">
        <Boton variante="secundario" type="button" onClick={onVerArchivadas}>
          Ver materias archivadas
        </Boton>
      </div>
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> definir cada <b>materia</b> (unidad de trabajo) a la que pertenecen alumnos, plantillas, examenes y publicaciones.
        </p>
        <ul className="lista">
          <li>
            <b>Nombre:</b> nombre de la materia (ej. <code>Algebra I</code>, <code>Programacion</code>, <code>Fisica</code>).
          </li>
          <li>
            <b>Fecha inicio/fin:</b> rango de la materia; normalmente dura aproximadamente 30 dias. La fecha fin debe ser mayor o igual a la inicio.
          </li>
          <li>
            <b>Grupos:</b> lista opcional separada por comas.
          </li>
        </ul>
        <p>
          Ejemplos de grupos: <code>3A,3B,3C</code> o <code>A1,B1</code>.
        </p>
      </AyudaFormulario>
      <label className="campo">
        Nombre de la materia
        <input value={nombre} onChange={(event) => setNombre(event.target.value)} />
      </label>
      {nombre.trim() && nombreDuplicado && (
        <InlineMensaje tipo="error">Ya existe una materia con ese nombre. Cambia el nombre para crearla.</InlineMensaje>
      )}
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
        {creando ? 'Creando…' : 'Crear materia'}
      </Boton>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
      <h3>Materias activas</h3>
      <ul className="lista lista-items">
        {periodos.map((periodo) => (
          <li key={periodo._id}>
            <div className="item-glass">
              <div className="item-row">
                <div>
                  <div className="item-title" title={periodo._id}>
                    {etiquetaMateria(periodo)}
                  </div>
                  <div className="item-meta">
                    <span>ID: {idCortoMateria(periodo._id)}</span>
                    <span>Inicio: {formatearFecha(periodo.fechaInicio)}</span>
                    <span>Fin: {formatearFecha(periodo.fechaFin)}</span>
                    <span>
                      Grupos:{' '}
                      {Array.isArray(periodo.grupos) && periodo.grupos.length > 0 ? periodo.grupos.join(', ') : '-'}
                    </span>
                  </div>
                </div>
                <div className="item-actions">
                  <Boton
                    variante="secundario"
                    type="button"
                    cargando={archivandoId === periodo._id}
                    onClick={() => archivarMateria(periodo)}
                  >
                    Archivar
                  </Boton>
                  <Boton
                    variante="secundario"
                    type="button"
                    icono={<Icono nombre="alerta" />}
                    cargando={borrandoId === periodo._id}
                    onClick={() => borrarMateria(periodo)}
                  >
                    Borrar
                  </Boton>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeccionPeriodosArchivados({
  periodos,
  onRefrescar,
  onVerActivas
}: {
  periodos: Periodo[];
  onRefrescar: () => void;
  onVerActivas: () => void;
}) {
  const [mensaje, setMensaje] = useState('');
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  function formatearFechaHora(valor?: string) {
    if (!valor) return '-';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor);
    return d.toLocaleString();
  }

  async function borrarMateria(periodo: Periodo) {
    const paso1 = globalThis.confirm(
      `¿Borrar DEFINITIVAMENTE la materia archivada "${etiquetaMateria(periodo)}"?\n\nSe borrara TODO lo asociado: alumnos, banco de preguntas, plantillas, examenes generados, calificaciones y codigos.`
    );
    if (!paso1) return;
    const paso2 = globalThis.confirm(
      `CONFIRMACION FINAL:\n\nEsta accion NO se puede deshacer.\n\n¿Seguro que deseas borrar definitivamente "${etiquetaMateria(periodo)}"?`
    );
    if (!paso2) return;

    try {
      const inicio = Date.now();
      setBorrandoId(periodo._id);
      setMensaje('');
      await clienteApi.eliminar(`/periodos/${periodo._id}`);
      setMensaje('Materia borrada');
      emitToast({ level: 'ok', title: 'Materias', message: 'Materia borrada', durationMs: 2200 });
      registrarAccionDocente('borrar_periodo', true, Date.now() - inicio);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo borrar la materia');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo borrar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('borrar_periodo', false);
    } finally {
      setBorrandoId(null);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="periodos" /> Materias archivadas
      </h2>
      <div className="acciones">
        <Boton variante="secundario" type="button" onClick={onVerActivas}>
          Volver a materias activas
        </Boton>
      </div>

      <AyudaFormulario titulo="Que significa archivar">
        <p>
          Archivar una materia la marca como <b>inactiva</b> para que no aparezca en listas de trabajo diarias.
          Los datos quedan guardados (solo se ocultan), y se registra un resumen de lo asociado.
        </p>
      </AyudaFormulario>

      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}

      {periodos.length === 0 ? (
        <InlineMensaje tipo="info">No hay materias archivadas.</InlineMensaje>
      ) : (
        <ul className="lista lista-items">
          {periodos.map((periodo) => (
            <li key={periodo._id}>
              <div className="item-glass">
                <div className="item-row">
                  <div>
                    <div className="item-title" title={periodo._id}>
                      {etiquetaMateria(periodo)}
                    </div>
                    <div className="item-meta">
                      <span>ID: {idCortoMateria(periodo._id)}</span>
                      <span>Creada: {formatearFechaHora(periodo.createdAt)}</span>
                      <span>Archivada: {formatearFechaHora(periodo.archivadoEn)}</span>
                    </div>
                    {periodo.resumenArchivado && (
                      <div className="item-sub">
                        Resumen: alumnos {periodo.resumenArchivado.alumnos ?? 0}, banco {periodo.resumenArchivado.bancoPreguntas ?? 0},
                        plantillas {periodo.resumenArchivado.plantillas ?? 0}, generados {periodo.resumenArchivado.examenesGenerados ?? 0},
                        calificaciones {periodo.resumenArchivado.calificaciones ?? 0}, codigos {periodo.resumenArchivado.codigosAcceso ?? 0}
                      </div>
                    )}
                  </div>
                  <div className="item-actions">
                    <Boton
                      variante="secundario"
                      type="button"
                      icono={<Icono nombre="alerta" />}
                      cargando={borrandoId === periodo._id}
                      onClick={() => borrarMateria(periodo)}
                    >
                      Borrar definitivamente
                    </Boton>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeccionAlumnos({
  alumnos,
  periodosActivos,
  periodosTodos,
  onRefrescar
}: {
  alumnos: Alumno[];
  periodosActivos: Periodo[];
  periodosTodos: Periodo[];
  onRefrescar: () => void;
}) {
  const [matricula, setMatricula] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [correoAuto, setCorreoAuto] = useState(true);
  const [grupo, setGrupo] = useState('');
  const [periodoIdNuevo, setPeriodoIdNuevo] = useState('');
  const [periodoIdLista, setPeriodoIdLista] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  function normalizarMatricula(valor: string): string {
    return String(valor || '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
  }

  const matriculaNormalizada = useMemo(() => normalizarMatricula(matricula), [matricula]);
  const matriculaValida = useMemo(() => {
    if (!matricula.trim()) return true;
    return /^CUH\d{9}$/.test(matriculaNormalizada);
  }, [matricula, matriculaNormalizada]);

  const dominiosPermitidos = obtenerDominiosCorreoPermitidosFrontend();
  const politicaDominiosTexto = dominiosPermitidos.length > 0 ? textoDominiosPermitidos(dominiosPermitidos) : '';
  const correoValido = !correo.trim() || esCorreoDeDominioPermitidoFrontend(correo, dominiosPermitidos);

  useEffect(() => {
    if (!Array.isArray(periodosActivos) || periodosActivos.length === 0) return;
    if (!periodoIdLista) setPeriodoIdLista(periodosActivos[0]._id);
  }, [periodosActivos, periodoIdLista]);

  const puedeCrear = Boolean(
    matricula.trim() &&
      matriculaValida &&
      nombres.trim() &&
      apellidos.trim() &&
      periodoIdNuevo &&
      correoValido &&
      !editandoId
  );

  const puedeGuardarEdicion = Boolean(
    editandoId && matricula.trim() && matriculaValida && nombres.trim() && apellidos.trim() && periodoIdNuevo && correoValido
  );

  const alumnosDeMateria = useMemo(() => {
    const lista = Array.isArray(alumnos) ? alumnos : [];
    if (!periodoIdLista) return [];
    return lista
      .filter((a) => a.periodoId === periodoIdLista)
      .sort((a, b) => String(a.matricula).localeCompare(String(b.matricula)));
  }, [alumnos, periodoIdLista]);

  const nombreMateriaSeleccionada = useMemo(() => {
    if (!periodoIdLista) return '';
    const periodo = periodosTodos.find((p) => p._id === periodoIdLista);
    return periodo ? etiquetaMateria(periodo) : '';
  }, [periodosTodos, periodoIdLista]);

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
        matricula: matriculaNormalizada,
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        ...(correo.trim() ? { correo: correo.trim() } : {}),
        ...(grupo.trim() ? { grupo: grupo.trim() } : {}),
        periodoId: periodoIdNuevo
      });
      setMensaje('Alumno creado');
      emitToast({ level: 'ok', title: 'Alumnos', message: 'Alumno creado', durationMs: 2200 });
      registrarAccionDocente('crear_alumno', true, Date.now() - inicio);
      setMatricula('');
      setNombres('');
      setApellidos('');
      setCorreo('');
      setCorreoAuto(true);
      setGrupo('');
      setPeriodoIdNuevo('');
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

  function iniciarEdicion(alumno: Alumno) {
    setMensaje('');
    setEditandoId(alumno._id);
    setMatricula(alumno.matricula || '');
    setNombres(alumno.nombres || '');
    setApellidos(alumno.apellidos || '');
    setGrupo(alumno.grupo || '');
    setCorreoAuto(false);
    setCorreo(alumno.correo || (alumno.matricula ? `${normalizarMatricula(alumno.matricula)}@cuh.mx` : ''));
    setPeriodoIdNuevo(alumno.periodoId || '');
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setMensaje('');
    setMatricula('');
    setNombres('');
    setApellidos('');
    setCorreo('');
    setCorreoAuto(true);
    setGrupo('');
    setPeriodoIdNuevo('');
  }

  async function guardarEdicion() {
    if (!editandoId) return;

    try {
      const inicio = Date.now();
      if (dominiosPermitidos.length > 0 && correo.trim() && !correoValido) {
        const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
        registrarAccionDocente('editar_alumno', false);
        return;
      }

      setGuardandoEdicion(true);
      setMensaje('');
      await clienteApi.enviar(`/alumnos/${editandoId}/actualizar`, {
        matricula: matriculaNormalizada,
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        ...(correo.trim() ? { correo: correo.trim() } : {}),
        ...(grupo.trim() ? { grupo: grupo.trim() } : {}),
        periodoId: periodoIdNuevo
      });

      setMensaje('Alumno actualizado');
      emitToast({ level: 'ok', title: 'Alumnos', message: 'Alumno actualizado', durationMs: 2200 });
      registrarAccionDocente('editar_alumno', true, Date.now() - inicio);
      setEditandoId(null);
      setMatricula('');
      setNombres('');
      setApellidos('');
      setCorreo('');
      setCorreoAuto(true);
      setGrupo('');
      setPeriodoIdNuevo('');
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo actualizar el alumno');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo actualizar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('editar_alumno', false);
    } finally {
      setGuardandoEdicion(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="alumnos" /> Alumnos
      </h2>
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> registrar alumnos dentro de una materia para poder generar examenes, vincular folios y publicar resultados.
        </p>
        <ul className="lista">
          <li>
            <b>Matricula:</b> identificador del alumno con formato <code>CUH#########</code> (ej. <code>CUH512410168</code>).
          </li>
          <li>
            <b>Nombres/Apellidos:</b> como aparecen en lista oficial.
          </li>
          <li>
            <b>Correo:</b> opcional; si existe politica institucional, debe ser del dominio permitido.
          </li>
          <li>
            <b>Grupo:</b> opcional (ej. <code>3A</code>).
          </li>
          <li>
            <b>Materia:</b> obligatorio; selecciona la materia correspondiente.
          </li>
        </ul>
        <p>
          Ejemplo completo: matricula <code>CUH512410168</code>, nombres <code>Ana Maria</code>, apellidos <code>Gomez Ruiz</code>, grupo <code>3A</code>.
        </p>
      </AyudaFormulario>
      {editandoId && (
        <InlineMensaje tipo="info">
          Editando alumno. Modifica los campos y pulsa &quot;Guardar cambios&quot;.
        </InlineMensaje>
      )}
      <label className="campo">
        Matricula
        <input
          value={matricula}
          onChange={(event) => {
            const valor = event.target.value;
            setMatricula(valor);
            if (correoAuto) {
              const m = normalizarMatricula(valor);
              setCorreo(m ? `${m}@cuh.mx` : '');
            }
          }}
        />
        <span className="ayuda">Formato: CUH######### (ej. CUH512410168).</span>
      </label>
      {matricula.trim() && !matriculaValida && (
        <InlineMensaje tipo="error">Matricula invalida. Usa el formato CUH#########.</InlineMensaje>
      )}
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
        <input
          value={correo}
          onChange={(event) => {
            setCorreoAuto(false);
            setCorreo(event.target.value);
          }}
        />
        {correoAuto && matriculaNormalizada && (
          <span className="ayuda">Sugerido automaticamente: {matriculaNormalizada}@cuh.mx</span>
        )}
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
        Materia
        <select value={periodoIdNuevo} onChange={(event) => setPeriodoIdNuevo(event.target.value)}>
          <option value="">Selecciona</option>
          {periodosActivos.map((periodo) => (
            <option key={periodo._id} value={periodo._id} title={periodo._id}>
              {etiquetaMateria(periodo)}
            </option>
          ))}
        </select>
      </label>
      <div className="acciones">
        {!editandoId ? (
          <Boton type="button" icono={<Icono nombre="nuevo" />} cargando={creando} disabled={!puedeCrear} onClick={crearAlumno}>
            {creando ? 'Creando…' : 'Crear alumno'}
          </Boton>
        ) : (
          <>
            <Boton
              type="button"
              icono={<Icono nombre="ok" />}
              cargando={guardandoEdicion}
              disabled={!puedeGuardarEdicion}
              onClick={guardarEdicion}
            >
              {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
            <Boton variante="secundario" type="button" onClick={cancelarEdicion}>
              Cancelar
            </Boton>
          </>
        )}
      </div>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
      <h3>Alumnos de la materia</h3>
      <label className="campo">
        Materia seleccionada
        <select value={periodoIdLista} onChange={(event) => setPeriodoIdLista(event.target.value)}>
          <option value="">Selecciona</option>
          {periodosTodos
            .filter((p) => p.activo !== false)
            .map((periodo) => (
              <option key={periodo._id} value={periodo._id} title={periodo._id}>
                {etiquetaMateria(periodo)}
              </option>
            ))}
        </select>
        {Boolean(nombreMateriaSeleccionada) && (
          <span className="ayuda">Mostrando todos los alumnos de: {nombreMateriaSeleccionada}</span>
        )}
      </label>
      <ul className="lista lista-items">
        {!periodoIdLista && <li>Selecciona una materia para ver sus alumnos.</li>}
        {periodoIdLista && alumnosDeMateria.length === 0 && <li>No hay alumnos registrados en esta materia.</li>}
        {periodoIdLista &&
          alumnosDeMateria.map((alumno) => (
            <li key={alumno._id}>
              <div className="item-glass">
                <div className="item-row">
                  <div>
                    <div className="item-title">
                      {alumno.matricula} - {alumno.nombreCompleto}
                    </div>
                    <div className="item-meta">
                      <span>ID: {idCortoMateria(alumno._id)}</span>
                      <span>Grupo: {alumno.grupo ? alumno.grupo : '-'}</span>
                      <span>Correo: {alumno.correo ? alumno.correo : '-'}</span>
                    </div>
                  </div>
                  <div className="item-actions">
                    <Boton variante="secundario" type="button" onClick={() => iniciarEdicion(alumno)}>
                      Editar
                    </Boton>
                  </div>
                </div>
              </div>
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
  const [temasSeleccionados, setTemasSeleccionados] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [plantillaId, setPlantillaId] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [mensajeGeneracion, setMensajeGeneracion] = useState('');
  const [creando, setCreando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const preguntasDisponibles = useMemo(() => {
    if (!periodoId) return [];
    const lista = Array.isArray(preguntas) ? preguntas : [];
    return lista.filter((p) => p.periodoId === periodoId);
  }, [preguntas, periodoId]);

  const temasDisponibles = useMemo(() => {
    const mapa = new Map<string, { tema: string; total: number }>();
    for (const pregunta of preguntasDisponibles) {
      const tema = String(pregunta.tema ?? '').trim().replace(/\s+/g, ' ');
      if (!tema) continue;
      const key = tema.toLowerCase();
      const actual = mapa.get(key);
      if (actual) {
        actual.total += 1;
      } else {
        mapa.set(key, { tema, total: 1 });
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.tema.localeCompare(b.tema));
  }, [preguntasDisponibles]);

  const totalDisponiblePorTemas = useMemo(() => {
    if (temasSeleccionados.length === 0) return 0;
    const seleccion = new Set(temasSeleccionados.map((t) => t.toLowerCase()));
    return temasDisponibles
      .filter((t) => seleccion.has(t.tema.toLowerCase()))
      .reduce((acc, item) => acc + item.total, 0);
  }, [temasDisponibles, temasSeleccionados]);

  useEffect(() => {
    setTemasSeleccionados([]);
  }, [periodoId]);

  const puedeCrear = Boolean(
    titulo.trim() &&
      periodoId &&
      temasSeleccionados.length > 0 &&
      totalReactivos > 0 &&
      totalReactivos <= totalDisponiblePorTemas
  );
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
        temas: temasSeleccionados
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
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> crear una plantilla de examen (estructura + reactivos) para generar examenes en PDF.
        </p>
        <ul className="lista">
          <li>
            <b>Titulo:</b> nombre descriptivo (ej. <code>Parcial 1 - Algebra</code>).
          </li>
          <li>
            <b>Tipo:</b> <code>parcial</code> o <code>global</code> (afecta campos de calificacion).
          </li>
          <li>
            <b>Materia:</b> la materia a la que pertenece.
          </li>
          <li>
            <b>Total reactivos:</b> numero de preguntas del examen (entero mayor o igual a 1).
          </li>
          <li>
            <b>Temas:</b> selecciona uno o mas; el examen toma preguntas al azar de esos temas.
          </li>
        </ul>
        <p>
          Ejemplo: titulo <code>Parcial 1 - Programacion</code>, tipo <code>parcial</code>, total reactivos <code>10</code>, temas: <code>Arreglos</code> + <code>Funciones</code>.
        </p>
      </AyudaFormulario>
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
        Materia
        <select value={periodoId} onChange={(event) => setPeriodoId(event.target.value)}>
          <option value="">Selecciona</option>
          {periodos.map((periodo) => (
            <option key={periodo._id} value={periodo._id} title={periodo._id}>
              {etiquetaMateria(periodo)}
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
        Temas
        {periodoId && temasDisponibles.length === 0 && (
          <span className="ayuda">No hay temas para esta materia. Ve a &quot;Banco&quot; y crea preguntas con tema.</span>
        )}
        {temasDisponibles.length > 0 && (
          <ul className="lista lista-items">
            {temasDisponibles.map((item) => {
              const checked = temasSeleccionados.some((t) => t.toLowerCase() === item.tema.toLowerCase());
              return (
                <li key={item.tema}>
                  <div className="item-glass">
                    <div className="item-row">
                      <div>
                        <div className="item-title">{item.tema}</div>
                        <div className="item-sub">Preguntas disponibles: {item.total}</div>
                      </div>
                      <div className="item-actions">
                        <label className="campo campo-inline">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setTemasSeleccionados((prev) =>
                                checked
                                  ? prev.filter((t) => t.toLowerCase() !== item.tema.toLowerCase())
                                  : [...prev, item.tema]
                              );
                            }}
                          />
                          Usar
                        </label>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {temasSeleccionados.length > 0 && (
          <span className="ayuda">
            Total disponible en temas seleccionados: {totalDisponiblePorTemas}. Reactivos solicitados: {Math.max(1, Math.floor(totalReactivos))}.
          </span>
        )}
        {temasSeleccionados.length > 0 && totalReactivos > totalDisponiblePorTemas && (
          <span className="ayuda error">No hay suficientes preguntas en esos temas para cubrir el total de reactivos.</span>
        )}
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
      <ul className="lista lista-items">
        {plantillas.map((plantilla) => {
          const materia = periodos.find((p) => p._id === plantilla.periodoId);
          const temas = Array.isArray(plantilla.temas) ? plantilla.temas : [];
          const modo = temas.length > 0 ? `Temas: ${temas.join(', ')}` : 'Modo legacy: preguntasIds';
          return (
            <li key={plantilla._id}>
              <div className="item-glass">
                <div className="item-row">
                  <div>
                    <div className="item-title">{plantilla.titulo}</div>
                    <div className="item-meta">
                      <span>ID: {idCortoMateria(plantilla._id)}</span>
                      <span>Tipo: {plantilla.tipo}</span>
                      <span>Reactivos: {plantilla.totalReactivos}</span>
                      <span>Materia: {materia ? etiquetaMateria(materia) : '-'}</span>
                    </div>
                    <div className="item-sub">{modo}</div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <h3>Generar examen</h3>
      <AyudaFormulario titulo="Generar examen (PDF)">
        <p>
          <b>Proposito:</b> crear un examen en PDF con <b>folio</b> y <b>QR por pagina</b>. Ese folio se usa para recepcion, escaneo OMR y calificacion.
        </p>
        <ul className="lista">
          <li>
            <b>Plantilla:</b> obligatoria.
          </li>
          <li>
            <b>Alumno:</b> opcional; si lo eliges, el examen queda asociado desde el inicio.
          </li>
        </ul>
        <p>
          Ejemplo: plantilla <code>Parcial 1 - Algebra</code>, alumno <code>2024-001 - Ana Maria Gomez Ruiz</code>.
        </p>
      </AyudaFormulario>
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
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> vincular el folio del examen entregado (papel) con el alumno correcto. Esto evita errores al calificar.
        </p>
        <ul className="lista">
          <li>
            <b>Folio:</b> copialo exactamente del examen (o del QR).
          </li>
          <li>
            <b>Alumno:</b> selecciona al alumno que entrego ese examen.
          </li>
        </ul>
        <p>
          Ejemplo: folio <code>FOLIO-000123</code> y alumno <code>2024-001 - Ana Maria</code>.
        </p>
      </AyudaFormulario>
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
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> analizar una imagen de la hoja para detectar QR/folio y respuestas (OMR). Luego puedes ajustar respuestas manualmente.
        </p>
        <ul className="lista">
          <li>
            <b>Folio:</b> debe coincidir con el examen generado.
          </li>
          <li>
            <b>Pagina:</b> inicia en 1 (P1). Usa 2, 3, etc. si analizas mas paginas.
          </li>
          <li>
            <b>Imagen:</b> foto/escaneo nitido, sin recortes y con buena luz.
          </li>
        </ul>
        <p>
          Ejemplo: folio <code>FOLIO-000123</code>, pagina <code>1</code>, imagen <code>hoja1.jpg</code>.
        </p>
        <p>
          Tips: evita sombras; mantén la hoja recta; incluye el QR completo.
        </p>
      </AyudaFormulario>
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
          <ul className="lista lista-items">
            {respuestas.map((item, idx) => (
              <li key={item.numeroPregunta}>
                <div className="item-glass">
                  <div className="item-row">
                    <div>
                      <div className="item-title">Pregunta {item.numeroPregunta}</div>
                      <div className="item-sub">Confianza: {Math.round(item.confianza * 100)}%</div>
                    </div>
                    <div className="item-actions">
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
                    </div>
                  </div>
                </div>
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
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> guardar la calificacion del examen ya identificado por folio/OMR.
          Esta seccion usa el examen y alumno detectados en &quot;Escaneo OMR&quot;.
        </p>
        <ul className="lista">
          <li>
            <b>Bono:</b> ajuste extra (0 a 0.5).
          </li>
          <li>
            <b>Evaluacion continua:</b> puntaje adicional para parciales.
          </li>
          <li>
            <b>Proyecto:</b> puntaje adicional para global.
          </li>
        </ul>
        <p>
          Ejemplo: bono <code>0.2</code>, evaluacion continua <code>1</code>, proyecto <code>0</code>.
        </p>
      </AyudaFormulario>
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
      <AyudaFormulario titulo="Para que sirve y como llenarlo">
        <p>
          <b>Proposito:</b> enviar los resultados de la materia al portal alumno y emitir un codigo de acceso para consulta.
        </p>
        <ul className="lista">
          <li>
            <b>Materia:</b> selecciona la materia a publicar.
          </li>
          <li>
            <b>Publicar:</b> sincroniza resultados de la materia hacia el portal.
          </li>
          <li>
            <b>Generar codigo:</b> crea un codigo temporal; compartelo con alumnos junto con su matricula.
          </li>
        </ul>
        <p>
          Ejemplo de mensaje a alumnos: &quot;Tu codigo es <code>ABC123</code>. Entra al portal y usa tu matricula <code>2024-001</code>.&quot;
        </p>
      </AyudaFormulario>
      <label className="campo">
        Materia
        <select value={periodoId} onChange={(event) => setPeriodoId(event.target.value)}>
          <option value="">Selecciona</option>
          {periodos.map((periodo) => (
            <option key={periodo._id} value={periodo._id} title={periodo._id}>
              {etiquetaMateria(periodo)}
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
