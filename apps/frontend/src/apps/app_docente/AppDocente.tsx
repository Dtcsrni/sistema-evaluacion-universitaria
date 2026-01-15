/**
 * App docente: panel basico para banco, examenes, recepcion, escaneo y calificacion.
 */
import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  crearClienteApi,
  ErrorRemoto,
  guardarTokenDocente,
  limpiarTokenDocente,
  obtenerTokenDocente
} from '../../servicios_api/clienteApi';
import { emitToast } from '../../ui/toast/toastBus';
import { Icono, Spinner } from '../../ui/iconos';
import { Boton } from '../../ui/ux/componentes/Boton';
import { InlineMensaje } from '../../ui/ux/componentes/InlineMensaje';
import { obtenerSessionId } from '../../ui/ux/sesion';

const clienteApi = crearClienteApi();

type Docente = { id: string; nombreCompleto: string; correo: string };

type Alumno = { _id: string; matricula: string; nombreCompleto: string; grupo?: string };

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

function esMensajeError(texto: string) {
  const lower = texto.toLowerCase();
  return lower.includes('no se pudo') || lower.includes('falta') || lower.includes('inval') || lower.includes('error');
}

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
        { id: 'publicar', label: 'Publicar', icono: 'publicar' as const }
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
    if (!obtenerTokenDocente()) return;
    clienteApi
      .obtener<{ docente: Docente }>('/autenticacion/perfil')
      .then((payload) => setDocente(payload.docente))
      .catch(() => setDocente(null));
  }, []);

  // Sesion de UI (no sensible) para analiticas best-effort.
  useEffect(() => {
    if (!obtenerTokenDocente()) return;
    obtenerSessionId('sesionDocenteId');
  }, []);

  useEffect(() => {
    if (!docente) return;
    setCargandoDatos(true);
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
      .finally(() => setCargandoDatos(false));
  }, [docente]);

  const contenido = docente ? (
    <div className="panel">
      <nav
        className="tabs"
        aria-label="Secciones del portal docente"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
            return;
          }
          event.preventDefault();

          const idxActual = Math.max(
            0,
            itemsVista.findIndex((item) => item.id === vista)
          );
          const ultimo = itemsVista.length - 1;
          let idxNuevo = idxActual;

          if (event.key === 'ArrowLeft') idxNuevo = Math.max(0, idxActual - 1);
          if (event.key === 'ArrowRight') idxNuevo = Math.min(ultimo, idxActual + 1);
          if (event.key === 'Home') idxNuevo = 0;
          if (event.key === 'End') idxNuevo = ultimo;

          const nuevoId = itemsVista[idxNuevo]?.id;
          if (!nuevoId) return;
          setVista(nuevoId);
          requestAnimationFrame(() => tabsRef.current[idxNuevo]?.focus());
        }}
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
            const detalle = await clienteApi.obtener<{ examen: any }>(`/examenes/generados/folio/${folio}`);
            setExamenAlumnoId(detalle.examen.alumnoId ?? null);
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
            onClick={() => {
              limpiarTokenDocente();
              setDocente(null);
              emitToast({ level: 'info', title: 'Sesion', message: 'Sesion cerrada', durationMs: 2200 });
              void clienteApi.registrarEventosUso({
                eventos: [
                  {
                    sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined,
                    pantalla: 'docente',
                    accion: 'logout',
                    exito: true
                  }
                ]
              });
            }}
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
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [modo, setModo] = useState<'ingresar' | 'registrar'>('ingresar');
  const [enviando, setEnviando] = useState(false);

  const obtenerSesionId = () => obtenerSessionId('sesionDocenteId');

  async function ingresar() {
    try {
      const inicio = Date.now();
      setEnviando(true);
      const respuesta = await clienteApi.enviar<{ token: string }>('/autenticacion/ingresar', { correo, contrasena });
      onIngresar(respuesta.token);
      emitToast({ level: 'ok', title: 'Sesion', message: 'Bienvenido/a', durationMs: 2200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: obtenerSesionId(), pantalla: 'docente', accion: 'login', exito: true, duracionMs: Date.now() - inicio }]
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo ingresar');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo ingresar', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: obtenerSesionId(), pantalla: 'docente', accion: 'login', exito: false }]
      });
    } finally {
      setEnviando(false);
    }
  }

  async function registrar() {
    try {
      const inicio = Date.now();
      setEnviando(true);
      const respuesta = await clienteApi.enviar<{ token: string }>('/autenticacion/registrar', {
        nombreCompleto,
        correo,
        contrasena
      });
      onIngresar(respuesta.token);
      emitToast({ level: 'ok', title: 'Cuenta creada', message: 'Sesion iniciada', durationMs: 2800 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: obtenerSesionId(), pantalla: 'docente', accion: 'registrar', exito: true, duracionMs: Date.now() - inicio }]
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo registrar');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo registrar', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: obtenerSesionId(), pantalla: 'docente', accion: 'registrar', exito: false }]
      });
    } finally {
      setEnviando(false);
    }
  }

  const puedeIngresar = Boolean(correo.trim() && contrasena.trim());
  const puedeRegistrar = Boolean(nombreCompleto.trim() && correo.trim() && contrasena.trim());

  return (
    <div className="panel">
      <h2>
        <Icono nombre="docente" /> Acceso docente
      </h2>
      <div className="acciones">
        <button
          className={modo === 'ingresar' ? 'boton' : 'boton secundario'}
          type="button"
          onClick={() => {
            setModo('ingresar');
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
            setMensaje('');
          }}
        >
          Registrar
        </button>
      </div>
      {modo === 'registrar' && (
        <label className="campo">
          Nombre completo
          <input value={nombreCompleto} onChange={(event) => setNombreCompleto(event.target.value)} autoComplete="name" />
        </label>
      )}
      <label className="campo">
        Correo
        <input type="email" value={correo} onChange={(event) => setCorreo(event.target.value)} autoComplete="email" />
      </label>
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
      </label>
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
      {mensaje && (
        <InlineMensaje tipo={esMensajeError(mensaje) ? 'error' : 'ok'}>{mensaje}</InlineMensaje>
      )}
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
      await clienteApi.enviar('/banco-preguntas', { enunciado, tema, opciones });
      setMensaje('Pregunta guardada');
      emitToast({ level: 'ok', title: 'Banco', message: 'Pregunta guardada', durationMs: 2200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'crear_pregunta', exito: true, duracionMs: Date.now() - inicio }]
      });
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
      emitToast({ level: 'error', title: 'No se pudo guardar', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'crear_pregunta', exito: false }]
      });
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
      await clienteApi.enviar('/periodos', {
        nombre,
        fechaInicio,
        fechaFin,
        grupos: grupos ? grupos.split(',').map((item) => item.trim()) : []
      });
      setMensaje('Periodo creado');
      emitToast({ level: 'ok', title: 'Periodos', message: 'Periodo creado', durationMs: 2200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'crear_periodo', exito: true, duracionMs: Date.now() - inicio }]
      });
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo crear el periodo');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo crear', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'crear_periodo', exito: false }]
      });
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
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [correo, setCorreo] = useState('');
  const [grupo, setGrupo] = useState('');
  const [periodoId, setPeriodoId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [creando, setCreando] = useState(false);

  const puedeCrear = Boolean(matricula.trim() && nombreCompleto.trim() && periodoId);

  async function crearAlumno() {
    try {
      const inicio = Date.now();
      setCreando(true);
      await clienteApi.enviar('/alumnos', {
        matricula,
        nombreCompleto,
        correo,
        grupo,
        periodoId
      });
      setMensaje('Alumno creado');
      emitToast({ level: 'ok', title: 'Alumnos', message: 'Alumno creado', durationMs: 2200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'crear_alumno', exito: true, duracionMs: Date.now() - inicio }]
      });
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo crear el alumno');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo crear', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'crear_alumno', exito: false }]
      });
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
        Nombre completo
        <input value={nombreCompleto} onChange={(event) => setNombreCompleto(event.target.value)} />
      </label>
      <label className="campo">
        Correo
        <input value={correo} onChange={(event) => setCorreo(event.target.value)} />
      </label>
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
      await clienteApi.enviar('/examenes/plantillas', {
        periodoId,
        tipo,
        titulo,
        totalReactivos,
        preguntasIds: seleccion
      });
      setMensaje('Plantilla creada');
      emitToast({ level: 'ok', title: 'Plantillas', message: 'Plantilla creada', durationMs: 2200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'crear_plantilla', exito: true, duracionMs: Date.now() - inicio }]
      });
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo crear');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo crear', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'crear_plantilla', exito: false }]
      });
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
            await clienteApi.enviar('/examenes/generados', { plantillaId, alumnoId: alumnoId || undefined });
            setMensajeGeneracion('Examen generado');
            emitToast({ level: 'ok', title: 'Examen', message: 'Examen generado', durationMs: 2200 });
            void clienteApi.registrarEventosUso({
              eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'generar_examen', exito: true, duracionMs: Date.now() - inicio }]
            });
          } catch (error) {
            const msg = mensajeDeError(error, 'No se pudo generar');
            setMensajeGeneracion(msg);
            emitToast({ level: 'error', title: 'No se pudo generar', message: msg, durationMs: 5200 });
            void clienteApi.registrarEventosUso({
              eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'generar_examen', exito: false }]
            });
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
      await onVincular(folio, alumnoId);
      setMensaje('Entrega vinculada');
      emitToast({ level: 'ok', title: 'Recepcion', message: 'Entrega vinculada', durationMs: 2200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'vincular_entrega', exito: true, duracionMs: Date.now() - inicio }]
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo vincular');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo vincular', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'vincular_entrega', exito: false }]
      });
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
      await onAnalizar(folio, numeroPagina, imagenBase64);
      setMensaje('Analisis completado');
      emitToast({ level: 'ok', title: 'Escaneo', message: 'Analisis completado', durationMs: 2200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'analizar_omr', exito: true, duracionMs: Date.now() - inicio }]
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo analizar');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo analizar', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'analizar_omr', exito: false }]
      });
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
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'calificar', exito: true, duracionMs: Date.now() - inicio }]
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo calificar');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo calificar', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'calificar', exito: false }]
      });
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
      await onPublicar(periodoId);
      setMensaje('Resultados publicados');
      emitToast({ level: 'ok', title: 'Publicacion', message: 'Resultados publicados', durationMs: 2800 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'publicar_resultados', exito: true, duracionMs: Date.now() - inicio }]
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo publicar');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo publicar', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'publicar_resultados', exito: false }]
      });
    } finally {
      setPublicando(false);
    }
  }

  async function generarCodigo() {
    try {
      const inicio = Date.now();
      setGenerando(true);
      const respuesta = await onCodigo(periodoId);
      setCodigo(respuesta.codigo ?? '');
      setExpiraEn(respuesta.expiraEn ?? '');
      emitToast({ level: 'ok', title: 'Codigo', message: 'Codigo generado', durationMs: 2200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'generar_codigo', exito: true, duracionMs: Date.now() - inicio }]
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo generar codigo');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo generar', message: msg, durationMs: 5200 });
      void clienteApi.registrarEventosUso({
        eventos: [{ sessionId: sessionStorage.getItem('sesionDocenteId') ?? undefined, pantalla: 'docente', accion: 'generar_codigo', exito: false }]
      });
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
