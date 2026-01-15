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
import { Icono, Spinner } from '../../ui/iconos';

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
          <p className="mensaje" role="status">
            <Spinner /> Cargando datos…
          </p>
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
        <p className="eyebrow">
          <Icono nombre="docente" /> Plataforma Docente
        </p>
        {docente && (
          <button
            className="boton secundario"
            type="button"
            onClick={() => {
              limpiarTokenDocente();
              setDocente(null);
            }}
          >
            <Icono nombre="salir" /> Salir
          </button>
        )}
      </div>
      {docente && (
        <p className="mensaje" role="status">
          <Icono nombre="ok" /> Sesion: {docente.nombreCompleto} ({docente.correo})
        </p>
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

  async function ingresar() {
    try {
      const respuesta = await clienteApi.enviar<{ token: string }>('/autenticacion/ingresar', { correo, contrasena });
      onIngresar(respuesta.token);
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo ingresar'));
    }
  }

  async function registrar() {
    try {
      const respuesta = await clienteApi.enviar<{ token: string }>('/autenticacion/registrar', {
        nombreCompleto,
        correo,
        contrasena
      });
      onIngresar(respuesta.token);
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo registrar'));
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
        <button
          className="boton"
          type="button"
          disabled={modo === 'ingresar' ? !puedeIngresar : !puedeRegistrar}
          onClick={modo === 'ingresar' ? ingresar : registrar}
        >
          {modo === 'ingresar' ? (
            <>
              <Icono nombre="entrar" /> Ingresar
            </>
          ) : (
            <>
              <Icono nombre="nuevo" /> Crear cuenta
            </>
          )}
        </button>
      </div>
      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          <Icono nombre={esMensajeError(mensaje) ? 'alerta' : 'ok'} />
          {mensaje}
        </p>
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

  const puedeGuardar = Boolean(
    enunciado.trim() &&
      tema.trim() &&
      opciones.every((opcion) => opcion.texto.trim()) &&
      opciones.some((opcion) => opcion.esCorrecta)
  );

  async function guardar() {
    try {
      await clienteApi.enviar('/banco-preguntas', { enunciado, tema, opciones });
      setMensaje('Pregunta guardada');
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
      setMensaje(mensajeDeError(error, 'No se pudo guardar'));
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
      <button className="boton" type="button" disabled={!puedeGuardar} onClick={guardar}>
        <Icono nombre="ok" /> Guardar
      </button>
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

  const puedeCrear = Boolean(nombre.trim());

  async function crearPeriodo() {
    try {
      await clienteApi.enviar('/periodos', {
        nombre,
        fechaInicio,
        fechaFin,
        grupos: grupos ? grupos.split(',').map((item) => item.trim()) : []
      });
      setMensaje('Periodo creado');
      onRefrescar();
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo crear el periodo'));
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
      <label className="campo">
        Grupos (separados por coma)
        <input value={grupos} onChange={(event) => setGrupos(event.target.value)} />
      </label>
      <button className="boton" type="button" disabled={!puedeCrear} onClick={crearPeriodo}>
        <Icono nombre="nuevo" /> Crear periodo
      </button>
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

  const puedeCrear = Boolean(matricula.trim() && nombreCompleto.trim() && periodoId);

  async function crearAlumno() {
    try {
      await clienteApi.enviar('/alumnos', {
        matricula,
        nombreCompleto,
        correo,
        grupo,
        periodoId
      });
      setMensaje('Alumno creado');
      onRefrescar();
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo crear el alumno'));
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
      <button className="boton" type="button" disabled={!puedeCrear} onClick={crearAlumno}>
        <Icono nombre="nuevo" /> Crear alumno
      </button>
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

  const puedeCrear = Boolean(titulo.trim() && periodoId && seleccion.length > 0 && totalReactivos > 0);
  const puedeGenerar = Boolean(plantillaId);

  async function crear() {
    try {
      await clienteApi.enviar('/examenes/plantillas', {
        periodoId,
        tipo,
        titulo,
        totalReactivos,
        preguntasIds: seleccion
      });
      setMensaje('Plantilla creada');
      onRefrescar();
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo crear'));
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
      <button className="boton" type="button" disabled={!puedeCrear} onClick={crear}>
        <Icono nombre="nuevo" /> Crear plantilla
      </button>
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
      <button
        className="boton"
        type="button"
        disabled={!puedeGenerar}
        onClick={async () => {
          try {
            await clienteApi.enviar('/examenes/generados', { plantillaId, alumnoId: alumnoId || undefined });
            setMensajeGeneracion('Examen generado');
          } catch (error) {
            setMensajeGeneracion(mensajeDeError(error, 'No se pudo generar'));
          }
        }}
      >
        <Icono nombre="pdf" /> Generar
      </button>
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

  const puedeVincular = Boolean(folio.trim() && alumnoId);

  async function vincular() {
    try {
      await onVincular(folio, alumnoId);
      setMensaje('Entrega vinculada');
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo vincular'));
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
      <button className="boton" type="button" disabled={!puedeVincular} onClick={vincular}>
        <Icono nombre="recepcion" /> Vincular
      </button>
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
      await onAnalizar(folio, numeroPagina, imagenBase64);
      setMensaje('Analisis completado');
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo analizar'));
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
      <button className="boton" type="button" disabled={!puedeAnalizar} onClick={analizar}>
        <Icono nombre="escaneo" /> Analizar
      </button>
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

  const puedeCalificar = Boolean(examenId && alumnoId);

  async function calificar() {
    if (!examenId || !alumnoId) {
      setMensaje('Falta examen o alumno');
      return;
    }
    try {
      await onCalificar({
        examenGeneradoId: examenId,
        alumnoId,
        bonoSolicitado: bono,
        evaluacionContinua,
        proyecto,
        respuestasDetectadas
      });
      setMensaje('Calificacion guardada');
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo calificar'));
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
      <button className="boton" type="button" disabled={!puedeCalificar} onClick={calificar}>
        <Icono nombre="calificar" /> Calificar
      </button>
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

  const puedeAccionar = Boolean(periodoId);

  async function publicar() {
    try {
      await onPublicar(periodoId);
      setMensaje('Resultados publicados');
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo publicar'));
    }
  }

  async function generarCodigo() {
    try {
      const respuesta = await onCodigo(periodoId);
      setCodigo(respuesta.codigo ?? '');
      setExpiraEn(respuesta.expiraEn ?? '');
    } catch (error) {
      setMensaje(mensajeDeError(error, 'No se pudo generar codigo'));
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
        <button className="boton" type="button" disabled={!puedeAccionar} onClick={publicar}>
          <Icono nombre="publicar" /> Publicar
        </button>
        <button className="boton secundario" type="button" disabled={!puedeAccionar} onClick={generarCodigo}>
          <Icono nombre="info" /> Generar codigo
        </button>
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
