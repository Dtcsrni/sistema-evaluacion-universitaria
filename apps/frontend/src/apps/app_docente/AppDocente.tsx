/**
 * App docente: panel basico para banco, examenes, entrega y calificacion.
 */
import type { ChangeEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { TemaBoton } from '../../tema/TemaBoton';
import { tipoMensajeInline } from './mensajeInline';

const clienteApi = crearClienteApi();

const VISTAS_VALIDAS = new Set([
  'periodos',
  'periodos_archivados',
  'alumnos',
  'banco',
  'plantillas',
  'entrega',
  'calificaciones',
  'publicar',
  'cuenta'
]);

function obtenerVistaInicial(): string {
  if (typeof window === 'undefined') return 'periodos';
  const params = new URLSearchParams(window.location.search);
  const vista = String(params.get('vista') || '').trim();
  const alias: Record<string, string> = {
    recepcion: 'entrega',
    escaneo: 'calificaciones',
    calificar: 'calificaciones'
  };
  const normalizada = alias[vista] ?? vista;
  return VISTAS_VALIDAS.has(normalizada) ? normalizada : 'periodos';
}
const patronNombreMateria = /^[\p{L}\p{N}][\p{L}\p{N}\s\-_.()#&/]*$/u;

type Docente = {
  id: string;
  nombreCompleto: string;
  nombres?: string;
  apellidos?: string;
  correo: string;
  roles?: string[];
  permisos?: string[];
  tieneContrasena?: boolean;
  tieneGoogle?: boolean;
  preferenciasPdf?: {
    institucion?: string;
    lema?: string;
    logos?: { izquierdaPath?: string; derechaPath?: string };
  };
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
  createdAt?: string;
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
  numeroPaginas: number;
  // Legacy (deprecado): puede existir en plantillas antiguas.
  totalReactivos?: number;
  periodoId?: string;
  preguntasIds?: string[];
  temas?: string[];
  instrucciones?: string;
  createdAt?: string;
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

type RegistroSincronizacion = {
  _id?: string;
  estado?: 'pendiente' | 'exitoso' | 'fallido' | string;
  tipo?: string;
  detalles?: Record<string, unknown>;
  ejecutadoEn?: string;
  createdAt?: string;
};

type RespuestaSyncPush = {
  mensaje?: string;
  conteos?: Record<string, number>;
  cursor?: string | null;
  exportadoEn?: string;
};

type RespuestaSyncPull = {
  mensaje?: string;
  paquetesRecibidos?: number;
  ultimoCursor?: string | null;
  pdfsGuardados?: number;
};

function obtenerVersionPregunta(pregunta: Pregunta): Pregunta['versiones'][number] | null {
  const versiones = Array.isArray(pregunta.versiones) ? pregunta.versiones : [];
  if (versiones.length === 0) return null;
  const actual = versiones.find((v) => v.numeroVersion === pregunta.versionActual);
  return actual ?? versiones[versiones.length - 1] ?? null;
}

function pareceCodigo(texto: string): boolean {
  const t = String(texto ?? '');
  if (!t.trim()) return false;
  // Señales explícitas (markdown): inline/backticks o bloques.
  if (t.includes('```')) return true;
  if (t.includes('`')) return true;
  // Señales típicas de código (heurística conservadora).
  const lineas = t.split(/\r?\n/);
  if (lineas.some((l) => /^\s{2,}\S+/.test(l))) return true; // indentación
  if (/[{}();<>]=?>|=>|\/\*|\*\//.test(t)) return true;
  if (/\b(function|const|let|var|return|class|import|export)\b/.test(t)) return true;
  if (/\b(display\s*:\s*flex|justify-content\s*:\s*center|align-items\s*:\s*center|box-sizing\s*:\s*border-box)\b/.test(t)) return true;
  return false;
}

function preguntaTieneCodigo(pregunta: Pregunta): boolean {
  const v = obtenerVersionPregunta(pregunta);
  if (!v) return false;
  if (pareceCodigo(String(v.enunciado ?? ''))) return true;
  const ops = Array.isArray(v.opciones) ? v.opciones : [];
  return ops.some((o) => pareceCodigo(String(o?.texto ?? '')));
}

type ResultadoOmr = {
  respuestasDetectadas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>;
  advertencias: string[];
  qrTexto?: string;
};

type PermisosUI = {
  periodos: { leer: boolean; gestionar: boolean; archivar: boolean };
  alumnos: { leer: boolean; gestionar: boolean };
  banco: { leer: boolean; gestionar: boolean; archivar: boolean };
  plantillas: { leer: boolean; gestionar: boolean; archivar: boolean; previsualizar: boolean };
  examenes: { leer: boolean; generar: boolean; archivar: boolean; regenerar: boolean; descargar: boolean };
  entregas: { gestionar: boolean };
  omr: { analizar: boolean };
  calificaciones: { calificar: boolean };
  publicar: { publicar: boolean };
  sincronizacion: { listar: boolean; exportar: boolean; importar: boolean; push: boolean; pull: boolean };
  cuenta: { leer: boolean; actualizar: boolean };
};

type EnviarConPermiso = <T = unknown>(
  permiso: string,
  ruta: string,
  payload: unknown,
  mensaje: string,
  opciones?: { timeoutMs?: number }
) => Promise<T>;

type PreviewCalificacion = {
  aciertos: number;
  totalReactivos: number;
  calificacionExamenFinalTexto?: string;
  calificacionExamenTexto?: string;
  calificacionParcialTexto?: string;
  calificacionGlobalTexto?: string;
};

type ResultadoAnalisisOmr = {
  resultado: ResultadoOmr;
  examenId: string;
  folio: string;
  numeroPagina: number;
  alumnoId?: string | null;
};

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
    <div className="panel ayuda-formulario">
      <div className="ayuda-formulario__header">
        <h3 className="ayuda-formulario__title">
          <span className="ayuda-formulario__icon">
            <Icono nombre="info" />
          </span>
          <span>{titulo}</span>
        </h3>
        <div className="ayuda-formulario__chips" aria-hidden="true">
          <span className="ayuda-chip">
            <Icono nombre="ok" /> Paso
          </span>
          <span className="ayuda-chip">
            <Icono nombre="info" /> Tip
          </span>
          <span className="ayuda-chip">
            <Icono nombre="alerta" /> Validación
          </span>
        </div>
      </div>
      <div className="nota ayuda-formulario__body">{children}</div>
    </div>
  );
}

export function AppDocente() {
  const [docente, setDocente] = useState<Docente | null>(null);
  const [vista, setVista] = useState(obtenerVistaInicial());
  const esDev = import.meta.env.DEV;
  const esAdmin = Boolean(docente?.roles?.includes('admin'));
  const permisosDocente = useMemo(() => new Set(docente?.permisos ?? []), [docente?.permisos]);
  const puede = useCallback((permiso: string) => permisosDocente.has(permiso), [permisosDocente]);
  const permisosUI = useMemo(
    () => ({
      periodos: {
        leer: puede('periodos:leer'),
        gestionar: puede('periodos:gestionar'),
        archivar: puede('periodos:archivar')
      },
      alumnos: {
        leer: puede('alumnos:leer'),
        gestionar: puede('alumnos:gestionar')
      },
      banco: {
        leer: puede('banco:leer'),
        gestionar: puede('banco:gestionar'),
        archivar: puede('banco:archivar')
      },
      plantillas: {
        leer: puede('plantillas:leer'),
        gestionar: puede('plantillas:gestionar'),
        archivar: puede('plantillas:archivar'),
        previsualizar: puede('plantillas:previsualizar')
      },
      examenes: {
        leer: puede('examenes:leer'),
        generar: puede('examenes:generar'),
        archivar: puede('examenes:archivar'),
        regenerar: puede('examenes:regenerar'),
        descargar: puede('examenes:descargar')
      },
      entregas: { gestionar: puede('entregas:gestionar') },
      omr: { analizar: puede('omr:analizar') },
      calificaciones: { calificar: puede('calificaciones:calificar') },
      publicar: { publicar: puede('calificaciones:publicar') },
      sincronizacion: {
        listar: puede('sincronizacion:listar'),
        exportar: puede('sincronizacion:exportar'),
        importar: puede('sincronizacion:importar'),
        push: puede('sincronizacion:push'),
        pull: puede('sincronizacion:pull')
      },
      cuenta: { leer: puede('cuenta:leer'), actualizar: puede('cuenta:actualizar') }
    }),
    [puede]
  );
  const puedeEliminarPlantillaDev = esDev && esAdmin && puede('plantillas:eliminar_dev');
  const puedeEliminarMateriaDev = esDev && esAdmin && puede('periodos:eliminar_dev');
  const puedeEliminarAlumnoDev = esDev && esAdmin && puede('alumnos:eliminar_dev');
  const avisarSinPermiso = useCallback((mensaje: string) => {
    emitToast({ level: 'warn', title: 'Sin permisos', message: mensaje, durationMs: 4200 });
  }, []);
  const enviarConPermiso = useCallback(
    <T,>(
      permiso: string,
      ruta: string,
      payload: unknown,
      mensaje: string,
      opciones?: { timeoutMs?: number }
    ): Promise<T> => {
      if (!puede(permiso)) {
        avisarSinPermiso(mensaje);
        return Promise.reject(new Error('SIN_PERMISO'));
      }
      return clienteApi.enviar(ruta, payload, opciones);
    },
    [avisarSinPermiso, puede]
  );
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
  const [ultimaActualizacionDatos, setUltimaActualizacionDatos] = useState<number | null>(null);

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

  const itemsVista = useMemo(() => {
    const puedeCalificar = puede('calificaciones:calificar') || puede('omr:analizar');
    const puedePublicar = puede('sincronizacion:listar') || puede('calificaciones:publicar');
    const items = [
      { id: 'periodos', label: 'Materias', icono: 'periodos' as const, mostrar: puede('periodos:leer') },
      { id: 'alumnos', label: 'Alumnos', icono: 'alumnos' as const, mostrar: puede('alumnos:leer') },
      { id: 'banco', label: 'Banco', icono: 'banco' as const, mostrar: puede('banco:leer') },
      { id: 'plantillas', label: 'Plantillas', icono: 'plantillas' as const, mostrar: puede('plantillas:leer') },
      { id: 'entrega', label: 'Entrega', icono: 'recepcion' as const, mostrar: puede('entregas:gestionar') },
      { id: 'calificaciones', label: 'Calificaciones', icono: 'calificar' as const, mostrar: puedeCalificar },
      { id: 'publicar', label: 'Sincronización', icono: 'publicar' as const, mostrar: puedePublicar },
      { id: 'cuenta', label: 'Cuenta', icono: 'info' as const, mostrar: puede('cuenta:leer') }
    ];
    return items.filter((item) => item.mostrar);
  }, [puede]);

  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const montadoRef = useRef(true);

  // Nota UX: ocultamos el badge de estado API (no aporta al flujo docente).

  useEffect(() => {
    if (itemsVista.length === 0) return;
    const vistaBase = vista === 'periodos_archivados' ? 'periodos' : vista;
    if (!itemsVista.some((item) => item.id === vistaBase)) {
      setVista(itemsVista[0].id);
    }
  }, [itemsVista, vista]);

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

  const refrescarPerfil = useCallback(async () => {
    if (!obtenerTokenDocente()) return;
    try {
      const payload = await clienteApi.obtener<{ docente: Docente }>('/autenticacion/perfil');
      if (montadoRef.current) setDocente(payload.docente);
    } catch {
      // No interrumpir la sesion si falla el refresh.
    }
  }, []);

  useEffect(() => {
    const intervaloMs = 5 * 60 * 1000;
    const id = window.setInterval(() => {
      void refrescarPerfil();
    }, intervaloMs);
    return () => window.clearInterval(id);
  }, [refrescarPerfil]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refrescarPerfil();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refrescarPerfil]);

  // Sesion de UI (no sensible) para analiticas best-effort.
  useEffect(() => {
    if (!obtenerTokenDocente()) return;
    obtenerSessionId('sesionDocenteId');
  }, []);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const refrescarDatos = useCallback(async () => {
    if (!docente) return;
    if (montadoRef.current) setCargandoDatos(true);
    try {
      const tareas: Array<Promise<void>> = [];

      if (permisosUI.alumnos.leer) {
        tareas.push(
          clienteApi.obtener<{ alumnos: Alumno[] }>('/alumnos').then((al) => {
            if (montadoRef.current) setAlumnos(al.alumnos);
          })
        );
      } else {
        setAlumnos([]);
      }

      if (permisosUI.periodos.leer) {
        tareas.push(
          Promise.all([
            clienteApi.obtener<{ periodos?: Periodo[]; materias?: Periodo[] }>('/periodos?activo=1'),
            clienteApi.obtener<{ periodos?: Periodo[]; materias?: Periodo[] }>('/periodos?activo=0')
          ]).then(([peActivas, peArchivadas]) => {
            if (!montadoRef.current) return;
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
          })
        );
      } else {
        setPeriodos([]);
        setPeriodosArchivados([]);
      }

      if (permisosUI.plantillas.leer) {
        tareas.push(
          clienteApi.obtener<{ plantillas: Plantilla[] }>('/examenes/plantillas').then((pl) => {
            if (montadoRef.current) setPlantillas(pl.plantillas);
          })
        );
      } else {
        setPlantillas([]);
      }

      if (permisosUI.banco.leer) {
        tareas.push(
          clienteApi.obtener<{ preguntas: Pregunta[] }>('/banco-preguntas').then((pr) => {
            if (montadoRef.current) setPreguntas(pr.preguntas);
          })
        );
      } else {
        setPreguntas([]);
      }

      await Promise.all(tareas);
      setUltimaActualizacionDatos(Date.now());
    } finally {
      if (montadoRef.current) setCargandoDatos(false);
    }
  }, [docente, permisosUI.alumnos.leer, permisosUI.banco.leer, permisosUI.periodos.leer, permisosUI.plantillas.leer]);

  useEffect(() => {
    void refrescarDatos();
  }, [refrescarDatos]);

  function refrescarMaterias() {
    if (!permisosUI.periodos.leer) {
      setPeriodos([]);
      setPeriodosArchivados([]);
      return Promise.resolve();
    }
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
      setUltimaActualizacionDatos(Date.now());
    });
  }

  const contenido = docente ? (
    <div className="panel">
      <nav
        className="tabs tabs--scroll tabs--sticky"
        aria-label="Secciones del portal docente"
      >
        {itemsVista.map((item, idx) => (
          (() => {
            const activa = vista === item.id || (vista === 'periodos_archivados' && item.id === 'periodos');
            return (
          <button
            key={item.id}
            ref={(el) => {
              tabsRef.current[idx] = el;
            }}
            type="button"
            className={activa ? 'tab activa' : 'tab'}
            aria-current={activa ? 'page' : undefined}
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
            );
          })()
        ))}
      </nav>

      {cargandoDatos && (
        <div className="panel" aria-live="polite">
          <InlineMensaje tipo="info" leading={<Spinner />}>
            Cargando datos…
          </InlineMensaje>
        </div>
      )}

      {vista === 'banco' && (
        <SeccionBanco
          preguntas={preguntas}
          periodos={periodos}
          permisos={permisosUI}
          enviarConPermiso={enviarConPermiso}
          avisarSinPermiso={avisarSinPermiso}
          onRefrescar={() => {
            if (!permisosUI.banco.leer) {
              avisarSinPermiso('No tienes permiso para ver el banco.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.obtener<{ preguntas: Pregunta[] }>('/banco-preguntas').then((p) => setPreguntas(p.preguntas));
          }}
          onRefrescarPlantillas={() => {
            if (!permisosUI.plantillas.leer) {
              avisarSinPermiso('No tienes permiso para ver plantillas.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.obtener<{ plantillas: Plantilla[] }>('/examenes/plantillas').then((p) => setPlantillas(p.plantillas));
          }}
        />
      )}

      {vista === 'periodos' && (
        <SeccionPeriodos
          periodos={periodos}
          onRefrescar={refrescarMaterias}
          onVerArchivadas={() => setVista('periodos_archivados')}
          permisos={permisosUI}
          puedeEliminarMateriaDev={puedeEliminarMateriaDev}
          enviarConPermiso={enviarConPermiso}
          avisarSinPermiso={avisarSinPermiso}
        />
      )}

      {vista === 'periodos_archivados' && (
        <SeccionPeriodosArchivados
          periodos={periodosArchivados}
          onVerActivas={() => setVista('periodos')}
        />
      )}

      {vista === 'alumnos' && (
        <SeccionAlumnos
          alumnos={alumnos}
          periodosActivos={periodos}
          periodosTodos={[...periodos, ...periodosArchivados]}
          permisos={permisosUI}
          puedeEliminarAlumnoDev={puedeEliminarAlumnoDev}
          enviarConPermiso={enviarConPermiso}
          avisarSinPermiso={avisarSinPermiso}
          onRefrescar={() => {
            if (!permisosUI.alumnos.leer) {
              avisarSinPermiso('No tienes permiso para ver alumnos.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.obtener<{ alumnos: Alumno[] }>('/alumnos').then((p) => setAlumnos(p.alumnos));
          }}
        />
      )}

      {vista === 'plantillas' && (
        <SeccionPlantillas
          plantillas={plantillas}
          periodos={periodos}
          preguntas={preguntas}
          permisos={permisosUI}
          puedeEliminarPlantillaDev={puedeEliminarPlantillaDev}
          enviarConPermiso={enviarConPermiso}
          avisarSinPermiso={avisarSinPermiso}
          alumnos={alumnos}
          onRefrescar={() => {
            if (!permisosUI.plantillas.leer) {
              avisarSinPermiso('No tienes permiso para ver plantillas.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.obtener<{ plantillas: Plantilla[] }>('/examenes/plantillas').then((p) => setPlantillas(p.plantillas));
          }}
        />
      )}

      {vista === 'entrega' && (
        <SeccionEntrega
          alumnos={alumnos}
          periodos={periodos}
          permisos={permisosUI}
          avisarSinPermiso={avisarSinPermiso}
          enviarConPermiso={enviarConPermiso}
          onVincular={(folio, alumnoId) => {
            if (!permisosUI.entregas.gestionar) {
              avisarSinPermiso('No tienes permiso para vincular entregas.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.enviar('/entregas/vincular-folio', { folio, alumnoId });
          }}
        />
      )}

      {vista === 'calificaciones' && (
        <SeccionCalificaciones
          alumnos={alumnos}
          permisos={permisosUI}
          avisarSinPermiso={avisarSinPermiso}
          onAnalizar={async (folio, numeroPagina, imagenBase64) => {
            if (!permisosUI.omr.analizar) {
              avisarSinPermiso('No tienes permiso para analizar OMR.');
              throw new Error('SIN_PERMISO');
            }
            const respuesta = await clienteApi.enviar<ResultadoAnalisisOmr>('/omr/analizar', {
              folio,
              numeroPagina,
              imagenBase64
            });
            setResultadoOmr(respuesta.resultado);
            setRespuestasEditadas(respuesta.resultado.respuestasDetectadas);
            setExamenIdOmr(respuesta.examenId);
            setExamenAlumnoId(respuesta.alumnoId ?? null);
            return respuesta;
          }}
          onPrevisualizar={async (payload) => {
            if (!permisosUI.calificaciones.calificar) {
              avisarSinPermiso('No tienes permiso para calificar.');
              throw new Error('SIN_PERMISO');
            }
            return clienteApi.enviar<{ preview: PreviewCalificacion }>('/calificaciones/calificar', { ...payload, soloPreview: true });
          }}
          resultado={resultadoOmr}
          respuestas={respuestasEditadas}
          onActualizar={(nuevas) => setRespuestasEditadas(nuevas)}
          examenId={examenIdOmr}
          alumnoId={examenAlumnoId}
          onCalificar={(payload) => {
            if (!permisosUI.calificaciones.calificar) {
              avisarSinPermiso('No tienes permiso para calificar.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.enviar('/calificaciones/calificar', payload);
          }}
        />
      )}

      {vista === 'publicar' && (
        <SeccionSincronizacion
          periodos={periodos}
          periodosArchivados={periodosArchivados}
          alumnos={alumnos}
          plantillas={plantillas}
          preguntas={preguntas}
          ultimaActualizacionDatos={ultimaActualizacionDatos}
          docenteCorreo={docente?.correo}
          onPublicar={(periodoId) => {
            if (!permisosUI.publicar.publicar) {
              avisarSinPermiso('No tienes permiso para publicar resultados.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.enviar('/sincronizaciones/publicar', { periodoId });
          }}
          onCodigo={(periodoId) => {
            if (!permisosUI.publicar.publicar) {
              avisarSinPermiso('No tienes permiso para generar codigos.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.enviar<{ codigo?: string; expiraEn?: string }>('/sincronizaciones/codigo-acceso', { periodoId });
          }}
          onExportarPaquete={(payload) => {
            if (!permisosUI.sincronizacion.exportar) {
              avisarSinPermiso('No tienes permiso para exportar.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.enviar<{
              paqueteBase64: string;
              checksumSha256: string;
              checksumGzipSha256?: string;
              exportadoEn: string;
              conteos: Record<string, number>;
            }>('/sincronizaciones/paquete/exportar', payload);
          }}
          onImportarPaquete={(payload) =>
            (async () => {
              if (!permisosUI.sincronizacion.importar) {
                avisarSinPermiso('No tienes permiso para importar.');
                throw new Error('SIN_PERMISO');
              }
              const respuesta = await clienteApi.enviar<
                | { mensaje?: string; resultados?: unknown[]; pdfsGuardados?: number }
                | { mensaje?: string; checksumSha256?: string; conteos?: Record<string, number> }
              >('/sincronizaciones/paquete/importar', payload);
              if (!payload?.dryRun) {
                await refrescarDatos();
              }
              return respuesta;
            })()
          }
          onPushServidor={(payload) => {
            if (!permisosUI.sincronizacion.push) {
              avisarSinPermiso('No tienes permiso para enviar al servidor.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.enviar<RespuestaSyncPush>('/sincronizaciones/push', payload);
          }}
          onPullServidor={(payload) => {
            if (!permisosUI.sincronizacion.pull) {
              avisarSinPermiso('No tienes permiso para traer del servidor.');
              return Promise.reject(new Error('SIN_PERMISO'));
            }
            return clienteApi.enviar<RespuestaSyncPull>('/sincronizaciones/pull', payload);
          }}
        />
      )}

      {vista === 'cuenta' && (
        <SeccionCuenta
          docente={docente}
          onDocenteActualizado={setDocente}
          esAdmin={esAdmin}
          esDev={esDev}
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
        <div className="cabecera__acciones">
          <TemaBoton />
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
  const [cooldownHasta, setCooldownHasta] = useState<number | null>(null);
  const cooldownTimer = useRef<number | null>(null);
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
  const ahora = Date.now();
  const cooldownMs = cooldownHasta ? Math.max(0, cooldownHasta - ahora) : 0;
  const cooldownActivo = cooldownMs > 0;

  useEffect(() => () => {
    if (cooldownTimer.current) window.clearTimeout(cooldownTimer.current);
  }, []);

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

  function iniciarCooldown(ms: number) {
    const duracion = Math.max(1000, ms);
    const restante = Math.ceil(duracion / 1000);
    setCooldownHasta(Date.now() + duracion);
    setMensaje(`Demasiadas solicitudes. Espera ${restante}s e intenta de nuevo.`);
    if (cooldownTimer.current) {
      window.clearTimeout(cooldownTimer.current);
    }
    cooldownTimer.current = window.setTimeout(() => {
      setCooldownHasta(null);
    }, duracion);
  }

  function bloquearSiEnCurso() {
    if (enviando) return true;
    if (cooldownActivo) {
      const restante = Math.ceil(cooldownMs / 1000);
      setMensaje(`Espera ${restante}s antes de intentar de nuevo.`);
      return true;
    }
    return false;
  }

  async function ingresar() {
    try {
      if (bloquearSiEnCurso()) return;
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

      if (error instanceof ErrorRemoto && error.detalle?.status === 429) {
        iniciarCooldown(8_000);
      }

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
      if (bloquearSiEnCurso()) return;
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

      if (error instanceof ErrorRemoto && error.detalle?.status === 429) {
        iniciarCooldown(8_000);
      }

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
      if (bloquearSiEnCurso()) return;
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
      if (error instanceof ErrorRemoto && error.detalle?.status === 429) {
        iniciarCooldown(8_000);
      }
      registrarAccionDocente('recuperar_contrasena_google', false);
    } finally {
      setEnviando(false);
    }
  }

  async function registrar() {
    try {
      if (bloquearSiEnCurso()) return;
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
      if (error instanceof ErrorRemoto && error.detalle?.status === 429) {
        iniciarCooldown(8_000);
      }
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
        {modo === 'registrar' && (
          <div className="panel" aria-label="Ayuda de registro">
            <p className="nota">
              Para registrar tu cuenta completa <b>nombres</b>, <b>apellidos</b> y <b>correo</b>. La contrasena requiere minimo 8 caracteres.
            </p>
            {dominiosPermitidos.length > 0 && (
              <p className="nota">Correo institucional requerido: {politicaDominiosTexto}</p>
            )}
          </div>
        )}

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
                disabled={cooldownActivo || (modo === 'ingresar' ? !puedeIngresar : !puedeRegistrar)}
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

function SeccionCuenta({
  docente,
  onDocenteActualizado,
  esAdmin,
  esDev
}: {
  docente: Docente;
  onDocenteActualizado: (d: Docente) => void;
  esAdmin: boolean;
  esDev: boolean;
}) {
  const [contrasenaNueva, setContrasenaNueva] = useState('');
  const [contrasenaNueva2, setContrasenaNueva2] = useState('');
  const [contrasenaActual, setContrasenaActual] = useState('');
  const [credentialReauth, setCredentialReauth] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [institucionPdf, setInstitucionPdf] = useState(docente.preferenciasPdf?.institucion ?? '');
  const [lemaPdf, setLemaPdf] = useState(docente.preferenciasPdf?.lema ?? '');
  const [logoIzqPdf, setLogoIzqPdf] = useState(docente.preferenciasPdf?.logos?.izquierdaPath ?? '');
  const [logoDerPdf, setLogoDerPdf] = useState(docente.preferenciasPdf?.logos?.derechaPath ?? '');
  const [papelera, setPapelera] = useState<Array<Record<string, unknown>>>([]);
  const [cargandoPapelera, setCargandoPapelera] = useState(false);
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);

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

  async function guardarPreferenciasPdf() {
    try {
      const inicio = Date.now();
      setGuardando(true);
      setMensaje('');

      const payload: Record<string, unknown> = {};
      if (institucionPdf.trim()) payload.institucion = institucionPdf.trim();
      if (lemaPdf.trim()) payload.lema = lemaPdf.trim();
      if (logoIzqPdf.trim() || logoDerPdf.trim()) {
        payload.logos = {
          ...(logoIzqPdf.trim() ? { izquierdaPath: logoIzqPdf.trim() } : {}),
          ...(logoDerPdf.trim() ? { derechaPath: logoDerPdf.trim() } : {})
        };
      }

      const resp = await clienteApi.enviar<{ preferenciasPdf: Docente['preferenciasPdf'] }>('/autenticacion/preferencias/pdf', payload);
      onDocenteActualizado({
        ...docente,
        preferenciasPdf: resp.preferenciasPdf
      });

      setMensaje('Preferencias de PDF guardadas');
      emitToast({ level: 'ok', title: 'PDF', message: 'Preferencias guardadas', durationMs: 2400 });
      registrarAccionDocente('preferencias_pdf', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudieron guardar las preferencias de PDF');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'PDF',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('preferencias_pdf', false);
    } finally {
      setGuardando(false);
    }
  }

  const cargarPapelera = useCallback(async () => {
    if (!esAdmin || !esDev) return;
    setCargandoPapelera(true);
    try {
      const resp = await clienteApi.obtener<{ items: Array<Record<string, unknown>> }>('/papelera?limite=60');
      setPapelera(resp.items ?? []);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo cargar la papelera');
      setMensaje(msg);
    } finally {
      setCargandoPapelera(false);
    }
  }, [esAdmin, esDev]);

  async function restaurarPapelera(id: string) {
    setRestaurandoId(id);
    try {
      await clienteApi.enviar(`/papelera/${encodeURIComponent(id)}/restaurar`, {});
      emitToast({ level: 'ok', title: 'Papelera', message: 'Elemento restaurado', durationMs: 2200 });
      await cargarPapelera();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo restaurar');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'Papelera', message: msg, durationMs: 4200 });
    } finally {
      setRestaurandoId(null);
    }
  }

  useEffect(() => {
    void cargarPapelera();
  }, [cargarPapelera]);

  function formatearFechaPapelera(valor?: unknown) {
    if (!valor) return '-';
    const d = new Date(String(valor));
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
  }

  function tituloPapelera(item: Record<string, unknown>) {
    const payload = (item.payload as Record<string, unknown>) ?? {};
    const tipo = String(item.tipo ?? '');
    if (tipo === 'plantilla') return String((payload.plantilla as Record<string, unknown>)?.titulo ?? '').trim();
    if (tipo === 'periodo') return String((payload.periodo as Record<string, unknown>)?.nombre ?? '').trim();
    if (tipo === 'alumno') return String((payload.alumno as Record<string, unknown>)?.nombreCompleto ?? '').trim();
    return '';
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

      <div className="subpanel">
        <h3>
          <Icono nombre="pdf" /> PDF institucional
        </h3>
        <AyudaFormulario titulo="Como se usa">
          <p>
            Estas preferencias se usan para el <b>encabezado institucional</b> del PDF (solo pagina 1). Si no configuras nada,
            se usan los defaults del sistema.
          </p>
          <ul className="lista">
            <li>
              <b>Institucion:</b> ej. Centro Universitario Hidalguense
            </li>
            <li>
              <b>Lema:</b> ej. La sabiduria es nuestra fuerza
            </li>
            <li>
              <b>Logos:</b> ruta relativa (ej. <code>logos/logo_cuh.png</code>) o absoluta.
            </li>
          </ul>
        </AyudaFormulario>

        <label className="campo">
          Institucion
          <input value={institucionPdf} onChange={(e) => setInstitucionPdf(e.target.value)} placeholder="Centro Universitario Hidalguense" />
        </label>
        <label className="campo">
          Lema
          <input value={lemaPdf} onChange={(e) => setLemaPdf(e.target.value)} placeholder="La sabiduria es nuestra fuerza" />
        </label>
        <div className="grid grid--2">
          <label className="campo">
            Logo izquierda (path)
            <input value={logoIzqPdf} onChange={(e) => setLogoIzqPdf(e.target.value)} placeholder="logos/logo_cuh.png" />
          </label>
          <label className="campo">
            Logo derecha (path)
            <input value={logoDerPdf} onChange={(e) => setLogoDerPdf(e.target.value)} placeholder="logos/logo_sys.png" />
          </label>
        </div>

        <div className="acciones acciones--mt">
          <Boton onClick={guardarPreferenciasPdf} disabled={guardando}>
            Guardar PDF
          </Boton>
        </div>

      {mensaje && <InlineMensaje tipo={tipoMensajeInline(mensaje)}>{mensaje}</InlineMensaje>}
      </div>

      {esAdmin && esDev && (
        <div className="subpanel">
          <h3>
            <Icono nombre="info" /> Papelera (dev)
          </h3>
          <p className="nota">Elementos eliminados se conservan 45 dias y luego se eliminan automaticamente.</p>
          <div className="acciones acciones--mt">
            <Boton type="button" variante="secundario" icono={<Icono nombre="recargar" />} cargando={cargandoPapelera} onClick={cargarPapelera}>
              {cargandoPapelera ? 'Cargando...' : 'Actualizar papelera'}
            </Boton>
          </div>
          {!cargandoPapelera && papelera.length === 0 && <InlineMensaje tipo="info">No hay elementos en papelera.</InlineMensaje>}
          {papelera.length > 0 && (
            <div className="lista lista--compacta">
              {papelera.map((item) => {
                const id = String(item._id ?? '');
                const tipo = String(item.tipo ?? 'desconocido');
                const entidadId = String(item.entidadId ?? '');
                const titulo = tituloPapelera(item) || `${tipo} ${idCortoMateria(entidadId || id)}`;
                const eliminadoEn = formatearFechaPapelera(item.eliminadoEn);
                const expiraEn = formatearFechaPapelera(item.expiraEn);
                return (
                  <div key={id} className="item-glass">
                    <div>
                      <div className="texto-base">{titulo}</div>
                      <div className="nota">Tipo: {tipo} · Eliminado: {eliminadoEn} · Expira: {expiraEn}</div>
                    </div>
                    <div className="acciones">
                      <Boton
                        type="button"
                        variante="secundario"
                        icono={<Icono nombre="ok" />}
                        disabled={!id || restaurandoId === id}
                        cargando={restaurandoId === id}
                        onClick={() => restaurarPapelera(id)}
                      >
                        {restaurandoId === id ? 'Restaurando...' : 'Restaurar'}
                      </Boton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
  permisos,
  enviarConPermiso,
  avisarSinPermiso,
  onRefrescar,
  onRefrescarPlantillas
}: {
  preguntas: Pregunta[];
  periodos: Periodo[];
  permisos: PermisosUI;
  enviarConPermiso: EnviarConPermiso;
  avisarSinPermiso: (mensaje: string) => void;
  onRefrescar: () => void;
  onRefrescarPlantillas: () => void;
}) {
  type TemaBanco = { _id: string; nombre: string; periodoId: string; createdAt?: string };

  function normalizarNombreTema(valor: unknown): string {
    return String(valor ?? '').trim().replace(/\s+/g, ' ');
  }

  function estimarPaginasParaPreguntas(preguntasTema: Pregunta[]): number {
    const ALTO_CARTA = 792;
    const mmAPuntos = (mm: number) => mm * (72 / 25.4);
    const margen = mmAPuntos(10);
    const ANCHO_CARTA = 612;
    const GRID_STEP = 4;
    const snapToGrid = (y: number) => Math.floor(y / GRID_STEP) * GRID_STEP;

    // Mantiene consistencia con el algoritmo del PDF.
    const anchoColRespuesta = 42;
    const gutterRespuesta = 10;
    const xColRespuesta = ANCHO_CARTA - margen - anchoColRespuesta;
    const xDerechaTexto = xColRespuesta - gutterRespuesta;
    const xTextoPregunta = margen + 20;
    const anchoTextoPregunta = Math.max(60, xDerechaTexto - xTextoPregunta);

    const cursorInicial = snapToGrid(ALTO_CARTA - margen - 74);
    const limiteInferior = margen + 20;

    const INSTRUCCIONES_DEFAULT =
      'Por favor conteste las siguientes preguntas referentes al parcial. ' +
      'Rellene el círculo de la respuesta más adecuada, evitando salirse del mismo. ' +
      'Cada pregunta vale 10 puntos si está completa y es correcta.';

    const sizePregunta = 8.1;
    const sizeOpcion = 7.0;
    const lineaPregunta = 8.6;
    const lineaOpcion = 7.6;
    const separacionPregunta = 0;

    const omrPasoY = 8.4;
    const omrPadding = 2.2;
    const omrExtraTitulo = 9.5;
    const omrTotalLetras = 5;

    function estimarLineasPorAncho(texto: string, maxWidthPts: number, fontSize: number): number {
      const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
      if (!limpio) return 1;

      // Aproximacion para Helvetica: ancho promedio ~0.52em.
      const charWidth = fontSize * 0.52;
      const maxChars = Math.max(10, Math.floor(maxWidthPts / charWidth));
      const palabras = limpio.split(' ');

      let lineas = 1;
      let actual = '';

      for (const palabra of palabras) {
        const candidato = actual ? `${actual} ${palabra}` : palabra;
        if (candidato.length <= maxChars) {
          actual = candidato;
          continue;
        }

        if (!actual) {
          // palabra demasiado larga: trocea
          const trozos = Math.ceil(palabra.length / maxChars);
          lineas += Math.max(0, trozos - 1);
          actual = palabra.slice((trozos - 1) * maxChars);
        } else {
          lineas += 1;
          actual = palabra;
        }
      }

      return Math.max(1, lineas);
    }

    const lista = Array.isArray(preguntasTema) ? preguntasTema : [];
    if (lista.length === 0) return 0;

    let paginas = 1;
    let cursorY = cursorInicial;
    let esPrimeraPagina = true;

    const aplicarBloqueIndicaciones = () => {
      const sizeIndicaciones = 6.3;
      const lineaIndicaciones = 7.0;
      const maxWidthIndicaciones = Math.max(120, xDerechaTexto - (margen + 10));
      const lineasIndicaciones = estimarLineasPorAncho(INSTRUCCIONES_DEFAULT, maxWidthIndicaciones, sizeIndicaciones);
      const hLabel = 9;
      const paddingY = 1;
      const hCaja = hLabel + paddingY + lineasIndicaciones * lineaIndicaciones;
      cursorY = snapToGrid(cursorY - (hCaja + 12));
      if (cursorY < limiteInferior + 40) {
        cursorY = limiteInferior - 1;
      }
    };

    if (esPrimeraPagina) {
      aplicarBloqueIndicaciones();
      esPrimeraPagina = false;
    }

    for (const pregunta of lista) {
      const version = obtenerVersionPregunta(pregunta);
      const tieneImagen = Boolean(String(version?.imagenUrl ?? '').trim());

      const lineasEnunciado = estimarLineasPorAncho(String(version?.enunciado ?? ''), anchoTextoPregunta, sizePregunta);
      let altoNecesario = lineasEnunciado * lineaPregunta;
      if (tieneImagen) altoNecesario += 43;

      const opcionesActuales = Array.isArray(version?.opciones) ? version!.opciones : [];
      const opciones = opcionesActuales.length === 5 ? opcionesActuales : [];

      const totalOpciones = opciones.length;
      const mitad = Math.ceil(totalOpciones / 2);
      const anchoOpcionesTotal = Math.max(80, xDerechaTexto - xTextoPregunta);
      const gutterCols = 8;
      const colWidth = totalOpciones > 1 ? (anchoOpcionesTotal - gutterCols) / 2 : anchoOpcionesTotal;
      const prefixWidth = sizeOpcion * 1.4;
      const maxTextWidth = Math.max(30, colWidth - prefixWidth);
      const alturasCols = [0, 0];

      opciones.slice(0, mitad).forEach((op) => {
        alturasCols[0] += estimarLineasPorAncho(String(op?.texto ?? ''), maxTextWidth, sizeOpcion) * lineaOpcion + 0.5;
      });
      opciones.slice(mitad).forEach((op) => {
        alturasCols[1] += estimarLineasPorAncho(String(op?.texto ?? ''), maxTextWidth, sizeOpcion) * lineaOpcion + 0.5;
      });
      const altoOpciones = Math.max(alturasCols[0], alturasCols[1]);
      const altoOmrMin = (omrTotalLetras - 1) * omrPasoY + (omrExtraTitulo + omrPadding);
      altoNecesario += Math.max(altoOpciones, altoOmrMin);
      altoNecesario += separacionPregunta + 4;
      altoNecesario = snapToGrid(altoNecesario);

      if (cursorY - altoNecesario < limiteInferior) {
        paginas += 1;
        cursorY = cursorInicial;
        if (esPrimeraPagina) {
          aplicarBloqueIndicaciones();
          esPrimeraPagina = false;
        }
      }

      cursorY = snapToGrid(cursorY - altoNecesario);
    }

    return paginas;
  }

  const [periodoId, setPeriodoId] = useState('');
  const [enunciado, setEnunciado] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
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
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editEnunciado, setEditEnunciado] = useState('');
  const [editImagenUrl, setEditImagenUrl] = useState('');
  const [editTema, setEditTema] = useState('');
  const [editOpciones, setEditOpciones] = useState([
    { texto: '', esCorrecta: true },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false },
    { texto: '', esCorrecta: false }
  ]);
  const [editando, setEditando] = useState(false);
  const [archivandoPreguntaId, setArchivandoPreguntaId] = useState<string | null>(null);

  const [temasBanco, setTemasBanco] = useState<TemaBanco[]>([]);
  const [cargandoTemas, setCargandoTemas] = useState(false);
  const [temaNuevo, setTemaNuevo] = useState('');
  const [creandoTema, setCreandoTema] = useState(false);
  const [temaEditandoId, setTemaEditandoId] = useState<string | null>(null);
  const [temaEditandoNombre, setTemaEditandoNombre] = useState('');
  const [guardandoTema, setGuardandoTema] = useState(false);
  const [archivandoTemaId, setArchivandoTemaId] = useState<string | null>(null);
  const [temasAbierto, setTemasAbierto] = useState(true);
  const temasPrevLenRef = useRef(0);
  const puedeLeer = permisos.banco.leer;
  const puedeGestionar = permisos.banco.gestionar;
  const puedeArchivar = permisos.banco.archivar;
  const bloqueoEdicion = !puedeGestionar;

  const [ajusteTemaId, setAjusteTemaId] = useState<string | null>(null);
  const [ajustePaginasObjetivo, setAjustePaginasObjetivo] = useState<number>(1);
  const [ajusteAccion, setAjusteAccion] = useState<'mover' | 'quitar'>('mover');
  const [ajusteTemaDestinoId, setAjusteTemaDestinoId] = useState<string>('');
  const [ajusteSeleccion, setAjusteSeleccion] = useState<Set<string>>(new Set());
  const [moviendoTema, setMoviendoTema] = useState(false);

  const [sinTemaDestinoId, setSinTemaDestinoId] = useState<string>('');
  const [sinTemaSeleccion, setSinTemaSeleccion] = useState<Set<string>>(new Set());
  const [moviendoSinTema, setMoviendoSinTema] = useState(false);

  useEffect(() => {
    if (periodoId) return;
    if (!Array.isArray(periodos) || periodos.length === 0) return;
    setPeriodoId(periodos[0]._id);
  }, [periodoId, periodos]);

  useEffect(() => {
    setTema('');
  }, [periodoId, puedeLeer]);

  const refrescarTemas = useCallback(async () => {
    if (!periodoId) {
      setTemasBanco([]);
      return;
    }
    if (!puedeLeer) {
      setTemasBanco([]);
      return;
    }
    try {
      setCargandoTemas(true);
      const payload = await clienteApi.obtener<{ temas: TemaBanco[] }>(
        `/banco-preguntas/temas?periodoId=${encodeURIComponent(periodoId)}`
      );
      setTemasBanco(Array.isArray(payload.temas) ? payload.temas : []);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudieron cargar temas');
      setMensaje(msg);
    } finally {
      setCargandoTemas(false);
    }
  }, [periodoId, puedeLeer]);

  useEffect(() => {
    void refrescarTemas();
  }, [refrescarTemas]);

  // UX: cuando ya existe al menos 1 tema, colapsa la seccion automaticamente.
  useEffect(() => {
    const len = Array.isArray(temasBanco) ? temasBanco.length : 0;
    const prev = temasPrevLenRef.current;

    // Si la materia cambia o se queda sin temas, abre para guiar.
    if (len === 0) setTemasAbierto(true);
    // Si pasamos de 0 -> 1+ (primer tema creado), colapsa.
    if (prev === 0 && len > 0) setTemasAbierto(false);

    temasPrevLenRef.current = len;
  }, [temasBanco]);

  const preguntasMateria = useMemo(() => {
    const lista = Array.isArray(preguntas) ? preguntas : [];
    const filtradas = periodoId ? lista.filter((p) => p.periodoId === periodoId) : [];
    return [...filtradas].sort((a, b) => {
      const porFecha = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      if (porFecha !== 0) return porFecha;
      return String(b._id).localeCompare(String(a._id));
    });
  }, [preguntas, periodoId]);

  const preguntasTemaActual = useMemo(() => {
    const nombre = normalizarNombreTema(tema);
    if (!nombre) return [];
    return preguntasMateria.filter((p) => normalizarNombreTema(p.tema) === nombre);
  }, [preguntasMateria, tema]);

  const preguntasSinTema = useMemo(() => {
    const lista = Array.isArray(preguntasMateria) ? preguntasMateria : [];
    return lista.filter((p) => !normalizarNombreTema(p.tema));
  }, [preguntasMateria]);

  const conteoPorTema = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const pregunta of preguntasMateria) {
      const nombre = normalizarNombreTema(pregunta.tema);
      if (!nombre) continue;
      mapa.set(nombre, (mapa.get(nombre) ?? 0) + 1);
    }
    return mapa;
  }, [preguntasMateria]);

  const paginasPorTema = useMemo(() => {
    const grupos = new Map<string, Pregunta[]>();
    for (const pregunta of preguntasMateria) {
      const nombre = normalizarNombreTema(pregunta.tema);
      if (!nombre) continue;
      const key = nombre.toLowerCase();
      const arr = grupos.get(key);
      if (arr) {
        arr.push(pregunta);
      } else {
        grupos.set(key, [pregunta]);
      }
    }

    const mapa = new Map<string, number>();
    for (const [key, preguntasTema] of grupos.entries()) {
      mapa.set(key, estimarPaginasParaPreguntas(preguntasTema));
    }
    return mapa;
  }, [preguntasMateria]);

  const paginasTemaActual = useMemo(() => {
    if (!tema.trim()) return 0;
    return preguntasTemaActual.length ? estimarPaginasParaPreguntas(preguntasTemaActual) : 0;
  }, [preguntasTemaActual, tema]);

  function estimarAltoPregunta(pregunta: Pregunta): number {
    const mmAPuntos = (mm: number) => mm * (72 / 25.4);
    const margen = mmAPuntos(10);
    const ANCHO_CARTA = 612;
    const GRID_STEP = 4;
    const snapToGrid = (y: number) => Math.floor(y / GRID_STEP) * GRID_STEP;

    const anchoColRespuesta = 42;
    const gutterRespuesta = 10;
    const xColRespuesta = ANCHO_CARTA - margen - anchoColRespuesta;
    const xDerechaTexto = xColRespuesta - gutterRespuesta;
    const xTextoPregunta = margen + 20;
    const anchoTextoPregunta = Math.max(60, xDerechaTexto - xTextoPregunta);

    const sizePregunta = 8.1;
    const sizeOpcion = 7.0;
    const sizeNota = 6.3;
    const lineaPregunta = 8.6;
    const lineaOpcion = 7.6;
    const separacionPregunta = 0;

    const omrPasoY = 8.4;
    const omrPadding = 2.2;
    const omrExtraTitulo = 9.5;
    const omrTotalLetras = 5;

    function estimarLineasPorAncho(texto: string, maxWidthPts: number, fontSize: number): number {
      const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
      if (!limpio) return 1;
      const charWidth = fontSize * 0.52;
      const maxChars = Math.max(10, Math.floor(maxWidthPts / charWidth));
      const palabras = limpio.split(' ');

      let lineas = 1;
      let actual = '';
      for (const palabra of palabras) {
        const candidato = actual ? `${actual} ${palabra}` : palabra;
        if (candidato.length <= maxChars) {
          actual = candidato;
          continue;
        }
        if (!actual) {
          const trozos = Math.ceil(palabra.length / maxChars);
          lineas += Math.max(0, trozos - 1);
          actual = palabra.slice((trozos - 1) * maxChars);
        } else {
          lineas += 1;
          actual = palabra;
        }
      }
      return Math.max(1, lineas);
    }

    const version = obtenerVersionPregunta(pregunta);
    const tieneImagen = Boolean(String(version?.imagenUrl ?? '').trim());
    const lineasEnunciado = estimarLineasPorAncho(String(version?.enunciado ?? ''), anchoTextoPregunta, sizePregunta);
    let altoNecesario = lineasEnunciado * lineaPregunta;
    if (tieneImagen) altoNecesario += 43;

    const opcionesActuales = Array.isArray(version?.opciones) ? version!.opciones : [];
    const opciones = opcionesActuales.length === 5 ? opcionesActuales : [];
    const totalOpciones = opciones.length;
    const mitad = Math.ceil(totalOpciones / 2);
    const anchoOpcionesTotal = Math.max(80, xDerechaTexto - xTextoPregunta);
    const gutterCols = 8;
    const colWidth = totalOpciones > 1 ? (anchoOpcionesTotal - gutterCols) / 2 : anchoOpcionesTotal;
    const prefixWidth = sizeOpcion * 1.4;
    const maxTextWidth = Math.max(30, colWidth - prefixWidth);
    const alturasCols = [0, 0];

    opciones.slice(0, mitad).forEach((op) => {
      alturasCols[0] += estimarLineasPorAncho(String(op?.texto ?? ''), maxTextWidth, sizeOpcion) * lineaOpcion + 0.5;
    });
    opciones.slice(mitad).forEach((op) => {
      alturasCols[1] += estimarLineasPorAncho(String(op?.texto ?? ''), maxTextWidth, sizeOpcion) * lineaOpcion + 0.5;
    });
    const altoOpciones = Math.max(alturasCols[0], alturasCols[1]);
    const altoOmrMin = (omrTotalLetras - 1) * omrPasoY + (omrExtraTitulo + omrPadding);
    altoNecesario += Math.max(altoOpciones, altoOmrMin);
    altoNecesario += separacionPregunta + 4;
    altoNecesario = snapToGrid(altoNecesario);

    // Evitar alturas absurdamente chicas
    return Math.max(sizeNota + 10, altoNecesario);
  }

  const preguntasPorTemaId = useMemo(() => {
    const mapa = new Map<string, Pregunta[]>();
    const temas = Array.isArray(temasBanco) ? temasBanco : [];
    const porNombre = new Map<string, string>();
    for (const t of temas) porNombre.set(normalizarNombreTema(t.nombre).toLowerCase(), t._id);

    for (const pregunta of preguntasMateria) {
      const nombre = normalizarNombreTema(pregunta.tema);
      if (!nombre) continue;
      const id = porNombre.get(nombre.toLowerCase());
      if (!id) continue;
      const arr = mapa.get(id);
      if (arr) arr.push(pregunta);
      else mapa.set(id, [pregunta]);
    }

    return mapa;
  }, [preguntasMateria, temasBanco]);

  function sugerirPreguntasARecortar(preguntasTema: Pregunta[], paginasObjetivo: number): string[] {
    const objetivo = Math.max(1, Math.floor(Number(paginasObjetivo) || 1));
    const orden = [...(Array.isArray(preguntasTema) ? preguntasTema : [])];
    // La lista ya viene en orden reciente -> antiguo; recortamos de abajo (antiguas) para no tocar lo ultimo agregado.
    const seleccion: string[] = [];
    let paginas = estimarPaginasParaPreguntas(orden);
    while (orden.length > 0 && paginas > objetivo) {
      const quitada = orden.pop();
      if (!quitada) break;
      seleccion.push(quitada._id);
      paginas = estimarPaginasParaPreguntas(orden);
    }
    return seleccion;
  }

  function abrirAjusteTema(t: TemaBanco) {
    const id = t._id;
    const key = normalizarNombreTema(t.nombre).toLowerCase();
    const actuales = paginasPorTema.get(key) ?? 1;
    const hayDestinos = temasBanco.some((x) => x._id !== t._id);
    setAjusteTemaId(id);
    setAjustePaginasObjetivo(Math.max(1, Number(actuales || 1)));
    setAjusteSeleccion(new Set());
    setAjusteAccion(hayDestinos ? 'mover' : 'quitar');
    setAjusteTemaDestinoId('');
  }

  function cerrarAjusteTema() {
    setAjusteTemaId(null);
    setAjusteSeleccion(new Set());
    setAjusteAccion('mover');
    setAjusteTemaDestinoId('');
  }

  async function aplicarAjusteTema() {
    if (!periodoId) return;
    if (!ajusteTemaId) return;
    const ids = Array.from(ajusteSeleccion);
    if (ids.length === 0) return;

    if (ajusteAccion === 'mover' && !ajusteTemaDestinoId) return;
    if (!puedeGestionar) {
      avisarSinPermiso('No tienes permiso para gestionar el banco.');
      return;
    }
    try {
      setMoviendoTema(true);
      setMensaje('');

      if (ajusteAccion === 'mover') {
        await enviarConPermiso(
          'banco:gestionar',
          '/banco-preguntas/mover-tema',
          {
            periodoId,
            temaIdDestino: ajusteTemaDestinoId,
            preguntasIds: ids
          },
          'No tienes permiso para mover preguntas.'
        );
        emitToast({ level: 'ok', title: 'Banco', message: `Movidas ${ids.length} preguntas`, durationMs: 2200 });
      } else {
        await enviarConPermiso(
          'banco:gestionar',
          '/banco-preguntas/quitar-tema',
          {
            periodoId,
            preguntasIds: ids
          },
          'No tienes permiso para quitar tema.'
        );
        emitToast({ level: 'ok', title: 'Banco', message: `Quitado el tema a ${ids.length} preguntas`, durationMs: 2400 });
      }

      cerrarAjusteTema();
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, ajusteAccion === 'mover' ? 'No se pudieron mover las preguntas' : 'No se pudo quitar el tema');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: ajusteAccion === 'mover' ? 'No se pudo mover' : 'No se pudo actualizar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
    } finally {
      setMoviendoTema(false);
    }
  }

  async function asignarSinTemaATema() {
    if (!periodoId) return;
    if (!sinTemaDestinoId) return;
    const ids = Array.from(sinTemaSeleccion);
    if (ids.length === 0) return;
    if (!puedeGestionar) {
      avisarSinPermiso('No tienes permiso para gestionar el banco.');
      return;
    }
    try {
      setMoviendoSinTema(true);
      setMensaje('');
      await enviarConPermiso(
        'banco:gestionar',
        '/banco-preguntas/mover-tema',
        {
          periodoId,
          temaIdDestino: sinTemaDestinoId,
          preguntasIds: ids
        },
        'No tienes permiso para mover preguntas.'
      );
      emitToast({ level: 'ok', title: 'Banco', message: `Asignadas ${ids.length} preguntas`, durationMs: 2200 });
      setSinTemaSeleccion(new Set());
      await Promise.resolve().then(() => onRefrescar());
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudieron asignar las preguntas');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo asignar', message: msg, durationMs: 5200, action: accionToastSesionParaError(error, 'docente') });
    } finally {
      setMoviendoSinTema(false);
    }
  }

  const temaPorDefecto = useMemo(() => {
    const lista = Array.isArray(temasBanco) ? temasBanco : [];
    if (lista.length === 0) return '';
    const masReciente = lista.reduce((acc, item) => {
      if (!acc) return item;
      const cmp = String(item.createdAt || '').localeCompare(String(acc.createdAt || ''));
      if (cmp > 0) return item;
      if (cmp < 0) return acc;
      return String(item._id).localeCompare(String(acc._id)) > 0 ? item : acc;
    }, null as TemaBanco | null);
    return masReciente?.nombre ?? '';
  }, [temasBanco]);

  useEffect(() => {
    if (!periodoId) return;
    if (tema.trim()) return;
    if (!temaPorDefecto.trim()) return;
    setTema(temaPorDefecto);
  }, [periodoId, tema, temaPorDefecto]);

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
    setEditImagenUrl(String(version?.imagenUrl ?? ''));
    setEditTema(String(pregunta.tema ?? '').trim());
    const opcionesActuales = Array.isArray(version?.opciones) ? version?.opciones : [];
    const base = opcionesActuales.length === 5 ? opcionesActuales : editOpciones;
    setEditOpciones(base.map((o) => ({ texto: String(o.texto ?? ''), esCorrecta: Boolean(o.esCorrecta) })));
  }

  function cargarImagenArchivo(file: File | null, setter: (value: string) => void) {
    if (!file) return;
    const maxBytes = 1024 * 1024 * 1.5;
    if (file.size > maxBytes) {
      emitToast({
        level: 'warn',
        title: 'Imagen grande',
        message: 'La imagen supera 1.5MB. Usa una mas ligera para evitar PDFs pesados.',
        durationMs: 4200
      });
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No canvas');
        ctx.drawImage(img, 0, 0, w, h);

        const calidad = 0.8;
        let dataUrl = '';
        try {
          dataUrl = canvas.toDataURL('image/webp', calidad);
        } catch {
          dataUrl = '';
        }
        if (!dataUrl || dataUrl.startsWith('data:image/png')) {
          dataUrl = canvas.toDataURL('image/jpeg', calidad);
        }
        if (dataUrl) setter(dataUrl);
      } catch {
        emitToast({ level: 'error', title: 'Imagen', message: 'No se pudo comprimir la imagen.', durationMs: 3200 });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      emitToast({ level: 'error', title: 'Imagen', message: 'No se pudo leer la imagen.', durationMs: 3200 });
    };
    img.src = objectUrl;
  }

  async function crearTemaBanco() {
    if (!periodoId) return;
    const nombre = temaNuevo.trim();
    if (!nombre) return;
    if (!puedeGestionar) {
      avisarSinPermiso('No tienes permiso para gestionar temas.');
      return;
    }
    try {
      setCreandoTema(true);
      setMensaje('');
      await enviarConPermiso('banco:gestionar', '/banco-preguntas/temas', { periodoId, nombre }, 'No tienes permiso para crear temas.');
      setTemaNuevo('');
      await refrescarTemas();
      emitToast({ level: 'ok', title: 'Temas', message: 'Tema creado', durationMs: 1800 });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo crear el tema');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo crear', message: msg, durationMs: 5200, action: accionToastSesionParaError(error, 'docente') });
    } finally {
      setCreandoTema(false);
    }
  }

  function iniciarEdicionTema(item: TemaBanco) {
    setTemaEditandoId(item._id);
    setTemaEditandoNombre(item.nombre);
  }

  function cancelarEdicionTema() {
    setTemaEditandoId(null);
    setTemaEditandoNombre('');
  }

  async function guardarEdicionTema() {
    if (!temaEditandoId) return;
    const nombre = temaEditandoNombre.trim();
    if (!nombre) return;
    if (!puedeGestionar) {
      avisarSinPermiso('No tienes permiso para editar temas.');
      return;
    }
    try {
      setGuardandoTema(true);
      setMensaje('');
      await enviarConPermiso(
        'banco:gestionar',
        `/banco-preguntas/temas/${temaEditandoId}/actualizar`,
        { nombre },
        'No tienes permiso para editar temas.'
      );
      cancelarEdicionTema();
      await Promise.all([refrescarTemas(), Promise.resolve().then(() => onRefrescar()), Promise.resolve().then(() => onRefrescarPlantillas())]);
      emitToast({ level: 'ok', title: 'Temas', message: 'Tema actualizado', durationMs: 1800 });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo actualizar el tema');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo actualizar', message: msg, durationMs: 5200, action: accionToastSesionParaError(error, 'docente') });
    } finally {
      setGuardandoTema(false);
    }
  }

  async function archivarTemaBanco(item: TemaBanco) {
    if (!puedeArchivar) {
      avisarSinPermiso('No tienes permiso para archivar temas.');
      return;
    }
    const ok = globalThis.confirm(`¿Archivar el tema "${item.nombre}"? Se removerá de plantillas y preguntas.`);
    if (!ok) return;
    try {
      setArchivandoTemaId(item._id);
      setMensaje('');
      await enviarConPermiso(
        'banco:archivar',
        `/banco-preguntas/temas/${item._id}/archivar`,
        {},
        'No tienes permiso para archivar temas.'
      );
      if (tema.trim().toLowerCase() === item.nombre.trim().toLowerCase()) setTema('');
      if (editTema.trim().toLowerCase() === item.nombre.trim().toLowerCase()) setEditTema('');
      await Promise.all([refrescarTemas(), Promise.resolve().then(() => onRefrescar()), Promise.resolve().then(() => onRefrescarPlantillas())]);
      emitToast({ level: 'ok', title: 'Temas', message: 'Tema archivado', durationMs: 1800 });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo archivar el tema');
      setMensaje(msg);
      emitToast({ level: 'error', title: 'No se pudo archivar', message: msg, durationMs: 5200, action: accionToastSesionParaError(error, 'docente') });
    } finally {
      setArchivandoTemaId(null);
    }
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setEditEnunciado('');
    setEditImagenUrl('');
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
      if (!puedeGestionar) {
        avisarSinPermiso('No tienes permiso para crear preguntas.');
        return;
      }
      setGuardando(true);
      setMensaje('');
      await enviarConPermiso(
        'banco:gestionar',
        '/banco-preguntas',
        {
          periodoId,
          enunciado: enunciado.trim(),
          imagenUrl: imagenUrl.trim() ? imagenUrl.trim() : undefined,
          tema: tema.trim(),
          opciones: opciones.map((item) => ({ ...item, texto: item.texto.trim() }))
        },
        'No tienes permiso para crear preguntas.'
      );
      setMensaje('Pregunta guardada');
      emitToast({ level: 'ok', title: 'Banco', message: 'Pregunta guardada', durationMs: 2200 });
      registrarAccionDocente('crear_pregunta', true, Date.now() - inicio);
      setEnunciado('');
      setImagenUrl('');
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

  async function guardarEdicion() {
    if (!editandoId) return;
    try {
      const inicio = Date.now();
      if (!puedeGestionar) {
        avisarSinPermiso('No tienes permiso para editar preguntas.');
        return;
      }
      setEditando(true);
      setMensaje('');
      await enviarConPermiso(
        'banco:gestionar',
        `/banco-preguntas/${editandoId}/actualizar`,
        {
          enunciado: editEnunciado.trim(),
          imagenUrl: editImagenUrl.trim() ? editImagenUrl.trim() : null,
          tema: editTema.trim(),
          opciones: editOpciones.map((o) => ({ ...o, texto: o.texto.trim() }))
        },
        'No tienes permiso para editar preguntas.'
      );
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

  async function archivarPregunta(preguntaId: string) {
    if (!puedeArchivar) {
      avisarSinPermiso('No tienes permiso para archivar preguntas.');
      return;
    }
    const ok = globalThis.confirm('¿¿Archivar esta pregunta? Se desactivara del banco.');
    if (!ok) return;
    try {
      const inicio = Date.now();
      setArchivandoPreguntaId(preguntaId);
      setMensaje('');
      await enviarConPermiso(
        'banco:archivar',
        `/banco-preguntas/${preguntaId}/archivar`,
        {},
        'No tienes permiso para archivar preguntas.'
      );
      setMensaje('Pregunta archivada');
      emitToast({ level: 'ok', title: 'Banco', message: 'Pregunta archivada', durationMs: 2200 });
      registrarAccionDocente('archivar_pregunta', true, Date.now() - inicio);
      if (editandoId === preguntaId) cancelarEdicion();
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo archivar');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo archivar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('archivar_pregunta', false);
    } finally {
      setArchivandoPreguntaId(null);
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
      <div className="banco-resumen" aria-live="polite">
        <div className="banco-resumen__item" data-tooltip="Total de preguntas activas en la materia seleccionada.">
          <span>Preguntas</span>
          <b>{preguntasMateria.length}</b>
        </div>
        <div className="banco-resumen__item" data-tooltip="Cantidad de temas activos en la materia.">
          <span>Temas</span>
          <b>{temasBanco.length}</b>
        </div>
        <div className="banco-resumen__item" data-tooltip="Preguntas sin tema asignado.">
          <span>Sin tema</span>
          <b>{preguntasSinTema.length}</b>
        </div>
        <div className="banco-resumen__item" data-tooltip="Cantidad de preguntas que pertenecen al tema seleccionado.">
          <span>Tema actual</span>
          <b>{tema.trim() ? preguntasTemaActual.length : '-'}</b>
        </div>
        <div className="banco-resumen__item" data-tooltip="Estimacion de paginas segun el layout real del PDF.">
          <span>Paginas est.</span>
          <b>{tema.trim() ? paginasTemaActual : '-'}</b>
        </div>
      </div>
      <label className="campo">
        Materia
        <select value={periodoId} onChange={(event) => setPeriodoId(event.target.value)} disabled={bloqueoEdicion} data-tooltip="Materia sobre la que se gestionan preguntas y temas.">
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
        <textarea
          value={enunciado}
          onChange={(event) => setEnunciado(event.target.value)}
          disabled={bloqueoEdicion}
          placeholder="Escribe el texto completo de la pregunta…"
          data-tooltip="Redacta el enunciado completo de la pregunta."
        />
      </label>
      <label className="campo">
        Imagen (opcional)
        <input
          type="file"
          accept="image/*"
          onChange={(event) => cargarImagenArchivo(event.currentTarget.files?.[0] ?? null, setImagenUrl)}
          disabled={bloqueoEdicion}
          data-tooltip="Sube una imagen para la pregunta (se guarda en la hoja del examen)."
        />
        {imagenUrl && (
          <div className="imagen-preview">
            <img className="preview" src={imagenUrl} alt="Imagen de la pregunta" />
            <Boton type="button" variante="secundario" onClick={() => setImagenUrl('')} data-tooltip="Quita la imagen.">
              Quitar imagen
            </Boton>
          </div>
        )}
      </label>
      <label className="campo">
        Tema
        <select value={tema} onChange={(event) => setTema(event.target.value)} disabled={bloqueoEdicion} data-tooltip="Tema al que se asignara la pregunta.">
          <option value="">Selecciona</option>
          {temasBanco.map((t) => (
            <option key={t._id} value={t.nombre}>
              {t.nombre}
            </option>
          ))}
        </select>
        {periodoId && !cargandoTemas && temasBanco.length === 0 && (
          <span className="ayuda">Primero crea un tema (seccion “Temas”) para poder asignarlo a preguntas.</span>
        )}
        {tema.trim() && (
          <span className="ayuda">
            En este tema: {preguntasTemaActual.length} pregunta(s) · {paginasTemaActual} pagina(s) estimada(s).
          </span>
        )}
      </label>

      <details
        className="colapsable"
        open={temasAbierto}
        onToggle={(event) => setTemasAbierto((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <b>Temas</b>
          {periodoId ? ` (${temasBanco.length})` : ''}
        </summary>
        <div className="ayuda">Crea, renombra o elimina temas de esta materia. Luego asigna cada pregunta desde el selector de “Tema”.</div>
        <div className="campo-inline">
          <input
            value={temaNuevo}
            onChange={(event) => setTemaNuevo(event.target.value)}
            placeholder="Nuevo tema (ej. Funciones)"
            aria-label="Nuevo tema"
            disabled={bloqueoEdicion}
            data-tooltip="Escribe el nombre del tema y luego presiona Agregar."
          />
          <Boton
            type="button"
            variante="secundario"
            cargando={creandoTema}
            disabled={!periodoId || !temaNuevo.trim() || bloqueoEdicion}
            onClick={crearTemaBanco}
            data-tooltip="Crea el tema en la materia seleccionada."
          >
            Agregar
          </Boton>
        </div>
        {cargandoTemas && (
          <InlineMensaje tipo="info" leading={<Spinner />}>
            Cargando temas…
          </InlineMensaje>
        )}
        <ul className="lista lista-items">
          {periodoId && !cargandoTemas && temasBanco.length === 0 && <li>No hay temas. Crea el primero arriba.</li>}
          {temasBanco.map((t) => (
            <li key={t._id}>
              <div className="item-glass">
                <div className="item-row">
                  <div>
                    <div className="item-title">{t.nombre}</div>
                    <div className="item-meta">
                      <span>Preguntas: {conteoPorTema.get(t.nombre) ?? 0}</span>
                      <span>Paginas (estimadas): {paginasPorTema.get(normalizarNombreTema(t.nombre).toLowerCase()) ?? 0}</span>
                    </div>
                  </div>
                  <div className="item-actions">
                    {temaEditandoId === t._id ? (
                      <>
                        <input
                          value={temaEditandoNombre}
                          onChange={(event) => setTemaEditandoNombre(event.target.value)}
                          aria-label="Nombre del tema"
                        />
                        <Boton type="button" variante="secundario" cargando={guardandoTema} disabled={!temaEditandoNombre.trim()} onClick={guardarEdicionTema}>
                          Guardar
                        </Boton>
                        <Boton type="button" variante="secundario" onClick={cancelarEdicionTema}>
                          Cancelar
                        </Boton>
                      </>
                    ) : (
                      <>
                        <Boton
                          type="button"
                          variante="secundario"
                          onClick={() => abrirAjusteTema(t)}
                          disabled={!puedeGestionar}
                          data-tooltip="Ajusta el numero de paginas objetivo para este tema."
                        >
                          Ajustar paginas
                        </Boton>
                        <Boton
                          type="button"
                          variante="secundario"
                          onClick={() => iniciarEdicionTema(t)}
                          disabled={!puedeGestionar}
                          data-tooltip="Cambia el nombre del tema."
                        >
                          Renombrar
                        </Boton>
                        <Boton
                          type="button"
                          cargando={archivandoTemaId === t._id}
                          onClick={() => archivarTemaBanco(t)}
                          disabled={!puedeArchivar}
                          data-tooltip="Archiva el tema y deja sus preguntas sin tema."
                        >
                          Archivar
                        </Boton>
                      </>
                    )}
                  </div>
                </div>

                {ajusteTemaId === t._id && (
                  <div className="ajuste-tema">
                    <div className="ayuda">
                      Ajusta el tamano del tema segun <b>paginas estimadas</b>. Puedes <b>mover</b> preguntas a otro tema o <b>dejarlas sin tema</b>.
                    </div>
                    <div className="ajuste-controles">
                      <label className="campo ajuste-campo ajuste-campo--paginas">
                        Paginas objetivo
                        <input
                          type="number"
                          min={1}
                          value={String(ajustePaginasObjetivo)}
                          onChange={(event) => setAjustePaginasObjetivo(Math.max(1, Number(event.target.value || 1)))}
                          data-tooltip="Define cuantas paginas quieres que ocupe este tema."
                        />
                      </label>
                      <label className="campo ajuste-campo ajuste-campo--tema">
                        Accion
                        <select
                          value={ajusteAccion}
                          onChange={(event) => {
                            const next = event.target.value === 'quitar' ? 'quitar' : 'mover';
                            setAjusteAccion(next);
                            if (next === 'quitar') setAjusteTemaDestinoId('');
                          }}
                          data-tooltip="Elige mover preguntas a otro tema o dejarlas sin tema."
                        >
                          <option value="mover">Mover a otro tema</option>
                          <option value="quitar">Dejar sin tema</option>
                        </select>
                      </label>
                      <label className="campo ajuste-campo ajuste-campo--tema">
                        Tema destino
                        <select
                          value={ajusteTemaDestinoId}
                          onChange={(event) => setAjusteTemaDestinoId(event.target.value)}
                          data-tooltip="Tema al que se moveran las preguntas seleccionadas."
                        >
                          <option value="">Selecciona</option>
                          {temasBanco
                            .filter((x) => x._id !== t._id)
                            .map((x) => (
                              <option key={x._id} value={x._id}>
                                {x.nombre}
                              </option>
                            ))}
                        </select>
                        {ajusteAccion === 'quitar' && <span className="ayuda">No aplica si eliges “Dejar sin tema”.</span>}
                      </label>

                      <Boton
                        type="button"
                        variante="secundario"
                        disabled={!ajusteTemaId}
                        onClick={() => {
                          const preguntasTema = preguntasPorTemaId.get(t._id) ?? [];
                          const sugeridas = sugerirPreguntasARecortar(preguntasTema, ajustePaginasObjetivo);
                          setAjusteSeleccion(new Set(sugeridas));
                        }}
                        data-tooltip="Marca automaticamente preguntas antiguas para cumplir el objetivo."
                      >
                        Sugerir
                      </Boton>
                      <Boton type="button" variante="secundario" onClick={() => setAjusteSeleccion(new Set())} data-tooltip="Quita todas las selecciones.">
                        Limpiar
                      </Boton>
                      <Boton type="button" variante="secundario" onClick={cerrarAjusteTema} data-tooltip="Cerrar sin aplicar cambios.">
                        Cerrar
                      </Boton>
                    </div>

                    {(() => {
                      const preguntasTema = preguntasPorTemaId.get(t._id) ?? [];
                      const actuales = paginasPorTema.get(normalizarNombreTema(t.nombre).toLowerCase()) ?? 0;
                      const objetivo = Math.max(1, Math.floor(Number(ajustePaginasObjetivo) || 1));
                      const seleccion = ajusteSeleccion;
                      const seleccionadas = preguntasTema.filter((p) => seleccion.has(p._id));
                      const restantes = preguntasTema.filter((p) => !seleccion.has(p._id));
                      const paginasRestantes = restantes.length ? estimarPaginasParaPreguntas(restantes) : 0;
                      const altoSeleccion = seleccionadas.reduce((acc, p) => acc + estimarAltoPregunta(p), 0);
                      const paginasSeleccion = seleccionadas.length ? estimarPaginasParaPreguntas(seleccionadas) : 0;
                      const texto =
                        actuales && objetivo
                          ? `Actual: ${actuales} pag. | Objetivo: ${objetivo} pag. | Quedaria: ${paginasRestantes} pag.`
                          : '';

                      return (
                        <>
                          <div className="item-meta ajuste-meta">
                            <span>{texto}</span>
                            <span>
                              Seleccionadas: {seleccionadas.length} (peso aprox: {paginasSeleccion} pag, {Math.round(altoSeleccion)}pt)
                            </span>
                          </div>
                          <div className="ayuda ajuste-ayuda">
                            Tip: “Sugerir” marca preguntas antiguas (del final) hasta acercarse al objetivo. La estimacion depende del largo del texto.
                          </div>
                          <div className="ajuste-scroll">
                            <ul className="lista">
                              {preguntasTema.length === 0 && <li>No hay preguntas en este tema.</li>}
                              {preguntasTema.map((p) => {
                                const version = obtenerVersionPregunta(p);
                                const marcado = ajusteSeleccion.has(p._id);
                                const titulo = String(version?.enunciado ?? 'Pregunta').slice(0, 120);
                                return (
                                  <li key={p._id}>
                                    <label className="ajuste-check">
                                      <input
                                        type="checkbox"
                                        checked={marcado}
                                        onChange={() => {
                                          setAjusteSeleccion((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(p._id)) next.delete(p._id);
                                            else next.add(p._id);
                                            return next;
                                          });
                                        }}
                                      />
                                      <span>{titulo}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                          <div className="acciones ajuste-acciones">
                            <Boton
                              type="button"
                              icono={<Icono nombre="ok" />}
                              cargando={moviendoTema}
                              disabled={(ajusteAccion === 'mover' && !ajusteTemaDestinoId) || ajusteSeleccion.size === 0}
                              onClick={aplicarAjusteTema}
                            >
                              {moviendoTema
                                ? ajusteAccion === 'mover'
                                  ? 'Moviendo…'
                                  : 'Actualizando…'
                                : ajusteAccion === 'mover'
                                  ? 'Mover seleccionadas'
                                  : 'Quitar tema a seleccionadas'}
                            </Boton>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {periodoId && (
          <details className="colapsable mt-10" open={false}>
            <summary>
              <b>Sin tema</b>
              {` (${preguntasSinTema.length})`}
            </summary>
            <div className="ayuda">
              Preguntas que quedaron sin tema (por ejemplo, al recortar paginas). Puedes asignarlas a un tema aqui.
            </div>

            {preguntasSinTema.length === 0 ? (
              <div className="ayuda">No hay preguntas sin tema en esta materia.</div>
            ) : (
              <>
                <div className="ajuste-controles">
                  <label className="campo ajuste-campo ajuste-campo--tema">
                    Asignar a tema
                    <select
                      value={sinTemaDestinoId}
                      onChange={(event) => setSinTemaDestinoId(event.target.value)}
                      data-tooltip="Tema al que se asignaran las preguntas sin tema."
                    >
                      <option value="">Selecciona</option>
                      {temasBanco.map((x) => (
                        <option key={x._id} value={x._id}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Boton
                    type="button"
                    variante="secundario"
                    onClick={() => setSinTemaSeleccion(new Set(preguntasSinTema.map((p) => p._id)))}
                    disabled={preguntasSinTema.length === 0}
                    data-tooltip="Marca todas las preguntas sin tema."
                  >
                    Seleccionar todo
                  </Boton>
                  <Boton type="button" variante="secundario" onClick={() => setSinTemaSeleccion(new Set())} data-tooltip="Limpia la seleccion actual.">
                    Limpiar
                  </Boton>
                  <Boton
                    type="button"
                    icono={<Icono nombre="ok" />}
                    cargando={moviendoSinTema}
                    disabled={!sinTemaDestinoId || sinTemaSeleccion.size === 0}
                    onClick={asignarSinTemaATema}
                    data-tooltip="Asigna las preguntas seleccionadas al tema elegido."
                  >
                    {moviendoSinTema ? 'Asignando…' : `Asignar (${sinTemaSeleccion.size})`}
                  </Boton>
                </div>

                <div className="ajuste-scroll">
                  <ul className="lista">
                    {preguntasSinTema.map((p) => {
                      const v = obtenerVersionPregunta(p);
                      const marcado = sinTemaSeleccion.has(p._id);
                      const titulo = String(v?.enunciado ?? 'Pregunta').slice(0, 120);
                      return (
                        <li key={p._id}>
                          <label className="ajuste-check">
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => {
                                setSinTemaSeleccion((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(p._id)) next.delete(p._id);
                                  else next.add(p._id);
                                  return next;
                                });
                              }}
                            />
                            <span>{titulo}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}
          </details>
        )}
      </details>

      <div className="campo">
        <div className="ayuda">Opciones (marca una sola como correcta)</div>
        <div className="opciones-grid" role="group" aria-label="Opciones de respuesta">
          <div className="opciones-header">Opcion</div>
          <div className="opciones-header">Texto</div>
          <div className="opciones-header">Correcta</div>
          {opciones.map((opcion, idx) => (
            <div key={idx} className="opcion-fila">
              <div className="opcion-letra">{String.fromCharCode(65 + idx)}</div>
              <input
                value={opcion.texto}
                onChange={(event) => {
                  const copia = [...opciones];
                  copia[idx] = { ...copia[idx], texto: event.target.value };
                  setOpciones(copia);
                }}
                aria-label={`Texto opcion ${String.fromCharCode(65 + idx)}`}
                disabled={bloqueoEdicion}
              />
              <label className="opcion-correcta">
                <input
                  type="radio"
                  name="correcta"
                  checked={opcion.esCorrecta}
                  onChange={() => {
                    setOpciones(opciones.map((item, index) => ({ ...item, esCorrecta: index === idx })));
                  }}
                  disabled={bloqueoEdicion}
                />
                <span>Correcta</span>
              </label>
            </div>
          ))}
        </div>
      </div>
      <Boton
        type="button"
        icono={<Icono nombre="ok" />}
        cargando={guardando}
        disabled={!puedeGuardar || bloqueoEdicion}
        onClick={guardar}
        data-tooltip="Guarda la pregunta en el banco."
      >
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
            <textarea value={editEnunciado} onChange={(event) => setEditEnunciado(event.target.value)} disabled={bloqueoEdicion} />
          </label>
          <label className="campo">
            Imagen (opcional)
            <input
              type="file"
              accept="image/*"
              onChange={(event) => cargarImagenArchivo(event.currentTarget.files?.[0] ?? null, setEditImagenUrl)}
              disabled={bloqueoEdicion}
              data-tooltip="Actualiza la imagen de la pregunta."
            />
            {editImagenUrl && (
              <div className="imagen-preview">
                <img className="preview" src={editImagenUrl} alt="Imagen de la pregunta" />
                <Boton type="button" variante="secundario" onClick={() => setEditImagenUrl('')} data-tooltip="Quitar imagen">
                  Quitar imagen
                </Boton>
              </div>
            )}
          </label>
          <label className="campo">
            Tema
            <select value={editTema} onChange={(event) => setEditTema(event.target.value)} disabled={bloqueoEdicion}>
              <option value="">Selecciona</option>
              {editTema.trim() && !temasBanco.some((t) => t.nombre.toLowerCase() === editTema.trim().toLowerCase()) && (
                <option value={editTema}>{editTema} (no existe)</option>
              )}
              {temasBanco.map((t) => (
                <option key={t._id} value={t.nombre}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="campo">
            <div className="ayuda">Opciones (marca una sola como correcta)</div>
            <div className="opciones-grid" role="group" aria-label="Opciones de respuesta">
              <div className="opciones-header">Opcion</div>
              <div className="opciones-header">Texto</div>
              <div className="opciones-header">Correcta</div>
              {editOpciones.map((opcion, idx) => (
                <div key={idx} className="opcion-fila">
                  <div className="opcion-letra">{String.fromCharCode(65 + idx)}</div>
                  <input
                    value={opcion.texto}
                    onChange={(event) => {
                      const copia = [...editOpciones];
                      copia[idx] = { ...copia[idx], texto: event.target.value };
                      setEditOpciones(copia);
                    }}
                    aria-label={`Texto opcion ${String.fromCharCode(65 + idx)}`}
                    disabled={bloqueoEdicion}
                  />
                  <label className="opcion-correcta">
                    <input
                      type="radio"
                      name="correctaEdit"
                      checked={opcion.esCorrecta}
                      onChange={() => setEditOpciones(editOpciones.map((item, index) => ({ ...item, esCorrecta: index === idx })))}
                      disabled={bloqueoEdicion}
                    />
                    <span>Correcta</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="acciones">
            <Boton
              type="button"
              icono={<Icono nombre="ok" />}
              cargando={editando}
              disabled={!puedeGuardarEdicion || bloqueoEdicion}
              onClick={guardarEdicion}
              data-tooltip="Guarda los cambios de esta pregunta."
            >
              {editando ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
            <Boton type="button" variante="secundario" onClick={cancelarEdicion} data-tooltip="Descarta los cambios.">
              Cancelar
            </Boton>
          </div>
        </div>
      )}
      <h3>Preguntas recientes{periodoId ? ` (${preguntasMateria.length})` : ''}</h3>
      <ul className="lista lista-items">
        {!periodoId && <li>Selecciona una materia para ver sus preguntas.</li>}
        {periodoId && preguntasMateria.length === 0 && <li>No hay preguntas en esta materia.</li>}
        {periodoId &&
          preguntasMateria.map((pregunta) => (
            <li key={pregunta._id}>
              {(() => {
                const version = obtenerVersionPregunta(pregunta);
                const opcionesActuales = Array.isArray(version?.opciones) ? version?.opciones : [];
                const tieneCodigo = preguntaTieneCodigo(pregunta);
                return (
                  <div className="item-glass">
                    <div className="item-row">
                      <div>
                        <div className="item-title">{version?.enunciado ?? 'Pregunta'}</div>
                        <div className="item-meta">
                          <span>ID: {idCortoMateria(pregunta._id)}</span>
                          <span>Tema: {pregunta.tema ? pregunta.tema : '-'}</span>
                          {tieneCodigo && (
                            <span className="badge" title="Se detecto codigo (inline/backticks, bloques o patrones tipicos)">
                              <span className="dot" /> Codigo
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="item-actions">
                        <Boton
                          variante="secundario"
                          type="button"
                          onClick={() => iniciarEdicion(pregunta)}
                          disabled={bloqueoEdicion}
                          data-tooltip="Editar esta pregunta."
                        >
                          Editar
                        </Boton>
                        <Boton
                          type="button"
                          cargando={archivandoPreguntaId === pregunta._id}
                          onClick={() => archivarPregunta(pregunta._id)}
                          disabled={!puedeArchivar}
                          data-tooltip="Archivar la pregunta (no se borra)."
                        >
                          Archivar
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
  onVerArchivadas,
  permisos,
  puedeEliminarMateriaDev,
  enviarConPermiso,
  avisarSinPermiso
}: {
  periodos: Periodo[];
  onRefrescar: () => void;
  onVerArchivadas: () => void;
  permisos: PermisosUI;
  puedeEliminarMateriaDev: boolean;
  enviarConPermiso: EnviarConPermiso;
  avisarSinPermiso: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [grupos, setGrupos] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [creando, setCreando] = useState(false);
  const [archivandoId, setArchivandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const puedeGestionar = permisos.periodos.gestionar;
  const puedeArchivar = permisos.periodos.archivar;
  const bloqueoEdicion = !puedeGestionar;

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

  function normalizarTextoCorto(valor: string): string {
    return String(valor || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  const nombreValido = useMemo(() => {
    const limpio = normalizarTextoCorto(nombre);
    if (!limpio) return false;
    if (limpio.length < 3 || limpio.length > 80) return false;
    return patronNombreMateria.test(limpio);
  }, [nombre]);

  const nombreNormalizado = useMemo(() => normalizarNombreMateria(nombre), [nombre]);
  const nombreDuplicado = useMemo(() => {
    if (!nombreNormalizado) return false;
    return periodos.some((p) => normalizarNombreMateria(p.nombre) === nombreNormalizado);
  }, [nombreNormalizado, periodos]);

  const gruposNormalizados = useMemo(
    () =>
      (grupos || '')
        .split(',')
        .map((item) => normalizarTextoCorto(item))
        .filter(Boolean),
    [grupos]
  );
  const gruposDuplicados = useMemo(() => {
    const vistos = new Set<string>();
    for (const grupo of gruposNormalizados) {
      const clave = grupo.toLowerCase();
      if (vistos.has(clave)) return true;
      vistos.add(clave);
    }
    return false;
  }, [gruposNormalizados]);
  const gruposValidos = useMemo(() => {
    if (gruposNormalizados.length > 50) return false;
    return gruposNormalizados.every((g) => g.length >= 1 && g.length <= 40);
  }, [gruposNormalizados]);

  const puedeCrear = Boolean(
    nombreValido &&
      fechaInicio &&
      fechaFin &&
      fechaFin >= fechaInicio &&
      !nombreDuplicado &&
      gruposValidos &&
      !gruposDuplicados
  );

  async function crearPeriodo() {
    try {
      const inicio = Date.now();
      if (!puedeGestionar) {
        avisarSinPermiso('No tienes permiso para gestionar materias.');
        return;
      }
      setCreando(true);
      setMensaje('');
      await enviarConPermiso(
        'periodos:gestionar',
        '/periodos',
        {
          nombre: normalizarTextoCorto(nombre),
          fechaInicio,
          fechaFin,
          grupos: gruposNormalizados
        },
        'No tienes permiso para crear materias.'
      );
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
  async function archivarMateria(periodo: Periodo) {
    if (!puedeArchivar) {
      avisarSinPermiso('No tienes permiso para archivar materias.');
      return;
    }
    const confirmado = globalThis.confirm(
      `¿Archivar la materia "${etiquetaMateria(periodo)}"?\n\nSe ocultará de la lista de activas, pero NO se borrarán sus datos.`
    );
    if (!confirmado) return;

    try {
      const inicio = Date.now();
      setArchivandoId(periodo._id);
      setMensaje('');
      await enviarConPermiso(
        'periodos:archivar',
        `/periodos/${periodo._id}/archivar`,
        {},
        'No tienes permiso para archivar materias.'
      );
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

  async function eliminarMateriaDev(periodo: Periodo) {
    if (!puedeEliminarMateriaDev) {
      avisarSinPermiso('No tienes permiso para eliminar materias en desarrollo.');
      return;
    }
    const confirmado = globalThis.confirm(
      `¿Eliminar la materia "${etiquetaMateria(periodo)}"?\n\nEsta accion solo existe en desarrollo y borrara alumnos, banco, plantillas y examenes asociados.`
    );
    if (!confirmado) return;

    try {
      const inicio = Date.now();
      setEliminandoId(periodo._id);
      setMensaje('');
      await enviarConPermiso(
        'periodos:eliminar_dev',
        `/periodos/${periodo._id}/eliminar`,
        {},
        'No tienes permiso para eliminar materias en desarrollo.'
      );
      setMensaje('Materia eliminada');
      emitToast({ level: 'ok', title: 'Materias', message: 'Materia eliminada', durationMs: 2200 });
      registrarAccionDocente('eliminar_periodo', true, Date.now() - inicio);
      await Promise.resolve().then(() => onRefrescar());
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo eliminar la materia');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo eliminar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('eliminar_periodo', false);
    } finally {
      setEliminandoId(null);
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
        <p>
          Reglas: nombre entre 3 y 80 caracteres; grupos unicos (max 50) y cada grupo max 40 caracteres.
        </p>
      </AyudaFormulario>
      <label className="campo">
        Nombre de la materia
        <input value={nombre} onChange={(event) => setNombre(event.target.value)} disabled={bloqueoEdicion} />
      </label>
      {nombre.trim() && !nombreValido && (
        <InlineMensaje tipo="warning">El nombre debe tener entre 3 y 80 caracteres para poder crear la materia.</InlineMensaje>
      )}
      {nombre.trim() && nombreDuplicado && (
        <InlineMensaje tipo="error">Ya existe una materia con ese nombre. Cambia el nombre para crearla.</InlineMensaje>
      )}
      <label className="campo">
        Fecha inicio
        <input type="date" value={fechaInicio} onChange={(event) => setFechaInicio(event.target.value)} disabled={bloqueoEdicion} />
      </label>
      <label className="campo">
        Fecha fin
        <input type="date" value={fechaFin} onChange={(event) => setFechaFin(event.target.value)} disabled={bloqueoEdicion} />
      </label>
      {fechaInicio && fechaFin && fechaFin < fechaInicio && (
        <InlineMensaje tipo="error">La fecha fin debe ser igual o posterior a la fecha inicio.</InlineMensaje>
      )}
      <label className="campo">
        Grupos (separados por coma)
        <input value={grupos} onChange={(event) => setGrupos(event.target.value)} disabled={bloqueoEdicion} />
      </label>
      {!gruposValidos && grupos.trim() && (
        <InlineMensaje tipo="warning">Revisa grupos: máximo 50 y hasta 40 caracteres por grupo para poder crear la materia.</InlineMensaje>
      )}
      {gruposDuplicados && <InlineMensaje tipo="warning">Hay grupos repetidos; corrígelo para poder crear la materia.</InlineMensaje>}
      <Boton
        type="button"
        icono={<Icono nombre="nuevo" />}
        cargando={creando}
        disabled={!puedeCrear || bloqueoEdicion}
        onClick={crearPeriodo}
      >
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
                    disabled={!puedeArchivar}
                  >
                    Archivar
                  </Boton>
                  {puedeEliminarMateriaDev && (
                    <Boton
                      variante="secundario"
                      type="button"
                      cargando={eliminandoId === periodo._id}
                      onClick={() => void eliminarMateriaDev(periodo)}
                      disabled={!puedeEliminarMateriaDev}
                    >
                      Eliminar (DEV)
                    </Boton>
                  )}
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
  onVerActivas
}: {
  periodos: Periodo[];
  onVerActivas: () => void;
}) {

  function formatearFechaHora(valor?: string) {
    if (!valor) return '-';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor);
    return d.toLocaleString();
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
                  <div className="item-actions"></div>
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
  onRefrescar,
  permisos,
  puedeEliminarAlumnoDev,
  enviarConPermiso,
  avisarSinPermiso
}: {
  alumnos: Alumno[];
  periodosActivos: Periodo[];
  periodosTodos: Periodo[];
  onRefrescar: () => void;
  permisos: PermisosUI;
  puedeEliminarAlumnoDev: boolean;
  enviarConPermiso: EnviarConPermiso;
  avisarSinPermiso: (mensaje: string) => void;
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
  const [eliminandoAlumnoId, setEliminandoAlumnoId] = useState<string | null>(null);
  const puedeGestionar = permisos.alumnos.gestionar;
  const bloqueoEdicion = !puedeGestionar;

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
      .sort((a, b) => {
        const porFecha = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        if (porFecha !== 0) return porFecha;
        return String(b._id).localeCompare(String(a._id));
      });
  }, [alumnos, periodoIdLista]);

  const nombreMateriaSeleccionada = useMemo(() => {
    if (!periodoIdLista) return '';
    const periodo = periodosTodos.find((p) => p._id === periodoIdLista);
    return periodo ? etiquetaMateria(periodo) : '';
  }, [periodosTodos, periodoIdLista]);

  async function crearAlumno() {
    try {
      const inicio = Date.now();
      if (!puedeGestionar) {
        avisarSinPermiso('No tienes permiso para gestionar alumnos.');
        return;
      }
      if (dominiosPermitidos.length > 0 && correo.trim() && !correoValido) {
        const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
        registrarAccionDocente('crear_alumno', false);
        return;
      }
      setCreando(true);
      setMensaje('');
      await enviarConPermiso(
        'alumnos:gestionar',
        '/alumnos',
        {
          matricula: matriculaNormalizada,
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          ...(correo.trim() ? { correo: correo.trim() } : {}),
          ...(grupo.trim() ? { grupo: grupo.trim() } : {}),
          periodoId: periodoIdNuevo
        },
        'No tienes permiso para crear alumnos.'
      );
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
      if (!puedeGestionar) {
        avisarSinPermiso('No tienes permiso para editar alumnos.');
        return;
      }
      if (dominiosPermitidos.length > 0 && correo.trim() && !correoValido) {
        const msg = `Solo se permiten correos institucionales: ${politicaDominiosTexto}`;
        setMensaje(msg);
        emitToast({ level: 'error', title: 'Correo no permitido', message: msg, durationMs: 5200 });
        registrarAccionDocente('editar_alumno', false);
        return;
      }

      setGuardandoEdicion(true);
      setMensaje('');
      await enviarConPermiso(
        'alumnos:gestionar',
        `/alumnos/${editandoId}/actualizar`,
        {
          matricula: matriculaNormalizada,
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          ...(correo.trim() ? { correo: correo.trim() } : {}),
          ...(grupo.trim() ? { grupo: grupo.trim() } : {}),
          periodoId: periodoIdNuevo
        },
        'No tienes permiso para editar alumnos.'
      );

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

  async function eliminarAlumnoDev(alumno: Alumno) {
    if (!puedeEliminarAlumnoDev) {
      avisarSinPermiso('No tienes permiso para eliminar alumnos en desarrollo.');
      return;
    }
    const confirmado = globalThis.confirm(
      `¿Eliminar el alumno "${alumno.nombreCompleto}"?\n\nEsta accion solo existe en desarrollo y borrara examenes asociados.`
    );
    if (!confirmado) return;

    try {
      const inicio = Date.now();
      setEliminandoAlumnoId(alumno._id);
      setMensaje('');
      await enviarConPermiso(
        'alumnos:eliminar_dev',
        `/alumnos/${alumno._id}/eliminar`,
        {},
        'No tienes permiso para eliminar alumnos en desarrollo.'
      );
      setMensaje('Alumno eliminado');
      emitToast({ level: 'ok', title: 'Alumnos', message: 'Alumno eliminado', durationMs: 2200 });
      registrarAccionDocente('eliminar_alumno', true, Date.now() - inicio);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo eliminar el alumno');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo eliminar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('eliminar_alumno', false);
    } finally {
      setEliminandoAlumnoId(null);
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
          disabled={bloqueoEdicion}
        />
        <span className="ayuda">Formato: CUH######### (ej. CUH512410168).</span>
      </label>
      {matricula.trim() && !matriculaValida && (
        <InlineMensaje tipo="error">Matricula invalida. Usa el formato CUH#########.</InlineMensaje>
      )}
      <label className="campo">
        Nombres
        <input value={nombres} onChange={(event) => setNombres(event.target.value)} disabled={bloqueoEdicion} />
      </label>
      <label className="campo">
        Apellidos
        <input value={apellidos} onChange={(event) => setApellidos(event.target.value)} disabled={bloqueoEdicion} />
      </label>
      <label className="campo">
        Correo
        <input
          value={correo}
          onChange={(event) => {
            setCorreoAuto(false);
            setCorreo(event.target.value);
          }}
          disabled={bloqueoEdicion}
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
        <input value={grupo} onChange={(event) => setGrupo(event.target.value)} disabled={bloqueoEdicion} />
      </label>
      <label className="campo">
        Materia
        <select value={periodoIdNuevo} onChange={(event) => setPeriodoIdNuevo(event.target.value)} disabled={bloqueoEdicion}>
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
          <Boton
            type="button"
            icono={<Icono nombre="nuevo" />}
            cargando={creando}
            disabled={!puedeCrear || bloqueoEdicion}
            onClick={crearAlumno}
          >
            {creando ? 'Creando…' : 'Crear alumno'}
          </Boton>
        ) : (
          <>
            <Boton
              type="button"
              icono={<Icono nombre="ok" />}
              cargando={guardandoEdicion}
              disabled={!puedeGuardarEdicion || bloqueoEdicion}
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
                    <Boton variante="secundario" type="button" onClick={() => iniciarEdicion(alumno)} disabled={bloqueoEdicion}>
                      Editar
                    </Boton>
                    {puedeEliminarAlumnoDev && (
                      <Boton
                        variante="secundario"
                        type="button"
                        cargando={eliminandoAlumnoId === alumno._id}
                        onClick={() => void eliminarAlumnoDev(alumno)}
                        disabled={!puedeEliminarAlumnoDev}
                      >
                        Eliminar (DEV)
                      </Boton>
                    )}
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
  permisos,
  puedeEliminarPlantillaDev,
  enviarConPermiso,
  avisarSinPermiso,
  onRefrescar
}: {
  plantillas: Plantilla[];
  periodos: Periodo[];
  preguntas: Pregunta[];
  alumnos: Alumno[];
  permisos: PermisosUI;
  puedeEliminarPlantillaDev: boolean;
  enviarConPermiso: EnviarConPermiso;
  avisarSinPermiso: (mensaje: string) => void;
  onRefrescar: () => void;
}) {
  const INSTRUCCIONES_DEFAULT =
    'Por favor conteste las siguientes preguntas referentes al parcial. ' +
    'Rellene el círculo de la respuesta más adecuada, evitando salirse del mismo. ' +
    'Cada pregunta vale 10 puntos si está completa y es correcta.';

  type ExamenGeneradoResumen = {
    _id: string;
    folio: string;
    plantillaId: string;
    alumnoId?: string | null;
    estado?: string;
    generadoEn?: string;
    descargadoEn?: string;
    paginas?: Array<{ numero: number; qrTexto?: string; preguntasDel?: number; preguntasAl?: number }>;
  };

  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<'parcial' | 'global'>('parcial');
  const [periodoId, setPeriodoId] = useState('');
  const [numeroPaginas, setNumeroPaginas] = useState(2);
  const [temasSeleccionados, setTemasSeleccionados] = useState<string[]>([]);
  const [instrucciones, setInstrucciones] = useState(INSTRUCCIONES_DEFAULT);
  const [mensaje, setMensaje] = useState('');
  const [plantillaId, setPlantillaId] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [mensajeGeneracion, setMensajeGeneracion] = useState('');
  const [ultimoGenerado, setUltimoGenerado] = useState<ExamenGeneradoResumen | null>(null);
  const [examenesGenerados, setExamenesGenerados] = useState<ExamenGeneradoResumen[]>([]);
  const [cargandoExamenesGenerados, setCargandoExamenesGenerados] = useState(false);
  const [descargandoExamenId, setDescargandoExamenId] = useState<string | null>(null);
  const [regenerandoExamenId, setRegenerandoExamenId] = useState<string | null>(null);
  const [archivandoExamenId, setArchivandoExamenId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [generandoLote, setGenerandoLote] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [plantillaEditandoId, setPlantillaEditandoId] = useState<string | null>(null);
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
  const [archivandoPlantillaId, setArchivandoPlantillaId] = useState<string | null>(null);
  const [eliminandoPlantillaId, setEliminandoPlantillaId] = useState<string | null>(null);
  const [filtroPlantillas, setFiltroPlantillas] = useState('');
  const [refrescandoPlantillas, setRefrescandoPlantillas] = useState(false);
  const puedeLeerExamenes = permisos.examenes.leer;
  const puedeGenerarExamenes = permisos.examenes.generar;
  const puedeArchivarExamenes = permisos.examenes.archivar;
  const puedeRegenerarExamenes = permisos.examenes.regenerar;
  const puedeDescargarExamenes = permisos.examenes.descargar;
  const puedeGestionarPlantillas = permisos.plantillas.gestionar;
  const puedeArchivarPlantillas = permisos.plantillas.archivar;
  const puedePrevisualizarPlantillas = permisos.plantillas.previsualizar;
  const bloqueoEdicion = !puedeGestionarPlantillas;

  type PreviewPlantilla = {
    plantillaId: string;
    numeroPaginas: number;
    totalDisponibles?: number;
    totalUsados?: number;
    fraccionVaciaUltimaPagina?: number;
    advertencias?: string[];
    conteoPorTema?: Array<{ tema: string; disponibles: number }>;
    temasDisponiblesEnMateria?: Array<{ tema: string; disponibles: number }>;
    paginas: Array<{
      numero: number;
      preguntasDel: number;
      preguntasAl: number;
      elementos: string[];
      preguntas: Array<{ numero: number; id: string; tieneImagen: boolean; enunciadoCorto: string }>;
    }>;
  };
  const [previewPorPlantillaId, setPreviewPorPlantillaId] = useState<Record<string, PreviewPlantilla>>({});
  const [cargandoPreviewPlantillaId, setCargandoPreviewPlantillaId] = useState<string | null>(null);
  const [plantillaPreviewId, setPlantillaPreviewId] = useState<string | null>(null);
  const [previewPdfUrlPorPlantillaId, setPreviewPdfUrlPorPlantillaId] = useState<Record<string, string>>({});
  const [cargandoPreviewPdfPlantillaId, setCargandoPreviewPdfPlantillaId] = useState<string | null>(null);
  const [pdfFullscreenUrl, setPdfFullscreenUrl] = useState<string | null>(null);

  const abrirPdfFullscreen = useCallback((url: string) => {
    const u = String(url || '').trim();
    if (!u) return;
    setPdfFullscreenUrl(u);
  }, []);

  const cerrarPdfFullscreen = useCallback(() => {
    setPdfFullscreenUrl(null);
  }, []);

  const plantillaSeleccionada = useMemo(() => {
    return (Array.isArray(plantillas) ? plantillas : []).find((p) => p._id === plantillaId) ?? null;
  }, [plantillas, plantillaId]);

  const plantillaEditando = useMemo(() => {
    if (!plantillaEditandoId) return null;
    return (Array.isArray(plantillas) ? plantillas : []).find((p) => p._id === plantillaEditandoId) ?? null;
  }, [plantillas, plantillaEditandoId]);

  const alumnosPorId = useMemo(() => {
    const mapa = new Map<string, Alumno>();
    for (const a of Array.isArray(alumnos) ? alumnos : []) {
      mapa.set(a._id, a);
    }
    return mapa;
  }, [alumnos]);

  const formatearFechaHora = useCallback((valor?: string) => {
    const v = String(valor || '').trim();
    if (!v) return '-';
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return v;
    return d.toLocaleString();
  }, []);

  const cargarExamenesGenerados = useCallback(async () => {
    if (!plantillaId) {
      setExamenesGenerados([]);
      return;
    }
    if (!puedeLeerExamenes) {
      setExamenesGenerados([]);
      return;
    }
    try {
      setCargandoExamenesGenerados(true);
      const payload = await clienteApi.obtener<{ examenes: ExamenGeneradoResumen[] }>(
        `/examenes/generados?plantillaId=${encodeURIComponent(plantillaId)}&limite=50`
      );
      setExamenesGenerados(Array.isArray(payload.examenes) ? payload.examenes : []);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo cargar el listado de examenes generados');
      setMensajeGeneracion(msg);
    } finally {
      setCargandoExamenesGenerados(false);
    }
  }, [plantillaId, puedeLeerExamenes]);

  useEffect(() => {
    setUltimoGenerado(null);
    void cargarExamenesGenerados();
  }, [cargarExamenesGenerados]);

  const descargarPdfExamen = useCallback(
    async (examen: ExamenGeneradoResumen) => {
      if (descargandoExamenId === examen._id) return;
      if (!puedeDescargarExamenes) {
        avisarSinPermiso('No tienes permiso para descargar examenes.');
        return;
      }
      const token = obtenerTokenDocente();
      if (!token) {
        setMensajeGeneracion('Sesion no valida. Vuelve a iniciar sesion.');
        return;
      }

      const intentar = async (t: string) =>
        fetch(`${clienteApi.baseApi}/examenes/generados/${encodeURIComponent(examen._id)}/pdf`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${t}` }
        });

      try {
        setDescargandoExamenId(examen._id);
        setMensajeGeneracion('');

        let resp = await intentar(token);
        if (resp.status === 401) {
          const nuevo = await clienteApi.intentarRefrescarToken();
          if (nuevo) resp = await intentar(nuevo);
        }

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const blob = await resp.blob();
        const cd = resp.headers.get('Content-Disposition') || '';
        const match = cd.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i);
        const nombreDesdeHeader = match
          ? decodeURIComponent(String(match[1] || match[2] || match[3] || '').trim().replace(/^"|"$/g, ''))
          : '';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreDesdeHeader || `examen_${String(examen.folio || 'examen')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        emitToast({ level: 'ok', title: 'PDF', message: 'Descarga iniciada', durationMs: 1800 });
        await cargarExamenesGenerados();
      } catch (error) {
        const msg = mensajeDeError(error, 'No se pudo descargar el PDF');
        setMensajeGeneracion(msg);
        emitToast({
          level: 'error',
          title: 'No se pudo descargar',
          message: msg,
          durationMs: 5200,
          action: accionToastSesionParaError(error, 'docente')
        });
      } finally {
        setDescargandoExamenId(null);
      }
    },
    [avisarSinPermiso, cargarExamenesGenerados, descargandoExamenId, puedeDescargarExamenes]
  );

  const regenerarPdfExamen = useCallback(
    async (examen: ExamenGeneradoResumen) => {
      if (regenerandoExamenId === examen._id) return;
      if (!puedeRegenerarExamenes) {
        avisarSinPermiso('No tienes permiso para regenerar examenes.');
        return;
      }
      try {
        setMensajeGeneracion('');
        setRegenerandoExamenId(examen._id);

        const yaDescargado = Boolean(String(examen.descargadoEn || '').trim());

        let forzar = false;
        if (yaDescargado) {
          const ok = globalThis.confirm(
            'Este examen ya fue descargado. Regenerarlo puede cambiar el PDF (y tu copia descargada).\n\n¿Deseas continuar?'
          );
          if (!ok) return;
          forzar = true;
        }

        await enviarConPermiso(
          'examenes:regenerar',
          `/examenes/generados/${encodeURIComponent(examen._id)}/regenerar`,
          { ...(forzar ? { forzar: true } : {}) },
          'No tienes permiso para regenerar examenes.'
        );

        emitToast({ level: 'ok', title: 'Examen', message: 'PDF regenerado', durationMs: 2000 });
        await cargarExamenesGenerados();
      } catch (error) {
        const msg = mensajeDeError(error, 'No se pudo regenerar el PDF');
        setMensajeGeneracion(msg);
        emitToast({
          level: 'error',
          title: 'No se pudo regenerar',
          message: msg,
          durationMs: 5200,
          action: accionToastSesionParaError(error, 'docente')
        });
      } finally {
        setRegenerandoExamenId(null);
      }
    },
    [avisarSinPermiso, cargarExamenesGenerados, enviarConPermiso, puedeRegenerarExamenes, regenerandoExamenId]
  );

  const archivarExamenGenerado = useCallback(
    async (examen: ExamenGeneradoResumen) => {
      if (archivandoExamenId === examen._id) return;
      if (!puedeArchivarExamenes) {
        avisarSinPermiso('No tienes permiso para archivar examenes.');
        return;
      }
      try {
        setMensajeGeneracion('');
        setArchivandoExamenId(examen._id);

        const ok = globalThis.confirm(
          `¿Archivar el examen generado (folio: ${String(examen.folio || '').trim() || 'sin folio'})?\n\nSe ocultará del listado activo, pero no se borrarán sus datos.`
        );
        if (!ok) return;

        await enviarConPermiso(
          'examenes:archivar',
          `/examenes/generados/${encodeURIComponent(examen._id)}/archivar`,
          {},
          'No tienes permiso para archivar examenes.'
        );

        emitToast({ level: 'ok', title: 'Examen', message: 'Examen archivado', durationMs: 2000 });
        await cargarExamenesGenerados();
      } catch (error) {
        const msg = mensajeDeError(error, 'No se pudo archivar el examen');
        setMensajeGeneracion(msg);
        emitToast({
          level: 'error',
          title: 'No se pudo archivar',
          message: msg,
          durationMs: 5200,
          action: accionToastSesionParaError(error, 'docente')
        });
      } finally {
        setArchivandoExamenId(null);
      }
    },
    [avisarSinPermiso, cargarExamenesGenerados, enviarConPermiso, puedeArchivarExamenes, archivandoExamenId]
  );

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

  useEffect(() => {
    // Defaults para creacion.
    if (!modoEdicion) {
      setInstrucciones(INSTRUCCIONES_DEFAULT);
    }
  }, [modoEdicion, INSTRUCCIONES_DEFAULT]);

  const puedeCrear = Boolean(
    titulo.trim() &&
      periodoId &&
      temasSeleccionados.length > 0 &&
      numeroPaginas > 0
  );
  const puedeGenerar = Boolean(plantillaId) && puedeGenerarExamenes;

  const plantillasFiltradas = useMemo(() => {
    const q = String(filtroPlantillas || '').trim().toLowerCase();
    const lista = Array.isArray(plantillas) ? plantillas : [];
    const base = q
      ? lista.filter((p) => {
          const t = String(p.titulo || '').toLowerCase();
          const id = String(p._id || '').toLowerCase();
          const temas = (Array.isArray(p.temas) ? p.temas : []).join(' ').toLowerCase();
          return t.includes(q) || id.includes(q) || temas.includes(q);
        })
      : lista;
    return base;
  }, [plantillas, filtroPlantillas]);

  const totalPlantillas = plantillasFiltradas.length;
  const totalPlantillasTodas = Array.isArray(plantillas) ? plantillas.length : 0;

  async function refrescarPlantillas() {
    if (refrescandoPlantillas) return;
    try {
      setRefrescandoPlantillas(true);
      await Promise.resolve(onRefrescar());
    } finally {
      setRefrescandoPlantillas(false);
    }
  }

  function limpiarFiltroPlantillas() {
    setFiltroPlantillas('');
  }

  function iniciarEdicion(plantilla: Plantilla) {
    setModoEdicion(true);
    setPlantillaEditandoId(plantilla._id);
    setTitulo(String(plantilla.titulo || ''));
    setTipo(plantilla.tipo);
    setPeriodoId(String(plantilla.periodoId || ''));
    setNumeroPaginas(Number((plantilla as unknown as { numeroPaginas?: unknown })?.numeroPaginas ?? 1));
    setTemasSeleccionados(Array.isArray(plantilla.temas) ? plantilla.temas : []);
    setInstrucciones(String(plantilla.instrucciones || ''));
    setMensaje('');
  }

  function cancelarEdicion() {
    setModoEdicion(false);
    setPlantillaEditandoId(null);
    setTitulo('');
    setTipo('parcial');
    setPeriodoId('');
    setNumeroPaginas(2);
    setTemasSeleccionados([]);
    setInstrucciones(INSTRUCCIONES_DEFAULT);
    setMensaje('');
  }

  async function guardarEdicion() {
    if (!plantillaEditandoId || guardandoPlantilla) return;
    try {
      const inicio = Date.now();
      if (!puedeGestionarPlantillas) {
        avisarSinPermiso('No tienes permiso para editar plantillas.');
        return;
      }
      setGuardandoPlantilla(true);
      setMensaje('');

      const payload: Record<string, unknown> = {
        titulo: titulo.trim(),
        tipo,
        numeroPaginas: Math.max(1, Math.floor(numeroPaginas)),
        instrucciones: String(instrucciones || '').trim() || undefined
      };
      if (periodoId) payload.periodoId = periodoId;

      // Solo enviar temas si hay seleccion o si la plantilla ya estaba en modo temas.
      const temasPrevios =
        plantillaEditando && Array.isArray(plantillaEditando.temas) ? plantillaEditando.temas : [];
      const estabaEnTemas = temasPrevios.length > 0;
      if (temasSeleccionados.length > 0 || estabaEnTemas) {
        payload.temas = temasSeleccionados;
      }

      await enviarConPermiso(
        'plantillas:gestionar',
        `/examenes/plantillas/${encodeURIComponent(plantillaEditandoId)}`,
        payload,
        'No tienes permiso para editar plantillas.'
      );
      emitToast({ level: 'ok', title: 'Plantillas', message: 'Plantilla actualizada', durationMs: 2200 });
      registrarAccionDocente('actualizar_plantilla', true, Date.now() - inicio);
      cancelarEdicion();
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo actualizar la plantilla');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo actualizar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('actualizar_plantilla', false);
    } finally {
      setGuardandoPlantilla(false);
    }
  }

  async function archivarPlantilla(plantilla: Plantilla) {
    if (archivandoPlantillaId === plantilla._id) return;
    if (!puedeArchivarPlantillas) {
      avisarSinPermiso('No tienes permiso para archivar plantillas.');
      return;
    }
    const ok = globalThis.confirm(
      `¿Archivar la plantilla "${String(plantilla.titulo || '').trim()}"?\n\nSe ocultará del listado activo, pero no se borrarán sus datos.`
    );
    if (!ok) return;
    try {
      const inicio = Date.now();
      setArchivandoPlantillaId(plantilla._id);
      setMensaje('');
      await enviarConPermiso(
        'plantillas:archivar',
        `/examenes/plantillas/${encodeURIComponent(plantilla._id)}/archivar`,
        {},
        'No tienes permiso para archivar plantillas.'
      );
      emitToast({ level: 'ok', title: 'Plantillas', message: 'Plantilla archivada', durationMs: 2200 });
      registrarAccionDocente('archivar_plantilla', true, Date.now() - inicio);
      if (plantillaId === plantilla._id) setPlantillaId('');
      if (plantillaEditandoId === plantilla._id) cancelarEdicion();
      if (plantillaPreviewId === plantilla._id) setPlantillaPreviewId(null);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo archivar la plantilla');
      setMensaje(msg);

      // Caso especial: plantilla con exámenes generados (409). Ofrecemos atajo a la lista.
      if (error instanceof ErrorRemoto) {
        const codigo = String(error.detalle?.codigo || '').toUpperCase();
        if (codigo.includes('PLANTILLA_CON_EXAMENES')) {
          const detalles = error.detalle?.detalles as { totalGenerados?: unknown } | undefined;
          const total = Number(detalles?.totalGenerados ?? NaN);
          const totalOk = Number.isFinite(total) && total > 0;
          const msgDetallado = totalOk
            ? `No se puede archivar: hay ${total} examenes generados con esta plantilla. Archivarlos primero.`
            : msg;

          emitToast({
            level: 'warn',
            title: 'Plantilla con examenes',
            message: msgDetallado,
            durationMs: 6500,
            action: {
              label: 'Ver generados',
              onClick: () => {
                setPlantillaId(plantilla._id);
                // Esperar un tick para que renderice la sección.
                window.setTimeout(() => {
                  document.getElementById('examenes-generados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 200);
              }
            }
          });

          registrarAccionDocente('archivar_plantilla', false);
          return;
        }
      }

      emitToast({
        level: 'error',
        title: 'No se pudo archivar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('archivar_plantilla', false);
    } finally {
      setArchivandoPlantillaId(null);
    }
  }

  async function eliminarPlantillaDev(plantilla: Plantilla) {
    if (!puedeEliminarPlantillaDev) {
      avisarSinPermiso('No tienes permiso para eliminar plantillas en desarrollo.');
      return;
    }
    if (eliminandoPlantillaId === plantilla._id) return;
    const ok = globalThis.confirm(
      `¿Eliminar definitivamente la plantilla "${String(plantilla.titulo || '').trim()}"?\n\nEsta acción es solo para desarrollo y no se puede deshacer.`
    );
    if (!ok) return;
    try {
      const inicio = Date.now();
      setEliminandoPlantillaId(plantilla._id);
      setMensaje('');
      await enviarConPermiso(
        'plantillas:eliminar_dev',
        `/examenes/plantillas/${encodeURIComponent(plantilla._id)}/eliminar`,
        {},
        'No tienes permiso para eliminar plantillas en desarrollo.'
      );
      emitToast({ level: 'ok', title: 'Plantillas', message: 'Plantilla eliminada', durationMs: 2200 });
      registrarAccionDocente('eliminar_plantilla', true, Date.now() - inicio);
      if (plantillaId === plantilla._id) setPlantillaId('');
      if (plantillaEditandoId === plantilla._id) cancelarEdicion();
      if (plantillaPreviewId === plantilla._id) setPlantillaPreviewId(null);
      onRefrescar();
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo eliminar la plantilla');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'Plantillas',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('eliminar_plantilla', false);
    } finally {
      setEliminandoPlantillaId(null);
    }
  }

  async function cargarPreviewPlantilla(id: string) {
    if (cargandoPreviewPlantillaId === id) return;
    if (!puedePrevisualizarPlantillas) {
      avisarSinPermiso('No tienes permiso para previsualizar plantillas.');
      return;
    }
    try {
      setCargandoPreviewPlantillaId(id);
      const payload = await clienteApi.obtener<PreviewPlantilla>(
        `/examenes/plantillas/${encodeURIComponent(id)}/previsualizar`
      );
      setPreviewPorPlantillaId((prev) => ({ ...prev, [id]: payload }));
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo generar la previsualizacion de la plantilla');
      emitToast({
        level: 'error',
        title: 'Previsualizacion',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
    } finally {
      setCargandoPreviewPlantillaId(null);
    }
  }

  async function togglePreviewPlantilla(id: string) {
    if (cargandoPreviewPlantillaId === id) return;
    setPlantillaPreviewId((prev) => (prev === id ? null : id));
    if (!previewPorPlantillaId[id]) {
      await cargarPreviewPlantilla(id);
    }
  }

  async function cargarPreviewPdfPlantilla(id: string) {
    if (cargandoPreviewPdfPlantillaId === id) return;
    if (!puedePrevisualizarPlantillas) {
      avisarSinPermiso('No tienes permiso para previsualizar plantillas.');
      return;
    }
    const token = obtenerTokenDocente();
    if (!token) {
      emitToast({ level: 'error', title: 'Sesion no valida', message: 'Vuelve a iniciar sesion.', durationMs: 4200 });
      return;
    }

    const intentar = async (t: string) =>
      fetch(`${clienteApi.baseApi}/examenes/plantillas/${encodeURIComponent(id)}/previsualizar/pdf`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${t}` }
      });

    try {
      setCargandoPreviewPdfPlantillaId(id);
      let resp = await intentar(token);
      if (resp.status === 401) {
        const nuevo = await clienteApi.intentarRefrescarToken();
        if (nuevo) resp = await intentar(nuevo);
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setPreviewPdfUrlPorPlantillaId((prev) => {
        const anterior = prev[id];
        if (anterior) URL.revokeObjectURL(anterior);
        return { ...prev, [id]: url };
      });
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo generar el PDF de previsualizacion');
      emitToast({
        level: 'error',
        title: 'Previsualizacion PDF',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
    } finally {
      setCargandoPreviewPdfPlantillaId(null);
    }
  }

  function cerrarPreviewPdfPlantilla(id: string) {
    setPreviewPdfUrlPorPlantillaId((prev) => {
      const actual = prev[id];
      if (actual) URL.revokeObjectURL(actual);
      const copia = { ...prev };
      delete copia[id];
      return copia;
    });
  }

  async function crear() {
    if (creando) return;
    try {
      const inicio = Date.now();
      if (!puedeGestionarPlantillas) {
        avisarSinPermiso('No tienes permiso para crear plantillas.');
        return;
      }
      setCreando(true);
      setMensaje('');

      const payload: Record<string, unknown> = {
        tipo,
        titulo: titulo.trim(),
        instrucciones: String(instrucciones || '').trim() || undefined,
        numeroPaginas: Math.max(1, Math.floor(numeroPaginas))
      };
      const periodoIdNorm = String(periodoId || '').trim();
      if (periodoIdNorm) payload.periodoId = periodoIdNorm;
      if (temasSeleccionados.length > 0) payload.temas = temasSeleccionados;

      await enviarConPermiso(
        'plantillas:gestionar',
        '/examenes/plantillas',
        payload,
        'No tienes permiso para crear plantillas.'
      );
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
      <div className="plantillas-header">
        <h2>
          <Icono nombre="plantillas" /> Plantillas
        </h2>
        <div className="plantillas-actions">
          <Boton
            type="button"
            variante="secundario"
            icono={<Icono nombre="recargar" />}
            cargando={refrescandoPlantillas}
            onClick={() => void refrescarPlantillas()}
            data-tooltip="Recarga la lista de plantillas desde el servidor."
          >
            {refrescandoPlantillas ? 'Actualizando…' : 'Actualizar'}
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            disabled={!filtroPlantillas.trim()}
            onClick={limpiarFiltroPlantillas}
            data-tooltip="Quita el filtro de busqueda y muestra todas las plantillas."
          >
            Limpiar filtro
          </Boton>
        </div>
      </div>
      <div className="plantillas-grid">
        <div className="subpanel plantillas-panel plantillas-panel--form">
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
            <b>Numero de paginas:</b> cuantas paginas debe tener el examen (entero mayor o igual a 1).
          </li>
          <li>
            <b>Temas:</b> selecciona uno o mas; el examen toma preguntas al azar de esos temas.
          </li>
        </ul>
        <p>
          Ejemplo: titulo <code>Parcial 1 - Programacion</code>, tipo <code>parcial</code>, paginas <code>2</code>, temas: <code>Arreglos</code> + <code>Funciones</code>.
        </p>
      </AyudaFormulario>
      <div className="ayuda">
        {modoEdicion && plantillaEditando ? (
          <>
            Editando: <b>{plantillaEditando.titulo}</b> (ID: {idCortoMateria(plantillaEditando._id)})
          </>
        ) : (
          'Crea plantillas por temas, o edita una existente.'
        )}
      </div>
      <div className="plantillas-form">
        <label className="campo">
          Titulo
          <input
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            disabled={bloqueoEdicion}
            data-tooltip="Nombre visible de la plantilla."
          />
        </label>
        <label className="campo">
          Tipo
          <select
            value={tipo}
            onChange={(event) => setTipo(event.target.value as 'parcial' | 'global')}
            disabled={bloqueoEdicion}
            data-tooltip="Define si es parcial o global."
          >
            <option value="parcial">Parcial</option>
            <option value="global">Global</option>
          </select>
        </label>
        <label className="campo">
          Materia
          <select
            value={periodoId}
            onChange={(event) => setPeriodoId(event.target.value)}
            disabled={bloqueoEdicion}
            data-tooltip="Materia a la que pertenece la plantilla."
          >
            <option value="">Selecciona</option>
            {periodos.map((periodo) => (
              <option key={periodo._id} value={periodo._id} title={periodo._id}>
                {etiquetaMateria(periodo)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Numero de paginas
          <input
            type="number"
            min={1}
            step={1}
            value={numeroPaginas}
            onChange={(event) => setNumeroPaginas(Number(event.target.value))}
            disabled={bloqueoEdicion}
            data-tooltip="Cantidad total de paginas del examen."
          />
        </label>

        <label className="campo plantillas-form__full">
          Instrucciones (opcional)
          <textarea
            value={instrucciones}
            onChange={(event) => setInstrucciones(event.target.value)}
            rows={3}
            disabled={bloqueoEdicion}
            data-tooltip="Texto opcional que aparece en el examen."
          />
        </label>

        <label className="campo plantillas-form__full" data-tooltip="Selecciona los temas que alimentan la plantilla.">
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
                              disabled={bloqueoEdicion}
                              data-tooltip="Incluye este tema en la plantilla."
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
              Total disponible en temas seleccionados: {totalDisponiblePorTemas}. Paginas solicitadas: {Math.max(1, Math.floor(numeroPaginas))}.
              {' '}Si faltan preguntas, el sistema avisara; solo bloqueara si la ultima pagina queda mas de la mitad vacia.
            </span>
          )}
        </label>
      </div>
      <div className="acciones acciones--mt">
        {!modoEdicion && (
          <Boton
            type="button"
            icono={<Icono nombre="nuevo" />}
            cargando={creando}
            disabled={!puedeCrear || bloqueoEdicion}
            onClick={crear}
            data-tooltip="Crea una nueva plantilla con los datos actuales."
          >
            {creando ? 'Creando…' : 'Crear plantilla'}
          </Boton>
        )}
        {modoEdicion && (
          <>
            <Boton
              type="button"
              cargando={guardandoPlantilla}
              disabled={!titulo.trim() || guardandoPlantilla || bloqueoEdicion}
              onClick={() => void guardarEdicion()}
              data-tooltip="Guarda los cambios en la plantilla."
            >
              {guardandoPlantilla ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
            <Boton type="button" variante="secundario" onClick={cancelarEdicion} data-tooltip="Cancela la edicion actual.">
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
        </div>
        <div className="subpanel plantillas-panel plantillas-panel--lista">
          <h3>Plantillas existentes</h3>
          <div className="plantillas-panel__meta">
            <span>Total: {totalPlantillasTodas}</span>
            <span>Mostradas: {totalPlantillas}</span>
          </div>
      <div className="plantillas-filtro">
        <label className="campo plantillas-filtro__campo">
          Buscar
          <input
            value={filtroPlantillas}
            onChange={(e) => setFiltroPlantillas(e.target.value)}
            placeholder="Titulo, tema o ID…"
            data-tooltip="Filtra por titulo, tema o ID."
          />
        </label>
        <div className="plantillas-filtro__resultado">
          {filtroPlantillas.trim() ? `Filtro: "${filtroPlantillas.trim()}"` : 'Sin filtros aplicados'}
        </div>
      </div>
      {plantillasFiltradas.length === 0 ? (
        <InlineMensaje tipo="info">No hay plantillas con ese filtro. Ajusta la busqueda o crea una nueva.</InlineMensaje>
      ) : (
        <ul className="lista lista-items plantillas-lista">
          {plantillasFiltradas.map((plantilla) => {
            const materia = periodos.find((p) => p._id === plantilla.periodoId);
            const temas = Array.isArray(plantilla.temas) ? plantilla.temas : [];
            const modo = temas.length > 0 ? `Temas: ${temas.join(', ')}` : 'Modo legacy: preguntasIds';
            const preview = previewPorPlantillaId[plantilla._id];
            const previewAbierta = plantillaPreviewId === plantilla._id;
            const pdfUrl = previewPdfUrlPorPlantillaId[plantilla._id];
            return (
              <li key={plantilla._id}>
                <div className="item-glass">
                  <div className="item-row">
                    <div>
                      <div className="item-title">{plantilla.titulo}</div>
                      <div className="item-meta">
                        <span>ID: {idCortoMateria(plantilla._id)}</span>
                        <span>Tipo: {plantilla.tipo}</span>
                        <span>Paginas: {Number((plantilla as unknown as { numeroPaginas?: unknown })?.numeroPaginas ?? 0) || '-'}</span>
                        <span>Creada: {formatearFechaHora(plantilla.createdAt)}</span>
                        <span>Materia: {materia ? etiquetaMateria(materia) : '-'}</span>
                      </div>
                      <div className="item-sub">{modo}</div>
                      {previewAbierta && (
                        <div className="resultado plantillas-preview">
                          <h4 className="plantillas-preview__titulo">Previsualizacion (boceto por pagina)</h4>
                          {!preview && (
                            <div className="ayuda">
                              Esta previsualizacion usa una seleccion determinista de preguntas (para que no cambie cada vez) y bosqueja el contenido por pagina.
                            </div>
                          )}
                            {!preview && (
                              <Boton
                                type="button"
                                variante="secundario"
                                cargando={cargandoPreviewPlantillaId === plantilla._id}
                                onClick={() => void cargarPreviewPlantilla(plantilla._id)}
                                disabled={!puedePrevisualizarPlantillas}
                                data-tooltip="Genera el boceto de preguntas por pagina."
                              >
                                {cargandoPreviewPlantillaId === plantilla._id ? 'Generando…' : 'Generar previsualizacion'}
                              </Boton>
                            )}
                          {preview && (
                            <>
                              {Array.isArray(preview.advertencias) && preview.advertencias.length > 0 && (
                                <InlineMensaje tipo="info">{preview.advertencias.join(' ')}</InlineMensaje>
                              )}

                              {Array.isArray(preview.conteoPorTema) && preview.conteoPorTema.length > 0 && (
                                <div className="resultado plantillas-preview__bloque">
                                  <h4 className="plantillas-preview__subtitulo">Disponibles por tema</h4>
                                  <ul className="lista">
                                    {preview.conteoPorTema.map((t) => (
                                      <li key={t.tema}>
                                        <b>{t.tema}:</b> {t.disponibles}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {Array.isArray(preview.temasDisponiblesEnMateria) && preview.temasDisponiblesEnMateria.length > 0 && (
                                <div className="resultado plantillas-preview__bloque">
                                  <h4 className="plantillas-preview__subtitulo">Temas con preguntas en la materia (top)</h4>
                                  <div className="ayuda">Sirve para detectar temas mal escritos o con 0 reactivos.</div>
                                  <ul className="lista">
                                    {preview.temasDisponiblesEnMateria.map((t) => (
                                      <li key={`${t.tema}-${t.disponibles}`}>
                                        <b>{t.tema}:</b> {t.disponibles}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <div className="acciones acciones--mt">
                                {!pdfUrl ? (
                                  <Boton
                                    type="button"
                                    variante="secundario"
                                    cargando={cargandoPreviewPdfPlantillaId === plantilla._id}
                                    onClick={() => void cargarPreviewPdfPlantilla(plantilla._id)}
                                    disabled={!puedePrevisualizarPlantillas}
                                    data-tooltip="Genera el PDF final para revisarlo."
                                  >
                                    {cargandoPreviewPdfPlantillaId === plantilla._id ? 'Generando PDF…' : 'Ver PDF exacto'}
                                  </Boton>
                                ) : (
                                  <>
                                    <Boton
                                      type="button"
                                      variante="secundario"
                                      onClick={() => cerrarPreviewPdfPlantilla(plantilla._id)}
                                      data-tooltip="Oculta el PDF incrustado."
                                    >
                                      Ocultar PDF
                                    </Boton>
                                    <Boton
                                      type="button"
                                      variante="secundario"
                                      onClick={() => abrirPdfFullscreen(pdfUrl)}
                                      data-tooltip="Abre el PDF en pantalla completa."
                                    >
                                      Ver grande
                                    </Boton>
                                    <Boton
                                      type="button"
                                      variante="secundario"
                                      onClick={() => {
                                        const u = String(pdfUrl || '').trim();
                                        if (!u) return;
                                        window.open(u, '_blank', 'noopener,noreferrer');
                                      }}
                                      data-tooltip="Abre el PDF en una pestaña nueva."
                                    >
                                      Abrir en pestaña
                                    </Boton>
                                  </>
                                )}
                              </div>

                              {pdfUrl && (
                                <div className="plantillas-preview__pdfWrap">
                                  <iframe className="plantillas-preview__pdf" title="Previsualizacion PDF" src={pdfUrl} />
                                </div>
                              )}

                              {pdfFullscreenUrl && (
                                <div className="pdf-overlay" role="dialog" aria-modal="true">
                                  <div className="pdf-overlay__bar">
                                    <Boton
                                      type="button"
                                      variante="secundario"
                                      onClick={cerrarPdfFullscreen}
                                      data-tooltip="Cierra la vista de PDF a pantalla completa."
                                    >
                                      Cerrar
                                    </Boton>
                                  </div>
                                  <iframe className="pdf-overlay__frame" title="PDF (pantalla completa)" src={pdfFullscreenUrl} />
                                </div>
                              )}
                            <ul className="lista lista-items plantillas-preview__lista">
                              {preview.paginas.map((p) => (
                                <li key={p.numero}>
                                  <div className="item-glass">
                                    <div className="item-row">
                                      <div>
                                        <div className="item-title">Pagina {p.numero}</div>
                                        <div className="item-meta">
                                          <span>
                                            Preguntas: {p.preguntasDel && p.preguntasAl ? `${p.preguntasDel}–${p.preguntasAl}` : '—'}
                                          </span>
                                          <span>Elementos: {Array.isArray(p.elementos) ? p.elementos.length : 0}</span>
                                        </div>
                                        {Array.isArray(p.elementos) && p.elementos.length > 0 && (
                                          <div className="item-sub">{p.elementos.join(' · ')}</div>
                                        )}
                                        {Array.isArray(p.preguntas) && p.preguntas.length > 0 ? (
                                          <ul className="lista plantillas-preview__preguntas">
                                            {p.preguntas.map((q) => (
                                              <li key={q.numero}>
                                                <span>
                                                  <b>{q.numero}.</b> {q.enunciadoCorto}{' '}
                                                  {q.tieneImagen ? (
                                                    <span className="badge plantillas-preview__badgeImagen">Imagen</span>
                                                  ) : null}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <div className="ayuda">Sin preguntas (pagina extra o rangos no disponibles).</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="item-actions">
                      <Boton
                        type="button"
                        variante="secundario"
                        cargando={cargandoPreviewPlantillaId === plantilla._id}
                        onClick={() => void togglePreviewPlantilla(plantilla._id)}
                        disabled={!puedePrevisualizarPlantillas}
                        data-tooltip="Muestra u oculta la previsualizacion."
                      >
                        {previewAbierta ? 'Ocultar previsualizacion' : 'Previsualizar'}
                      </Boton>
                      <Boton
                        type="button"
                        variante="secundario"
                        onClick={() => iniciarEdicion(plantilla)}
                        disabled={!puedeGestionarPlantillas}
                        data-tooltip="Edita esta plantilla."
                      >
                        Editar
                      </Boton>
                      {puedeEliminarPlantillaDev && (
                        <Boton
                          type="button"
                          variante="secundario"
                          cargando={eliminandoPlantillaId === plantilla._id}
                          onClick={() => void eliminarPlantillaDev(plantilla)}
                          disabled={!puedeEliminarPlantillaDev}
                          data-tooltip="Elimina la plantilla (solo modo dev)."
                        >
                          Eliminar (DEV)
                        </Boton>
                      )}
                      <Boton
                        type="button"
                        variante="secundario"
                        cargando={archivandoPlantillaId === plantilla._id}
                        onClick={() => void archivarPlantilla(plantilla)}
                        disabled={!puedeArchivarPlantillas}
                        data-tooltip="Archiva la plantilla para ocultarla."
                      >
                        Archivar
                      </Boton>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
        </div>
      </div>

      <div className="plantillas-grid plantillas-grid--generacion">
        <div className="subpanel plantillas-panel plantillas-panel--generar">
          <h3>Generar examen</h3>
      <AyudaFormulario titulo="Generar examen (PDF)">
        <p>
          <b>Proposito:</b> crear un examen en PDF con <b>folio</b> y <b>QR por pagina</b>. Ese folio se usa para entrega y calificacion.
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
      <div className="plantillas-form">
        <label className="campo">
          Plantilla
          <select value={plantillaId} onChange={(event) => setPlantillaId(event.target.value)} data-tooltip="Selecciona la plantilla a generar.">
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
          <select value={alumnoId} onChange={(event) => setAlumnoId(event.target.value)} data-tooltip="Asocia el examen a un alumno (opcional).">
            <option value="">Sin alumno</option>
            {alumnos.map((alumno) => (
              <option key={alumno._id} value={alumno._id}>
                {alumno.matricula} - {alumno.nombreCompleto}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="acciones acciones--mt">
        <Boton
          className="boton"
          type="button"
          icono={<Icono nombre="pdf" />}
          cargando={generando}
          disabled={!puedeGenerar}
          data-tooltip="Genera el examen PDF usando la plantilla seleccionada."
          onClick={async () => {
            try {
              const inicio = Date.now();
              if (!puedeGenerarExamenes) {
                avisarSinPermiso('No tienes permiso para generar examenes.');
                return;
              }
              setGenerando(true);
              setMensajeGeneracion('');
              const payload = await enviarConPermiso<{ examenGenerado: ExamenGeneradoResumen; advertencias?: string[] }>(
                'examenes:generar',
                '/examenes/generados',
                {
                  plantillaId,
                  alumnoId: alumnoId || undefined
                },
                'No tienes permiso para generar examenes.'
              );
              const ex = payload?.examenGenerado ?? null;
              const adv = Array.isArray(payload?.advertencias) ? payload.advertencias : [];
              setUltimoGenerado(ex);
              setMensajeGeneracion(ex ? `Examen generado. Folio: ${ex.folio} (ID: ${idCortoMateria(ex._id)})` : 'Examen generado');
              emitToast({
                level: adv.length > 0 ? 'warn' : 'ok',
                title: 'Examen',
                message: adv.length > 0 ? `Examen generado. ${adv.join(' ')}` : 'Examen generado',
                durationMs: adv.length > 0 ? 6000 : 2200
              });
              registrarAccionDocente('generar_examen', true, Date.now() - inicio);
              await cargarExamenesGenerados();
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

        <Boton
          type="button"
          variante="secundario"
          icono={<Icono nombre="pdf" />}
          cargando={generandoLote}
          disabled={!plantillaId || !plantillaSeleccionada?.periodoId || !puedeGenerarExamenes}
          data-tooltip="Genera examenes para todos los alumnos activos de la materia."
          onClick={async () => {
            const ok = globalThis.confirm(
              '¿Generar examenes para TODOS los alumnos activos de la materia de esta plantilla? Esto puede tardar.'
            );
            if (!ok) return;
            try {
              const inicio = Date.now();
              if (!puedeGenerarExamenes) {
                avisarSinPermiso('No tienes permiso para generar examenes.');
                return;
              }
              setGenerandoLote(true);
              setMensajeGeneracion('');
              const payload = await enviarConPermiso<{ totalAlumnos: number; examenesGenerados: Array<{ folio: string }> }>(
                'examenes:generar',
                '/examenes/generados/lote',
                { plantillaId, confirmarMasivo: true },
                'No tienes permiso para generar examenes.',
                { timeoutMs: 120_000 }
              );
              const total = Number(payload?.totalAlumnos ?? 0);
              const generados = Array.isArray(payload?.examenesGenerados) ? payload.examenesGenerados.length : 0;
              setMensajeGeneracion(`Generacion masiva lista. Alumnos: ${total}. Examenes creados: ${generados}.`);
              emitToast({ level: 'ok', title: 'Examenes', message: 'Generacion masiva completada', durationMs: 2200 });
              registrarAccionDocente('generar_examenes_lote', true, Date.now() - inicio);
              await cargarExamenesGenerados();
            } catch (error) {
              const msg = mensajeDeError(error, 'No se pudo generar en lote');
              setMensajeGeneracion(msg);
              emitToast({
                level: 'error',
                title: 'No se pudo generar en lote',
                message: msg,
                durationMs: 5200,
                action: accionToastSesionParaError(error, 'docente')
              });
              registrarAccionDocente('generar_examenes_lote', false);
            } finally {
              setGenerandoLote(false);
            }
          }}
        >
          {generandoLote ? 'Generando para todos…' : 'Generar para todos los alumnos'}
        </Boton>
      </div>

      {plantillaId && !plantillaSeleccionada?.periodoId && (
        <div className="ayuda error">Esta plantilla no tiene materia (periodoId). No se puede generar en lote.</div>
      )}
      {mensajeGeneracion && (
        <p className={esMensajeError(mensajeGeneracion) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensajeGeneracion}
        </p>
      )}
        </div>
        <div className="subpanel plantillas-panel plantillas-panel--generados" id="examenes-generados">
          <h3>Examenes generados</h3>
          {!plantillaSeleccionada && (
            <InlineMensaje tipo="info">Selecciona una plantilla para ver los examenes generados y su historial.</InlineMensaje>
          )}
      {ultimoGenerado && (
        <div className="resultado" aria-label="Detalle del ultimo examen generado">
          <h4>Ultimo examen generado</h4>
          <div className="item-meta">
            <span>Folio: {ultimoGenerado.folio}</span>
            <span>ID: {idCortoMateria(ultimoGenerado._id)}</span>
            <span>Generado: {formatearFechaHora(ultimoGenerado.generadoEn)}</span>
          </div>
          {(() => {
            const paginas = Array.isArray(ultimoGenerado.paginas) ? ultimoGenerado.paginas : [];
            if (paginas.length === 0) return null;
            return (
            <details>
              <summary>Previsualizacion por pagina ({paginas.length})</summary>
              {(() => {
                const tieneRangos = paginas.some(
                  (p) => Number(p.preguntasDel ?? 0) > 0 && Number(p.preguntasAl ?? 0) > 0
                );
                return (
                  !tieneRangos && (
                    <div className="ayuda">
                      Rango por pagina no disponible en este examen (probablemente fue generado con una version anterior). Regenera para recalcular.
                    </div>
                  )
                );
              })()}
              <ul className="lista">
                {paginas.map((p) => {
                  const del = Number(p.preguntasDel ?? 0);
                  const al = Number(p.preguntasAl ?? 0);
                  const tieneRangos = paginas.some(
                    (x) => Number(x.preguntasDel ?? 0) > 0 && Number(x.preguntasAl ?? 0) > 0
                  );
                  const rango = del && al ? `Preguntas ${del}–${al}` : tieneRangos ? 'Sin preguntas (pagina extra)' : 'Rango no disponible';
                  return (
                    <li key={p.numero}>
                      Pagina {p.numero}: {rango}
                    </li>
                  );
                })}
              </ul>
            </details>
            );
          })()}
        </div>
      )}

      {plantillaSeleccionada && (
        <div className="resultado">
          <h3>Examenes generados (plantilla seleccionada)</h3>
          <div className="ayuda">
            Mostrando hasta 50, del mas reciente al mas antiguo. Al descargar se marca como descargado.
          </div>
          {cargandoExamenesGenerados && (
            <InlineMensaje tipo="info" leading={<Spinner />}>
              Cargando examenes generados…
            </InlineMensaje>
          )}
          <ul className="lista lista-items">
            {!cargandoExamenesGenerados && examenesGenerados.length === 0 && <li>No hay examenes generados para esta plantilla.</li>}
            {examenesGenerados.map((examen) => {
              const alumno = examen.alumnoId ? alumnosPorId.get(String(examen.alumnoId)) : null;
              const descargado = Boolean(String(examen.descargadoEn || '').trim());
              const regenerable = !examen.estado || String(examen.estado) === 'generado';
              return (
                <li key={examen._id}>
                  <div className="item-glass">
                    <div className="item-row">
                      <div>
                        <div className="item-title">Folio: {examen.folio}</div>
                        <div className="item-meta">
                          <span>ID: {idCortoMateria(examen._id)}</span>
                          <span>Generado: {formatearFechaHora(examen.generadoEn)}</span>
                          <span>
                            Descargado: {descargado ? formatearFechaHora(examen.descargadoEn) : 'No'}
                          </span>
                        </div>
                        <div className="item-sub">
                          Alumno: {alumno ? `${alumno.matricula} - ${alumno.nombreCompleto}` : examen.alumnoId ? `ID ${idCortoMateria(String(examen.alumnoId))}` : 'Sin alumno'}
                        </div>
                        {(() => {
                          const paginas = Array.isArray(examen.paginas) ? examen.paginas : [];
                          if (paginas.length === 0) return null;
                          return (
                          <details>
                            <summary>Previsualizacion por pagina ({paginas.length})</summary>
                            {(() => {
                              const tieneRangos = paginas.some(
                                (p) => Number(p.preguntasDel ?? 0) > 0 && Number(p.preguntasAl ?? 0) > 0
                              );
                              return (
                                !tieneRangos && (
                                  <div className="ayuda">
                                    Rango por pagina no disponible en este examen. Regenera si necesitas la previsualizacion.
                                  </div>
                                )
                              );
                            })()}
                            <ul className="lista">
                              {paginas.map((p) => {
                                const del = Number(p.preguntasDel ?? 0);
                                const al = Number(p.preguntasAl ?? 0);
                                const tieneRangos = paginas.some(
                                  (x) => Number(x.preguntasDel ?? 0) > 0 && Number(x.preguntasAl ?? 0) > 0
                                );
                                const rango = del && al ? `Preguntas ${del}–${al}` : tieneRangos ? 'Sin preguntas (pagina extra)' : 'Rango no disponible';
                                return (
                                  <li key={p.numero}>
                                    Pagina {p.numero}: {rango}
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                          );
                        })()}
                      </div>
                      <div className="item-actions">
                        {regenerable && (
                          <Boton
                            type="button"
                            variante="secundario"
                            icono={<Icono nombre="recargar" />}
                            cargando={regenerandoExamenId === examen._id}
                            disabled={!puedeRegenerarExamenes || descargandoExamenId === examen._id || archivandoExamenId === examen._id}
                            onClick={() => void regenerarPdfExamen(examen)}
                          >
                            Regenerar
                          </Boton>
                        )}
                        <Boton
                          type="button"
                          variante="secundario"
                          icono={<Icono nombre="pdf" />}
                          cargando={descargandoExamenId === examen._id}
                          disabled={!puedeDescargarExamenes || regenerandoExamenId === examen._id || archivandoExamenId === examen._id}
                          onClick={() => void descargarPdfExamen(examen)}
                        >
                          Descargar
                        </Boton>
                        {regenerable && (
                          <Boton
                            type="button"
                            variante="secundario"
                            className="peligro"
                            icono={<Icono nombre="alerta" />}
                            cargando={archivandoExamenId === examen._id}
                            disabled={!puedeArchivarExamenes || descargandoExamenId === examen._id || regenerandoExamenId === examen._id}
                            onClick={() => void archivarExamenGenerado(examen)}
                          >
                            Archivar
                          </Boton>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

function SeccionRegistroEntrega({
  alumnos,
  onVincular,
  puedeGestionar,
  avisarSinPermiso
}: {
  alumnos: Alumno[];
  onVincular: (folio: string, alumnoId: string) => Promise<unknown>;
  puedeGestionar: boolean;
  avisarSinPermiso: (mensaje: string) => void;
}) {
  const [folio, setFolio] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [vinculando, setVinculando] = useState(false);
  const [scanError, setScanError] = useState('');
  const [escaneando, setEscaneando] = useState(false);
  const inputCamRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const jsQrRef = useRef<((data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }) => { data: string } | null) | null>(null);
  type BarcodeDetectorCtor = new (opts: { formats: string[] }) => {
    detect: (img: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
  };

  const puedeVincular = Boolean(folio.trim() && alumnoId);
  const bloqueoEdicion = !puedeGestionar;

  function extraerFolioDesdeQr(texto: string) {
    const limpio = String(texto ?? '').trim();
    if (!limpio) return '';
    const upper = limpio.toUpperCase();
    const matchExamen = upper.match(/EXAMEN:([^:\s]+)(:P\d+)?/);
    if (matchExamen?.[1]) return String(matchExamen[1] ?? '').trim();
    const matchFolio = upper.match(/\bFOLIO[-_ ]?[A-Z0-9]+\b/);
    if (matchFolio?.[0]) return matchFolio[0].replace(/\s+/g, '').trim();
    if (/^https?:\/\//i.test(upper)) return '';
    if (upper.startsWith('EXAMEN:')) {
      const partes = upper.split(':');
      return String(partes[1] ?? '').trim();
    }
    return upper;
  }

  async function cargarImagen(file: File): Promise<HTMLImageElement> {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  async function leerQrConBarcodeDetector(file: File) {
    if (typeof window === 'undefined') return '';
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector || typeof createImageBitmap !== 'function') return '';
    try {
      const detector = new Detector({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const codigos = await detector.detect(bitmap);
      if (typeof bitmap.close === 'function') bitmap.close();
      return String(codigos?.[0]?.rawValue ?? '').trim();
    } catch {
      return '';
    }
  }

  async function leerQrConJsQr(file: File) {
    if (typeof window === 'undefined') return '';
    const { default: jsQR } = await import('jsqr');
    const source = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : await cargarImagen(file);
    const width = 'width' in source ? Number(source.width) : Number((source as HTMLImageElement).naturalWidth);
    const height = 'height' in source ? Number(source.height) : Number((source as HTMLImageElement).naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(source, 0, 0, width, height);
    if ('close' in source && typeof source.close === 'function') source.close();
    const imageData = ctx.getImageData(0, 0, width, height);
    const resultado = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return String(resultado?.data ?? '').trim();
  }

  async function asegurarJsQr() {
    if (jsQrRef.current) return jsQrRef.current;
    const { default: jsQR } = await import('jsqr');
    jsQrRef.current = jsQR;
    return jsQR;
  }

  function detenerCamara() {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    setEscaneando(false);
  }

  async function iniciarCamara() {
    setScanError('');
    if (!navigator?.mediaDevices?.getUserMedia) {
      setScanError('Este navegador no permite camara en vivo. Usa foto.');
      inputCamRef.current?.click();
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setScanError('La camara en vivo suele requerir HTTPS. Si falla, usa foto.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      mediaStreamRef.current = stream;
      setEscaneando(true);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const jsQR = await asegurarJsQr();
      const scan = () => {
        const currentVideo = videoRef.current;
        if (!currentVideo || !mediaStreamRef.current) return;
        if (currentVideo.readyState < 2) {
          rafRef.current = window.requestAnimationFrame(scan);
          return;
        }
        const width = currentVideo.videoWidth || 0;
        const height = currentVideo.videoHeight || 0;
        if (!width || !height) {
          rafRef.current = window.requestAnimationFrame(scan);
          return;
        }
        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          rafRef.current = window.requestAnimationFrame(scan);
          return;
        }
        ctx.drawImage(currentVideo, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const resultado = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        const valor = String(resultado?.data ?? '').trim();
        const folioDetectado = extraerFolioDesdeQr(valor);
        if (folioDetectado) {
          setScanError('');
          setFolio(folioDetectado);
          emitToast({ level: 'ok', title: 'QR', message: 'Folio capturado', durationMs: 2000 });
          detenerCamara();
          return;
        }
        rafRef.current = window.requestAnimationFrame(scan);
      };
      rafRef.current = window.requestAnimationFrame(scan);
    } catch (error) {
      detenerCamara();
      const msg = mensajeUsuarioDeErrorConSugerencia(error, 'No se pudo abrir la camara. Usa foto.');
      setScanError(msg);
      inputCamRef.current?.click();
    }
  }

  async function analizarQrDesdeImagen(file: File) {
    if (typeof window === 'undefined') return;
    try {
      let valor = await leerQrConBarcodeDetector(file);
      if (!valor) {
        valor = await leerQrConJsQr(file);
      }
      if (!valor) {
        setScanError('No se detecto ningun QR. Intenta de nuevo con buena luz.');
        return;
      }
      const folioDetectado = extraerFolioDesdeQr(valor);
      if (!folioDetectado) {
        const esUrl = /^https?:\/\//i.test(valor);
        setScanError(esUrl
          ? 'Se detecto un enlace (QR de acceso). Escanea el QR del examen.'
          : 'No se detecto un folio valido. Escanea el QR del examen.');
        return;
      }
      setScanError('');
      setFolio(folioDetectado);
      emitToast({ level: 'ok', title: 'QR', message: 'Folio capturado', durationMs: 2000 });
    } catch (error) {
      const msg = mensajeUsuarioDeErrorConSugerencia(error, 'No se pudo leer el QR. Intenta de nuevo o captura el folio manualmente.');
      setScanError(msg);
    }
  }

  function abrirCamara() {
    setScanError('');
    void iniciarCamara();
  }

  useEffect(() => {
    return () => {
      detenerCamara();
    };
  }, []);

  async function vincular() {
    try {
      const inicio = Date.now();
      if (!puedeGestionar) {
        avisarSinPermiso('No tienes permiso para vincular entregas.');
        return;
      }
      setVinculando(true);
      setMensaje('');
      await onVincular(folio.trim(), alumnoId);
      setMensaje('Entrega vinculada');
      emitToast({ level: 'ok', title: 'Entrega', message: 'Entrega vinculada', durationMs: 2200 });
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
        <Icono nombre="recepcion" /> Registro de entrega
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
      <div className="subpanel guia-visual">
        <h3>
          <Icono nombre="recepcion" /> Guia rapida (movil o manual)
        </h3>
        <div className="guia-flujo" aria-hidden="true">
          <Icono nombre="pdf" />
          <Icono nombre="chevron" className="icono icono--muted" />
          <Icono nombre="escaneo" />
          <Icono nombre="chevron" className="icono icono--muted" />
          <Icono nombre="alumno" />
          <span>Examen a folio a alumno</span>
        </div>
        <div className="guia-grid">
          <QrAccesoMovil vista="entrega" />
          <div className="item-glass guia-card">
            <div className="guia-card__header">
              <span className="chip chip-static" aria-hidden="true">
                <Icono nombre="escaneo" /> Con movil
              </span>
            </div>
            <ul className="guia-pasos">
              <li className="guia-paso">
                <span className="paso-num">1</span>
                <div>
                  <div className="paso-titulo">Abre la vista en el movil</div>
                  <p className="nota">
                    Si ya estas en movil, el QR no se muestra. Si estas en PC, escanea el QR para abrir esta vista en el telefono.
                  </p>
                </div>
              </li>
              <li className="guia-paso">
                <span className="paso-num">2</span>
                <div>
                  <div className="paso-titulo">Escanea el QR del examen</div>
                  <p className="nota">
                    Usa la camara del celular (desde la app o la camara del sistema) para leer el folio.
                  </p>
                </div>
              </li>
              <li className="guia-paso">
                <span className="paso-num">3</span>
                <div>
                  <div className="paso-titulo">Selecciona al alumno</div>
                  <p className="nota">Vincula y confirma para evitar errores de calificacion.</p>
                </div>
              </li>
            </ul>
          </div>
          <div className="item-glass guia-card">
            <div className="guia-card__header">
              <span className="chip chip-static" aria-hidden="true">
                <Icono nombre="recepcion" /> Manual
              </span>
            </div>
            <ul className="guia-pasos">
              <li className="guia-paso">
                <span className="paso-num">1</span>
                <div>
                  <div className="paso-titulo">Ubica el folio impreso</div>
                  <p className="nota">Copialo tal cual aparece en la hoja.</p>
                </div>
              </li>
              <li className="guia-paso">
                <span className="paso-num">2</span>
                <div>
                  <div className="paso-titulo">Captura folio y alumno</div>
                  <p className="nota">Elige el alumno correcto antes de vincular.</p>
                </div>
              </li>
              <li className="guia-paso">
                <span className="paso-num">3</span>
                <div>
                  <div className="paso-titulo">Vincula y guarda</div>
                  <p className="nota">Confirma el mensaje de Entrega vinculada.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="subpanel">
        <Boton type="button" icono={<Icono nombre="escaneo" />} onClick={abrirCamara}>
          Escanear QR del examen
        </Boton>
        {escaneando && (
          <div className="item-glass guia-card">
            <div className="guia-card__header">
              <span className="chip chip-static" aria-hidden="true">
                <Icono nombre="escaneo" /> Camara activa
              </span>
              <Boton type="button" variante="secundario" onClick={detenerCamara}>
                Cerrar camara
              </Boton>
            </div>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', maxWidth: '320px', borderRadius: '16px', background: '#000' }}
            />
            <div className="nota">Apunta al QR del examen para capturar el folio.</div>
          </div>
        )}
        <input
          ref={inputCamRef}
          className="input-file-oculto"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void analizarQrDesdeImagen(file);
            event.currentTarget.value = '';
          }}
        />
        {scanError && (
          <InlineMensaje tipo="warning">
            {scanError}
          </InlineMensaje>
        )}
      </div>
      <label className="campo">
        Folio
        <input value={folio} onChange={(event) => setFolio(event.target.value)} disabled={bloqueoEdicion} />
      </label>
      <label className="campo">
        Alumno
        <select value={alumnoId} onChange={(event) => setAlumnoId(event.target.value)} disabled={bloqueoEdicion}>
          <option value="">Selecciona</option>
          {alumnos.map((alumno) => (
            <option key={alumno._id} value={alumno._id}>
              {alumno.matricula} - {alumno.nombreCompleto}
            </option>
          ))}
        </select>
      </label>
      <Boton
        type="button"
        icono={<Icono nombre="recepcion" />}
        cargando={vinculando}
        disabled={!puedeVincular || bloqueoEdicion}
        onClick={vincular}
      >
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

function SeccionEntrega({
  alumnos,
  periodos,
  onVincular,
  permisos,
  avisarSinPermiso,
  enviarConPermiso
}: {
  alumnos: Alumno[];
  periodos: Periodo[];
  onVincular: (folio: string, alumnoId: string) => Promise<unknown>;
  permisos: PermisosUI;
  avisarSinPermiso: (mensaje: string) => void;
  enviarConPermiso: EnviarConPermiso;
}) {
  type ExamenGeneradoEntrega = {
    _id: string;
    folio: string;
    alumnoId?: string | null;
    estado?: string;
    periodoId?: string;
    generadoEn?: string;
    entregadoEn?: string;
  };

  const [periodoId, setPeriodoId] = useState('');
  const [filtro, setFiltro] = useState('');
  const [examenes, setExamenes] = useState<ExamenGeneradoEntrega[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [deshaciendoFolio, setDeshaciendoFolio] = useState<string | null>(null);
  const puedeGestionar = permisos.entregas.gestionar;
  const puedeLeer = permisos.examenes.leer;

  useEffect(() => {
    if (periodoId || periodos.length === 0) return;
    const primero = periodos[0]?._id ?? '';
    if (primero) setPeriodoId(primero);
  }, [periodoId, periodos]);

  const alumnosPorId = useMemo(() => {
    const mapa = new Map<string, Alumno>();
    for (const a of Array.isArray(alumnos) ? alumnos : []) {
      mapa.set(a._id, a);
    }
    return mapa;
  }, [alumnos]);

  const formatearFechaHora = useCallback((valor?: string) => {
    const v = String(valor || '').trim();
    if (!v) return '-';
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return v;
    return d.toLocaleString();
  }, []);

  const cargarExamenes = useCallback(async () => {
    if (!periodoId) {
      setExamenes([]);
      return;
    }
    if (!puedeLeer && !puedeGestionar) {
      setExamenes([]);
      return;
    }
    try {
      setCargando(true);
      setMensaje('');
      const payload = await clienteApi.obtener<{ examenes: ExamenGeneradoEntrega[] }>(
        `/examenes/generados?periodoId=${encodeURIComponent(periodoId)}`
      );
      setExamenes(Array.isArray(payload.examenes) ? payload.examenes : []);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo cargar el listado de examenes');
      setMensaje(msg);
    } finally {
      setCargando(false);
    }
  }, [periodoId, puedeLeer, puedeGestionar]);

  useEffect(() => {
    void cargarExamenes();
  }, [cargarExamenes]);

  const vincularYRefrescar = useCallback(
    async (folio: string, alumnoId: string) => {
      await onVincular(folio, alumnoId);
      await cargarExamenes();
    },
    [onVincular, cargarExamenes]
  );

  const deshacerEntrega = useCallback(
    async (folio: string) => {
      if (!puedeGestionar) {
        avisarSinPermiso('No tienes permiso para deshacer entregas.');
        return;
      }
      const confirmar = window.confirm(
        `¿Deshacer la entrega del folio ${folio}? Esto desvincula al alumno y regresa el examen a "generado".`
      );
      if (!confirmar) return;
      const motivo = window.prompt('Motivo para deshacer la entrega:', '');
      try {
        setDeshaciendoFolio(folio);
        const payload: Record<string, string> = { folio };
        if (motivo && motivo.trim()) payload.motivo = motivo.trim();
        await enviarConPermiso('entregas:gestionar', '/entregas/deshacer-folio', payload, 'No tienes permiso para deshacer entregas.');
        emitToast({ level: 'ok', title: 'Entrega', message: 'Entrega revertida', durationMs: 2200 });
        await cargarExamenes();
      } catch (error) {
        const msg = mensajeDeError(error, 'No se pudo deshacer la entrega');
        emitToast({
          level: 'error',
          title: 'No se pudo deshacer',
          message: msg,
          durationMs: 5200,
          action: accionToastSesionParaError(error, 'docente')
        });
      } finally {
        setDeshaciendoFolio((actual) => (actual === folio ? null : actual));
      }
    },
    [avisarSinPermiso, cargarExamenes, enviarConPermiso, puedeGestionar]
  );

  const filtroNormalizado = filtro.trim().toLowerCase();
  const examenesFiltrados = useMemo(() => {
    if (!filtroNormalizado) return examenes;
    return examenes.filter((examen) => {
      const alumno = examen.alumnoId ? alumnosPorId.get(examen.alumnoId) : null;
      const texto = [
        examen.folio,
        alumno?.matricula ?? '',
        alumno?.nombreCompleto ?? ''
      ]
        .join(' ')
        .toLowerCase();
      return texto.includes(filtroNormalizado);
    });
  }, [examenes, filtroNormalizado, alumnosPorId]);

  const entregados = useMemo(() => {
    return examenesFiltrados.filter((examen) => {
      const estado = String(examen.estado ?? '').toLowerCase();
      return estado === 'entregado' || estado === 'calificado';
    });
  }, [examenesFiltrados]);

  const pendientes = useMemo(() => {
    return examenesFiltrados.filter((examen) => {
      const estado = String(examen.estado ?? '').toLowerCase();
      return estado !== 'entregado' && estado !== 'calificado';
    });
  }, [examenesFiltrados]);

  return (
    <>
      <div className="panel">
        <h2>
          <Icono nombre="recepcion" /> Entrega de examenes
        </h2>
        <AyudaFormulario titulo="Resumen de entrega">
          <p>
            <b>Proposito:</b> registrar entregas y ver el estado de cada examen generado.
            Los entregados muestran fecha de entrega; los pendientes indican folios sin registro.
          </p>
          <ul className="lista">
            <li>
              <b>Entregados:</b> estado entregado o calificado.
            </li>
            <li>
              <b>Pendientes:</b> estado generado (aun sin entrega).
            </li>
          </ul>
        </AyudaFormulario>
      </div>

      <SeccionRegistroEntrega
        alumnos={alumnos}
        onVincular={vincularYRefrescar}
        puedeGestionar={puedeGestionar}
        avisarSinPermiso={avisarSinPermiso}
      />

      <div className="panel">
        <div className="item-row">
          <div>
            <h3>Estado de entregas</h3>
            <div className="nota">
              Total: {examenesFiltrados.length} · Entregados: {entregados.length} · Pendientes: {pendientes.length}
            </div>
          </div>
          <div className="item-actions">
            <Boton type="button" variante="secundario" onClick={() => void cargarExamenes()}>
              Refrescar
            </Boton>
          </div>
        </div>

        <label className="campo">
          Materia
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
          Buscar (folio o alumno)
          <input
            value={filtro}
            onChange={(event) => setFiltro(event.target.value)}
            placeholder="FOLIO-000123 o 2024-001"
          />
        </label>

        {mensaje && <InlineMensaje tipo="error">{mensaje}</InlineMensaje>}
        {cargando && (
          <p className="mensaje" role="status">
            <Spinner /> Cargando entregas…
          </p>
        )}

        <div className="resultado">
          <h3>Entregados</h3>
          {entregados.length === 0 && !cargando && <p className="nota">Aun no hay entregas registradas.</p>}
          <ul className="lista lista-items">
            {entregados.map((examen) => {
              const alumno = examen.alumnoId ? alumnosPorId.get(examen.alumnoId) : null;
              const alumnoTexto = alumno ? `${alumno.matricula} - ${alumno.nombreCompleto}` : 'Sin alumno';
              const bloqueando = deshaciendoFolio === examen.folio;
              return (
                <li key={examen._id}>
                  <div className="item-glass">
                    <div className="item-row">
                      <div>
                        <div className="item-title">Folio {examen.folio}</div>
                        <div className="item-meta">
                          <span>Alumno: {alumnoTexto}</span>
                          <span>Entrega: {formatearFechaHora(examen.entregadoEn)}</span>
                          <span>Estado: {String(examen.estado ?? 'entregado')}</span>
                        </div>
                      </div>
                      <div className="item-actions">
                        <Boton
                          type="button"
                          variante="secundario"
                          disabled={bloqueando || !puedeGestionar}
                          onClick={() => void deshacerEntrega(examen.folio)}
                        >
                          {bloqueando ? (
                            <>
                              <Spinner /> Deshaciendo…
                            </>
                          ) : (
                            'Deshacer entrega'
                          )}
                        </Boton>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="resultado">
          <h3>Pendientes</h3>
          {pendientes.length === 0 && !cargando && <p className="nota">No hay pendientes.</p>}
          <ul className="lista lista-items">
            {pendientes.map((examen) => {
              const alumno = examen.alumnoId ? alumnosPorId.get(examen.alumnoId) : null;
              const alumnoTexto = alumno ? `${alumno.matricula} - ${alumno.nombreCompleto}` : 'Sin alumno';
              return (
                <li key={examen._id}>
                  <div className="item-glass">
                    <div className="item-row">
                      <div>
                        <div className="item-title">Folio {examen.folio}</div>
                        <div className="item-meta">
                          <span>Alumno: {alumnoTexto}</span>
                          <span>Generado: {formatearFechaHora(examen.generadoEn)}</span>
                          <span>Estado: {String(examen.estado ?? 'generado')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}

function detectarModoMovil() {
  if (typeof window === 'undefined') return false;
  const ua = String(navigator?.userAgent ?? '');
  const esUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth <= 900;
  return esUa || (coarse && narrow);
}

function QrAccesoMovil({ vista }: { vista: 'entrega' | 'calificaciones' }) {
  const [urlMovil, setUrlMovil] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [qrFallo, setQrFallo] = useState(false);
  const [esMovil, setEsMovil] = useState(() => detectarModoMovil());
  const usarHttps = /^(1|true|si|yes)$/i.test(String(import.meta.env.VITE_HTTPS || '').trim());
  const [hostManual, setHostManual] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('qrHostDocente') ?? '';
  });

  function normalizarHostManual(valor: string) {
    return valor.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refrescar = () => setEsMovil(detectarModoMovil());
    window.addEventListener('resize', refrescar);
    window.addEventListener('orientationchange', refrescar);
    return () => {
      window.removeEventListener('resize', refrescar);
      window.removeEventListener('orientationchange', refrescar);
    };
  }, []);

  useEffect(() => {
    if (esMovil) return;
    let activo = true;
    queueMicrotask(() => {
      if (!activo) return;
      setQrFallo(false);
      setError('');
      setCargando(true);
    });
    const params = new URLSearchParams(window.location.search);
    params.set('vista', vista);
    const qs = params.toString();
    const ruta = window.location.pathname || '/';
    const puerto = window.location.port ? `:${window.location.port}` : '';
    const protocolo = usarHttps ? 'https:' : window.location.protocol;
    const construirUrl = (host: string) => `${protocolo}//${host}${puerto}${ruta}${qs ? `?${qs}` : ''}`;
    const construirUrlDesdeHost = (host: string) => {
      const limpio = normalizarHostManual(host);
      if (!limpio) return '';
      const tienePuerto = limpio.includes(':');
      const hostFinal = tienePuerto ? limpio : `${limpio}${puerto}`;
      return `${protocolo}//${hostFinal}${ruta}${qs ? `?${qs}` : ''}`;
    };
    const hostManualLimpio = normalizarHostManual(hostManual);
    const hostname = window.location.hostname;

    if (hostManualLimpio) {
      const url = construirUrlDesdeHost(hostManualLimpio);
      const timer = window.setTimeout(() => {
        if (!activo) return;
        setUrlMovil(url);
        setCargando(false);
      }, 0);
      return () => {
        activo = false;
        window.clearTimeout(timer);
      };
    }

    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const url = `${protocolo}//${window.location.host}${ruta}${qs ? `?${qs}` : ''}`;
    const timer = window.setTimeout(() => {
      if (!activo) return;
      setUrlMovil(url);
        setCargando(false);
      }, 0);
      return () => {
        activo = false;
        window.clearTimeout(timer);
      };
    }

    fetch(`${clienteApi.baseApi}/salud/ip-local`)
      .then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error('Respuesta invalida'))))
      .then((data) => {
        if (!activo) return;
        const ips: string[] = Array.isArray(data?.ips)
          ? (data.ips as unknown[]).map((ip) => String(ip || '').trim()).filter(Boolean)
          : [];
        const esPreferida = (ip: string) => ip.startsWith('192.168.') || ip.startsWith('10.');
        const esDocker = (ip: string) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
        const ipPreferida = ips.find(esPreferida);
        const ip = String(ipPreferida || ips.find((val) => !esDocker(val)) || data?.preferida || ips[0] || '').trim();
        if (!ip) throw new Error('Sin IP local');
        if (esDocker(ip) && !ipPreferida) {
          setError('Detecte una IP de Docker. Escribe la IP de tu PC para generar el QR.');
          setUrlMovil('');
          return;
        }
        setUrlMovil(construirUrl(ip));
      })
      .catch(() => {
        if (!activo) return;
        setError('No se pudo detectar la IP local. Usa la IP de tu PC en lugar de localhost.');
        setUrlMovil(`${protocolo}//${window.location.host}${ruta}${qs ? `?${qs}` : ''}`);
      })
      .finally(() => {
        if (!activo) return;
        setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [vista, hostManual, esMovil, usarHttps]);

  if (esMovil) return null;

  const urlQr = urlMovil ? `${clienteApi.baseApi}/salud/qr?texto=${encodeURIComponent(urlMovil)}` : '';
  const mostrarFallback = Boolean((error || qrFallo) && urlMovil);
  const mostrarInput = Boolean(error || qrFallo || hostManual);

  return (
    <div className="item-glass guia-card guia-card--qr">
      <div className="guia-card__header">
        <span className="chip chip-static" aria-hidden="true">
          <Icono nombre="escaneo" /> QR movil
        </span>
      </div>
      {cargando && (
        <InlineMensaje tipo="info" leading={<Spinner />}>
          Generando QR de acceso...
        </InlineMensaje>
      )}
      {!cargando && urlQr && (
        <div className="guia-qr">
          <img className="guia-qr__img" src={urlQr} alt="QR para abrir en movil" onError={() => setQrFallo(true)} />
          {mostrarFallback && (
            <div className="nota">
              Fallback manual: <span className="guia-qr__url">{urlMovil}</span>
            </div>
          )}
        </div>
      )}
      {(error || qrFallo) && (
        <>
          <InlineMensaje tipo="warning">
            {error || 'No se pudo generar el QR. Usa el enlace manual para abrir en el movil.'}
          </InlineMensaje>
        </>
      )}
      {mostrarInput && (
        <>
          <label className="campo">
            IP o host del PC para QR
            <input
              type="text"
              value={hostManual}
              onChange={(event) => {
                const valor = event.target.value;
                setHostManual(valor);
                if (typeof window !== 'undefined') {
                  const limpio = normalizarHostManual(valor);
                  if (limpio) localStorage.setItem('qrHostDocente', limpio);
                  else localStorage.removeItem('qrHostDocente');
                }
              }}
              placeholder="192.168.1.50 o mi-pc.local"
            />
          </label>
        </>
      )}
    </div>
  );
}

function SeccionEscaneo({
  alumnos,
  onAnalizar,
  onPrevisualizar,
  resultado,
  respuestas,
  onActualizar,
  puedeAnalizar,
  puedeCalificar,
  avisarSinPermiso
}: {
  alumnos: Alumno[];
  onAnalizar: (folio: string, numeroPagina: number, imagenBase64: string) => Promise<ResultadoAnalisisOmr>;
  onPrevisualizar: (payload: {
    examenGeneradoId: string;
    alumnoId?: string | null;
    respuestasDetectadas?: Array<{ numeroPregunta: number; opcion: string | null; confianza?: number }>;
  }) => Promise<{ preview: PreviewCalificacion }>;
  resultado: ResultadoOmr | null;
  respuestas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>;
  onActualizar: (respuestas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>) => void;
  puedeAnalizar: boolean;
  puedeCalificar: boolean;
  avisarSinPermiso: (mensaje: string) => void;
}) {
  const [folio, setFolio] = useState('');
  const [numeroPagina, setNumeroPagina] = useState(1);
  const [imagenBase64, setImagenBase64] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [analizando, setAnalizando] = useState(false);
  const [bloqueoManual, setBloqueoManual] = useState(false);
  const [procesandoLote, setProcesandoLote] = useState(false);
  const [lote, setLote] = useState<
    Array<{
      id: string;
      nombre: string;
      imagenBase64: string;
      estado: 'pendiente' | 'analizando' | 'precalificando' | 'listo' | 'error';
      mensaje?: string;
      folio?: string;
      numeroPagina?: number;
      alumnoId?: string | null;
      preview?: PreviewCalificacion | null;
    }>
  >([]);

  const puedeAnalizarImagen = Boolean(imagenBase64);
  const bloqueoAnalisis = !puedeAnalizar;
  const paginaManual = Number.isFinite(numeroPagina) ? Math.max(0, Math.floor(numeroPagina)) : 0;
  const mapaAlumnos = useMemo(() => new Map(alumnos.map((item) => [item._id, item.nombreCompleto])), [alumnos]);

  async function leerArchivoBase64(archivo: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result || ''));
      lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
      lector.readAsDataURL(archivo);
    });
  }

  async function cargarArchivo(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    if (!archivo) return;
    setImagenBase64(await leerArchivoBase64(archivo));
  }

  async function cargarLote(event: ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (archivos.length === 0) return;
    const nuevos: typeof lote = [];
    for (const archivo of archivos) {
      const base64 = await leerArchivoBase64(archivo);
      nuevos.push({
        id: `${archivo.name}-${archivo.size}-${archivo.lastModified}-${Math.random().toString(16).slice(2)}`,
        nombre: archivo.name,
        imagenBase64: base64,
        estado: 'pendiente',
        preview: null
      });
    }
    setLote((prev) => [...nuevos, ...prev]);
  }

  async function analizar() {
    try {
      const inicio = Date.now();
      if (!puedeAnalizar) {
        avisarSinPermiso('No tienes permiso para analizar OMR.');
        return;
      }
      setAnalizando(true);
      setMensaje('');
      const respuesta = await onAnalizar(folio.trim(), paginaManual > 0 ? paginaManual : 0, imagenBase64);
      if (respuesta.resultado.qrTexto) {
        setBloqueoManual(true);
        setFolio(respuesta.folio);
        setNumeroPagina(respuesta.numeroPagina);
      }
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

  async function analizarLote() {
    if (procesandoLote || lote.length === 0) return;
    if (!puedeAnalizar) {
      avisarSinPermiso('No tienes permiso para analizar OMR.');
      return;
    }
    if (!puedeCalificar) {
      avisarSinPermiso('No tienes permiso para previsualizar calificaciones.');
      return;
    }
    setProcesandoLote(true);
    for (const item of lote) {
      if (item.estado === 'listo') continue;
      setLote((prev) => prev.map((i) => (i.id === item.id ? { ...i, estado: 'analizando', mensaje: '' } : i)));
      try {
        const respuesta = await onAnalizar(folio.trim(), paginaManual, item.imagenBase64);
        setLote((prev) => prev.map((i) => (i.id === item.id ? { ...i, estado: 'precalificando' } : i)));
        const preview = await onPrevisualizar({
          examenGeneradoId: respuesta.examenId,
          alumnoId: respuesta.alumnoId ?? undefined,
          respuestasDetectadas: respuesta.resultado.respuestasDetectadas
        });
        setLote((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  estado: 'listo',
                  folio: respuesta.folio,
                  numeroPagina: respuesta.numeroPagina,
                  alumnoId: respuesta.alumnoId ?? null,
                  preview: preview.preview
                }
              : i
          )
        );
      } catch (error) {
        const msg = mensajeDeError(error, 'No se pudo analizar');
        setLote((prev) => prev.map((i) => (i.id === item.id ? { ...i, estado: 'error', mensaje: msg } : i)));
      }
    }
    setProcesandoLote(false);
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
            <b>Folio:</b> opcional si el QR esta legible (se detecta automaticamente).
          </li>
          <li>
            <b>Pagina:</b> opcional si el QR incluye el numero de pagina.
          </li>
          <li>
            <b>Imagen:</b> foto/escaneo nitido, sin recortes y con buena luz. En movil, usa la camara directa.
          </li>
        </ul>
        <p>
          Ejemplo: folio <code>FOLIO-000123</code>, pagina <code>1</code>, imagen <code>hoja1.jpg</code> (o deja folio/pagina vacios si el QR es legible).
        </p>
        <p>
          Tips: evita sombras; mantén la hoja recta; incluye el QR completo.
        </p>
      </AyudaFormulario>
      <div className="subpanel guia-visual">
        <h3>
          <Icono nombre="escaneo" /> Guia rapida de escaneo
        </h3>
        <div className="guia-flujo" aria-hidden="true">
          <Icono nombre="pdf" />
          <Icono nombre="chevron" className="icono icono--muted" />
          <Icono nombre="escaneo" />
          <Icono nombre="chevron" className="icono icono--muted" />
          <Icono nombre="calificar" />
          <span>Hoja a imagen a analisis a ajuste</span>
        </div>
        <div className="guia-grid">
          <QrAccesoMovil vista="calificaciones" />
          <div className="item-glass guia-card">
            <div className="guia-card__header">
              <span className="chip chip-static" aria-hidden="true">
                <Icono nombre="escaneo" /> Con movil
              </span>
            </div>
            <ul className="guia-pasos">
              <li className="guia-paso">
                <span className="paso-num">1</span>
                <div>
                  <div className="paso-titulo">Conecta el movil</div>
                  <p className="nota">Misma red WiFi: abre http://IP-DE-TU-PC:PUERTO (reemplaza localhost).</p>
                </div>
              </li>
              <li className="guia-paso">
                <span className="paso-num">2</span>
                <div>
                  <div className="paso-titulo">Abre la camara</div>
                  <p className="nota">En Imagen elige Tomar foto y captura la hoja.</p>
                </div>
              </li>
              <li className="guia-paso">
                <span className="paso-num">3</span>
                <div>
                  <div className="paso-titulo">Analiza y ajusta</div>
                  <p className="nota">Revisa las respuestas y corrige si es necesario.</p>
                </div>
              </li>
            </ul>
          </div>
          <div className="item-glass guia-card">
            <div className="guia-card__header">
              <span className="chip chip-static" aria-hidden="true">
                <Icono nombre="pdf" /> Manual
              </span>
            </div>
            <ul className="guia-pasos">
              <li className="guia-paso">
                <span className="paso-num">1</span>
                <div>
                  <div className="paso-titulo">Escanea en PC</div>
                  <p className="nota">Usa un escaner o camara web con buena nitidez.</p>
                </div>
              </li>
              <li className="guia-paso">
                <span className="paso-num">2</span>
                <div>
                  <div className="paso-titulo">Sube la imagen</div>
                  <p className="nota">Selecciona la pagina correcta (P1, P2...).</p>
                </div>
              </li>
              <li className="guia-paso">
                <span className="paso-num">3</span>
                <div>
                  <div className="paso-titulo">Valida QR y respuestas</div>
                  <p className="nota">Confirma folio y ajusta respuestas con baja confianza.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <label className="campo">
        Folio
        <input
          value={folio}
          onChange={(event) => setFolio(event.target.value)}
          placeholder="Si se deja vacio, se lee del QR"
          disabled={bloqueoManual || bloqueoAnalisis}
        />
      </label>
      <label className="campo">
        Pagina
        <input
          type="number"
          min={0}
          value={numeroPagina}
          onChange={(event) => setNumeroPagina(Number(event.target.value))}
          placeholder="0 = detectar por QR"
          disabled={bloqueoManual || bloqueoAnalisis}
        />
      </label>
      {bloqueoManual && (
        <InlineMensaje tipo="info">
          QR detectado: se bloqueo el folio/pagina para evitar errores manuales.
          <button type="button" className="link" onClick={() => setBloqueoManual(false)}>
            Editar manualmente
          </button>
        </InlineMensaje>
      )}
      <label className="campo">
        Imagen
        <input type="file" accept="image/*" capture="environment" onChange={cargarArchivo} disabled={bloqueoAnalisis} />
      </label>
      <Boton
        type="button"
        icono={<Icono nombre="escaneo" />}
        cargando={analizando}
        disabled={!puedeAnalizar || !puedeAnalizarImagen}
        onClick={analizar}
      >
        {analizando ? 'Analizando…' : 'Analizar'}
      </Boton>
      <div className="separador" />
      <label className="campo">
        Lote de imagenes (bulk)
        <input type="file" accept="image/*" multiple onChange={cargarLote} disabled={bloqueoAnalisis} />
      </label>
      <Boton
        type="button"
        icono={<Icono nombre="escaneo" />}
        cargando={procesandoLote}
        disabled={lote.length === 0 || bloqueoAnalisis || !puedeCalificar}
        onClick={analizarLote}
      >
        {procesandoLote ? 'Analizando lote…' : `Analizar lote (${lote.length})`}
      </Boton>
      {lote.length > 0 && (
        <div className="resultado">
          <h3>Procesamiento en lote</h3>
          <progress
            value={lote.filter((i) => i.estado === 'listo' || i.estado === 'error').length}
            max={lote.length}
          />
          <ul className="lista lista-items">
            {lote.map((item) => (
              <li key={item.id}>
                <div className="item-glass">
                  <div className="item-row">
                    <div>
                      <div className="item-title">{item.nombre}</div>
                      <div className="item-sub">
                        {item.estado === 'pendiente' && 'En cola'}
                        {item.estado === 'analizando' && 'Analizando…'}
                        {item.estado === 'precalificando' && 'Precalificando…'}
                        {item.estado === 'listo' && 'Listo'}
                        {item.estado === 'error' && `Error: ${item.mensaje ?? ''}`}
                      </div>
                      {item.folio && (
                        <div className="item-sub">
                          Folio {item.folio} · P{item.numeroPagina ?? '-'} · {item.alumnoId ? (mapaAlumnos.get(item.alumnoId) ?? item.alumnoId) : 'Alumno sin vincular'}
                        </div>
                      )}
                      {item.preview && (
                        <div className="item-sub">
                          Aciertos {item.preview.aciertos}/{item.preview.totalReactivos} · {item.preview.calificacionExamenFinalTexto ?? '-'}
                        </div>
                      )}
                    </div>
                    <div className="item-actions">
                      <img
                        src={item.imagenBase64}
                        alt={`preview ${item.nombre}`}
                        style={{ width: 120, height: 'auto', borderRadius: 8, border: '1px solid #dde3ea' }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
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

function SeccionCalificaciones({
  alumnos,
  onAnalizar,
  onPrevisualizar,
  resultado,
  respuestas,
  onActualizar,
  examenId,
  alumnoId,
  onCalificar,
  permisos,
  avisarSinPermiso
}: {
  alumnos: Alumno[];
  onAnalizar: (folio: string, numeroPagina: number, imagenBase64: string) => Promise<ResultadoAnalisisOmr>;
  onPrevisualizar: (payload: {
    examenGeneradoId: string;
    alumnoId?: string | null;
    respuestasDetectadas?: Array<{ numeroPregunta: number; opcion: string | null; confianza?: number }>;
  }) => Promise<{ preview: PreviewCalificacion }>;
  resultado: ResultadoOmr | null;
  respuestas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>;
  onActualizar: (respuestas: Array<{ numeroPregunta: number; opcion: string | null; confianza: number }>) => void;
  examenId: string | null;
  alumnoId: string | null;
  onCalificar: (payload: {
    examenGeneradoId: string;
    alumnoId?: string | null;
    aciertos?: number;
    totalReactivos?: number;
    bonoSolicitado?: number;
    evaluacionContinua?: number;
    proyecto?: number;
    retroalimentacion?: string;
    respuestasDetectadas?: Array<{ numeroPregunta: number; opcion: string | null; confianza?: number }>;
  }) => Promise<unknown>;
  permisos: PermisosUI;
  avisarSinPermiso: (mensaje: string) => void;
}) {
  const puedeAnalizar = permisos.omr.analizar;
  const puedeCalificar = permisos.calificaciones.calificar;
  return (
    <>
      <div className="panel">
        <h2>
          <Icono nombre="calificar" /> Calificaciones
        </h2>
        <p className="nota">
          Escanea el examen para detectar respuestas automaticamente y despues guarda la calificacion.
        </p>
      </div>
      <SeccionEscaneo
        alumnos={alumnos}
        onAnalizar={onAnalizar}
        onPrevisualizar={onPrevisualizar}
        resultado={resultado}
        respuestas={respuestas}
        onActualizar={onActualizar}
        puedeAnalizar={puedeAnalizar}
        puedeCalificar={puedeCalificar}
        avisarSinPermiso={avisarSinPermiso}
      />
      <SeccionCalificar
        examenId={examenId}
        alumnoId={alumnoId}
        respuestasDetectadas={respuestas}
        onCalificar={onCalificar}
        puedeCalificar={puedeCalificar}
        avisarSinPermiso={avisarSinPermiso}
      />
    </>
  );
}

function SeccionCalificar({
  examenId,
  alumnoId,
  respuestasDetectadas,
  onCalificar,
  puedeCalificar,
  avisarSinPermiso
}: {
  examenId: string | null;
  alumnoId: string | null;
  respuestasDetectadas: Array<{ numeroPregunta: number; opcion: string | null }>;
  onCalificar: (payload: {
    examenGeneradoId: string;
    alumnoId?: string | null;
    aciertos?: number;
    totalReactivos?: number;
    bonoSolicitado?: number;
    evaluacionContinua?: number;
    proyecto?: number;
    retroalimentacion?: string;
    respuestasDetectadas?: Array<{ numeroPregunta: number; opcion: string | null; confianza?: number }>;
  }) => Promise<unknown>;
  puedeCalificar: boolean;
  avisarSinPermiso: (mensaje: string) => void;
}) {
  const [bono, setBono] = useState(0);
  const [evaluacionContinua, setEvaluacionContinua] = useState(0);
  const [proyecto, setProyecto] = useState(0);
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const puedeCalificarLocal = Boolean(examenId && alumnoId);
  const bloqueoCalificar = !puedeCalificar;

  async function calificar() {
    if (!examenId || !alumnoId) {
      setMensaje('Falta examen o alumno');
      return;
    }
    try {
      const inicio = Date.now();
      if (!puedeCalificar) {
        avisarSinPermiso('No tienes permiso para calificar.');
        return;
      }
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
    <div className="shell">
      <div className="panel shell-main">
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
            disabled={bloqueoCalificar}
          />
        </label>
        <label className="campo">
          Evaluacion continua (parcial)
          <input
            type="number"
            value={evaluacionContinua}
            onChange={(event) => setEvaluacionContinua(Math.max(0, Number(event.target.value)))}
            disabled={bloqueoCalificar}
          />
        </label>
        <label className="campo">
          Proyecto (global)
          <input
            type="number"
            value={proyecto}
            onChange={(event) => setProyecto(Math.max(0, Number(event.target.value)))}
            disabled={bloqueoCalificar}
          />
        </label>
        <Boton
          type="button"
          icono={<Icono nombre="calificar" />}
          cargando={guardando}
          disabled={!puedeCalificarLocal || bloqueoCalificar}
          onClick={calificar}
        >
          {guardando ? 'Guardando…' : 'Calificar'}
        </Boton>
        {mensaje && (
          <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
            {mensaje}
          </p>
        )}
      </div>

      <aside className="shell-aside" aria-label="Ayuda y contexto">
        <div className="shell-asideCard">
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
        </div>
      </aside>
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
    <div className="shell">
      <div className="panel shell-main">
        <h2>
          <Icono nombre="publicar" /> Publicar en portal
        </h2>
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

      <aside className="shell-aside" aria-label="Ayuda y referencia">
        <div className="shell-asideCard">
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
        </div>
      </aside>
    </div>
  );
}

function SeccionPaqueteSincronizacion({
  periodos,
  docenteCorreo,
  onExportar,
  onImportar
}: {
  periodos: Periodo[];
  docenteCorreo?: string;
  onExportar: (payload: { periodoId?: string; desde?: string; incluirPdfs?: boolean }) => Promise<{
    paqueteBase64: string;
    checksumSha256: string;
    checksumGzipSha256?: string;
    exportadoEn: string;
    conteos: Record<string, number>;
  }>;
  onImportar: (payload: { paqueteBase64: string; checksumSha256?: string; dryRun?: boolean; docenteCorreo?: string }) => Promise<
    | { mensaje?: string; resultados?: unknown[]; pdfsGuardados?: number }
    | { mensaje?: string; checksumSha256?: string; conteos?: Record<string, number> }
  >;
}) {
  const [periodoId, setPeriodoId] = useState('');
  const [desde, setDesde] = useState('');
  const [incluirPdfs, setIncluirPdfs] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [ultimoResumen, setUltimoResumen] = useState<Record<string, number> | null>(null);
  const [ultimoExportEn, setUltimoExportEn] = useState<string | null>(null);
  const [ultimoArchivoExportado, setUltimoArchivoExportado] = useState<string | null>(null);
  const [ultimoArchivoImportado, setUltimoArchivoImportado] = useState<string | null>(null);
  const [ultimoChecksum, setUltimoChecksum] = useState<string | null>(null);

  function descargarJson(nombreArchivo: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportar() {
    try {
      const inicio = Date.now();
      setExportando(true);
      setMensaje('');
      setUltimoResumen(null);

      const payload: { periodoId?: string; desde?: string; incluirPdfs?: boolean } = {
        incluirPdfs
      };
      if (periodoId) payload.periodoId = periodoId;
      if (desde) payload.desde = new Date(desde).toISOString();

      const resp = await onExportar(payload);
      setUltimoResumen(resp.conteos);
      setUltimoExportEn(resp.exportadoEn);
      setUltimoChecksum(resp.checksumSha256 || null);

      const nombre = `sincronizacion_${(resp.exportadoEn || new Date().toISOString()).replace(/[:.]/g, '-')}.ep-sync.json`;
      descargarJson(nombre, {
        version: 1,
        exportadoEn: resp.exportadoEn,
        checksumSha256: resp.checksumSha256,
        conteos: resp.conteos,
        paqueteBase64: resp.paqueteBase64,
        ...(docenteCorreo ? { docenteCorreo } : {})
      });
      setUltimoArchivoExportado(nombre);

      setMensaje('Paquete exportado (descarga iniciada)');
      emitToast({ level: 'ok', title: 'Sincronizacion', message: 'Paquete exportado', durationMs: 2400 });
      registrarAccionDocente('sync_paquete_exportar', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo exportar el paquete');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo exportar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('sync_paquete_exportar', false);
    } finally {
      setExportando(false);
    }
  }

  async function importar(event: React.ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo) return;

    try {
      const inicio = Date.now();
      setImportando(true);
      setMensaje('');
      setUltimoArchivoImportado(archivo.name);

      const texto = await archivo.text();
      const json = JSON.parse(texto) as {
        paqueteBase64?: string;
        checksumSha256?: string;
        conteos?: Record<string, number>;
        docenteCorreo?: string;
      };
      const paqueteBase64 = String(json?.paqueteBase64 || '').trim();
      const checksumSha256 = String(json?.checksumSha256 || '').trim();
      const correoArchivo = typeof json?.docenteCorreo === 'string' ? json.docenteCorreo.trim() : '';
      const correoFinal = correoArchivo || docenteCorreo || '';
      if (!paqueteBase64) {
        throw new Error('Archivo invalido: no contiene paqueteBase64');
      }

      // 1) Validar en servidor (dry-run) para detectar corrupcion antes de escribir.
      const validacion = await onImportar({
        paqueteBase64,
        checksumSha256: checksumSha256 || undefined,
        dryRun: true,
        ...(correoFinal ? { docenteCorreo: correoFinal } : {})
      });
      const conteos = (validacion as { conteos?: Record<string, number> })?.conteos;
      const resumen = conteos
        ? `\n\nContenido: ${Object.entries(conteos)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}`
        : '';

      const ok = window.confirm(
        `Paquete valido.${resumen}\n\n¿Deseas importar y aplicar los cambios en esta computadora?\n\nRecomendacion: haz un export antes de importar.`
      );
      if (!ok) {
        setMensaje('Importacion cancelada');
        registrarAccionDocente('sync_paquete_importar_cancelado', true, Date.now() - inicio);
        return;
      }

      // 2) Importar realmente.
      const resp = await onImportar({
        paqueteBase64,
        checksumSha256: checksumSha256 || undefined,
        ...(correoFinal ? { docenteCorreo: correoFinal } : {})
      });
      setMensaje((resp as { mensaje?: string })?.mensaje || 'Paquete importado');
      emitToast({ level: 'ok', title: 'Sincronizacion', message: 'Paquete importado', durationMs: 2600 });
      registrarAccionDocente('sync_paquete_importar', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo importar el paquete');
      setMensaje(msg);
      emitToast({
        level: 'error',
        title: 'No se pudo importar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('sync_paquete_importar', false);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Icono nombre="recargar" /> Backups y exportaciones
      </h2>
      <AyudaFormulario titulo="Como funciona">
        <p>
          <b>Objetivo:</b> crear respaldos locales y mover tus materias/alumnos/banco/plantillas/examenes entre instalaciones (por archivo).
        </p>
        <ul className="lista">
          <li>
            <b>Exportar:</b> genera un archivo <code>.ep-sync.json</code> (compatible con <code>.seu-sync.json</code>).
          </li>
          <li>
            <b>Guardar backup:</b> mueve el archivo exportado a una carpeta de respaldo (sugerido: <code>backups/</code> del proyecto).
          </li>
          <li>
            <b>Importar:</b> selecciona ese archivo en la otra computadora (misma cuenta docente).
          </li>
          <li>
            <b>Integridad:</b> el sistema valida checksum antes de aplicar (si no coincide, se bloquea).
          </li>
          <li>
            <b>Conflictos:</b> se conserva el registro mas nuevo (por fecha de actualizacion).
          </li>
        </ul>
        <p className="nota">
          Sugerencia: conserva al menos 2 backups recientes. Esta funcion es compatible con el flujo de recuperacion y la papeleria (dev).
        </p>
      </AyudaFormulario>

      {(ultimoExportEn || ultimoArchivoExportado || ultimoArchivoImportado) && (
        <div className="subpanel">
          <h3>Resumen de backup</h3>
          <div className="item-glass">
            <div className="item-row">
              <div>
                <div className="item-title">Ultima actividad</div>
                <div className="item-meta">
                  <span>Exportado: {ultimoExportEn ? new Date(ultimoExportEn).toLocaleString() : '-'}</span>
                  <span>Archivo exportado: {ultimoArchivoExportado || '-'}</span>
                  <span>Archivo importado: {ultimoArchivoImportado || '-'}</span>
                </div>
                <div className="item-sub">
                  {ultimoChecksum ? `Checksum: ${ultimoChecksum.slice(0, 12)}…` : 'Checksum: -'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <label className="campo">
        Materia (opcional)
        <select value={periodoId} onChange={(event) => setPeriodoId(event.target.value)}>
          <option value="">Todas</option>
          {periodos.map((periodo) => (
            <option key={periodo._id} value={periodo._id} title={periodo._id}>
              {etiquetaMateria(periodo)}
            </option>
          ))}
        </select>
      </label>

      <div className="grid">
        <label className="campo">
          Desde (opcional)
          <input
            type="datetime-local"
            value={desde}
            onChange={(event) => setDesde(event.target.value)}
            placeholder="YYYY-MM-DDThh:mm"
          />
        </label>
        <label className="campo campo--checkbox">
          <input type="checkbox" checked={incluirPdfs} onChange={(e) => setIncluirPdfs(e.target.checked)} />
          Incluir PDFs (puede ser pesado)
        </label>
      </div>

      <div className="acciones">
        <Boton type="button" icono={<Icono nombre="publicar" />} cargando={exportando} onClick={exportar}>
          {exportando ? 'Exportando…' : 'Exportar backup'}
        </Boton>
        <label className={importando ? 'boton boton--secundario boton--disabled' : 'boton boton--secundario'}>
          <Icono nombre="entrar" /> {importando ? 'Importando…' : 'Importar backup'}
          <input
            type="file"
            accept="application/json,.json,.ep-sync.json,.seu-sync.json"
            onChange={importar}
            disabled={importando}
            className="input-file-oculto"
          />
        </label>
      </div>

      {ultimoResumen && (
        <InlineMensaje tipo="info">
          Ultimo export{ultimoExportEn ? ` (${new Date(ultimoExportEn).toLocaleString()})` : ''}: {Object.entries(ultimoResumen)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ')}
        </InlineMensaje>
      )}

      {(ultimoArchivoExportado || ultimoArchivoImportado) && (
        <div className="nota">
          {ultimoArchivoExportado ? `Exportado: ${ultimoArchivoExportado}` : ''}
          {ultimoArchivoExportado && ultimoArchivoImportado ? ' · ' : ''}
          {ultimoArchivoImportado ? `Importado: ${ultimoArchivoImportado}` : ''}
        </div>
      )}

      {mensaje && (
        <p className={esMensajeError(mensaje) ? 'mensaje error' : 'mensaje ok'} role="status">
          {mensaje}
        </p>
      )}
    </div>
  );
}

function SeccionSincronizacionEquipos({
  onPushServidor,
  onPullServidor
}: {
  onPushServidor: (payload: { periodoId?: string; desde?: string; incluirPdfs?: boolean }) => Promise<RespuestaSyncPush>;
  onPullServidor: (payload: { desde?: string; limite?: number }) => Promise<RespuestaSyncPull>;
}) {
  const [incluyePdfs, setIncluyePdfs] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [tipoMensaje, setTipoMensaje] = useState<'info' | 'ok' | 'warning' | 'error'>('info');
  const [ultimoCursor, setUltimoCursor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [trayendo, setTrayendo] = useState(false);

  async function enviarCambios() {
    try {
      const inicio = Date.now();
      setEnviando(true);
      setMensaje('');
      const respuesta = await onPushServidor({ incluirPdfs: incluyePdfs });
      const msg = respuesta.mensaje || 'Paquete enviado';
      setMensaje(msg);
      setTipoMensaje(msg.toLowerCase().includes('sin cambios') ? 'info' : 'ok');
      setUltimoCursor(respuesta.cursor || respuesta.exportadoEn || null);
      emitToast({ level: 'ok', title: 'Sincronizacion', message: msg, durationMs: 2400 });
      registrarAccionDocente('sync_push_servidor', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudo enviar');
      setMensaje(msg);
      setTipoMensaje('error');
      emitToast({
        level: 'error',
        title: 'No se pudo enviar',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('sync_push_servidor', false);
    } finally {
      setEnviando(false);
    }
  }

  async function traerCambios() {
    try {
      const inicio = Date.now();
      setTrayendo(true);
      setMensaje('');
      const respuesta = await onPullServidor({});
      const msg = respuesta.mensaje || 'Paquetes aplicados';
      setMensaje(msg);
      setTipoMensaje(msg.toLowerCase().includes('sin cambios') ? 'info' : 'ok');
      if (respuesta.ultimoCursor) {
        setUltimoCursor(respuesta.ultimoCursor);
      }
      emitToast({ level: 'ok', title: 'Sincronizacion', message: msg, durationMs: 2400 });
      registrarAccionDocente('sync_pull_servidor', true, Date.now() - inicio);
    } catch (error) {
      const msg = mensajeDeError(error, 'No se pudieron traer cambios');
      setMensaje(msg);
      setTipoMensaje('error');
      emitToast({
        level: 'error',
        title: 'No se pudo traer cambios',
        message: msg,
        durationMs: 5200,
        action: accionToastSesionParaError(error, 'docente')
      });
      registrarAccionDocente('sync_pull_servidor', false);
    } finally {
      setTrayendo(false);
    }
  }

  return (
    <div className="shell">
      <div className="panel shell-main">
        <h2>
          <Icono nombre="recargar" /> Sincronizacion entre equipos
        </h2>
        <p className="nota">
          Usa un servidor intermedio para mantener una sola fuente de verdad por docente, sin requerir que los equipos esten en linea al mismo tiempo.
        </p>
        <InlineMensaje tipo="info">
          Esta funcion no reemplaza los backups locales: exporta un respaldo antes de cambios grandes.
        </InlineMensaje>
        <label className="campo campo--checkbox">
          <input type="checkbox" checked={incluyePdfs} onChange={(e) => setIncluyePdfs(e.target.checked)} />
          Incluir PDFs en el envio (mas pesado)
        </label>
        <div className="acciones">
          <Boton type="button" icono={<Icono nombre="publicar" />} cargando={enviando} onClick={enviarCambios}>
            {enviando ? 'Enviando.' : 'Enviar cambios'}
          </Boton>
          <Boton type="button" variante="secundario" icono={<Icono nombre="recargar" />} cargando={trayendo} onClick={traerCambios}>
            {trayendo ? 'Trayendo.' : 'Traer cambios'}
          </Boton>
        </div>
        {ultimoCursor && <div className="nota">Ultima marca recibida: {new Date(ultimoCursor).toLocaleString()}</div>}
        {mensaje && <InlineMensaje tipo={tipoMensaje}>{mensaje}</InlineMensaje>}
      </div>

      <aside className="shell-aside" aria-label="Ayuda de sincronizacion">
        <div className="shell-asideCard">
          <AyudaFormulario titulo="Para que sirve y como usarlo">
            <p>
              <b>Proposito:</b> sincronizar cambios entre equipos del mismo docente usando un servidor intermedio.
            </p>
            <ul className="lista">
              <li>
                <b>Enviar cambios:</b> sube tus cambios al servidor para que otros equipos los puedan traer despues.
              </li>
              <li>
                <b>Traer cambios:</b> aplica los cambios pendientes del servidor en esta computadora.
              </li>
              <li>
                <b>Cuenta:</b> usa el mismo docente en todos los equipos para conservar la fuente de verdad.
              </li>
            </ul>
          </AyudaFormulario>
        </div>
      </aside>
    </div>
  );
}

function SeccionSincronizacion({
  periodos,
  periodosArchivados,
  alumnos,
  plantillas,
  preguntas,
  ultimaActualizacionDatos,
  docenteCorreo,
  onPublicar,
  onCodigo,
  onExportarPaquete,
  onImportarPaquete,
  onPushServidor,
  onPullServidor
}: {
  periodos: Periodo[];
  periodosArchivados: Periodo[];
  alumnos: Alumno[];
  plantillas: Plantilla[];
  preguntas: Pregunta[];
  ultimaActualizacionDatos: number | null;
  docenteCorreo?: string;
  onPublicar: (periodoId: string) => Promise<unknown>;
  onCodigo: (periodoId: string) => Promise<{ codigo?: string; expiraEn?: string }>;
  onExportarPaquete: (payload: { periodoId?: string; desde?: string; incluirPdfs?: boolean }) => Promise<{
    paqueteBase64: string;
    checksumSha256: string;
    checksumGzipSha256?: string;
    exportadoEn: string;
    conteos: Record<string, number>;
  }>;
  onImportarPaquete: (payload: { paqueteBase64: string; checksumSha256?: string; dryRun?: boolean; docenteCorreo?: string }) => Promise<
    | { mensaje?: string; resultados?: unknown[]; pdfsGuardados?: number }
    | { mensaje?: string; checksumSha256?: string; conteos?: Record<string, number> }
  >;
  onPushServidor: (payload: { periodoId?: string; desde?: string; incluirPdfs?: boolean }) => Promise<RespuestaSyncPush>;
  onPullServidor: (payload: { desde?: string; limite?: number }) => Promise<RespuestaSyncPull>;
}) {
  const [sincronizaciones, setSincronizaciones] = useState<RegistroSincronizacion[]>([]);
  const [cargandoEstado, setCargandoEstado] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const montadoRef = useRef(true);

  const resumenDatos = useMemo(
    () => ({
      materiasActivas: periodos.length,
      materiasArchivadas: periodosArchivados.length,
      alumnos: alumnos.length,
      plantillas: plantillas.length,
      banco: preguntas.length
    }),
    [periodos.length, periodosArchivados.length, alumnos.length, plantillas.length, preguntas.length]
  );

  function formatearFecha(valor?: string) {
    if (!valor) return '-';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  }

  function normalizarEstado(estado?: string) {
    const lower = String(estado || '').toLowerCase();
    if (lower.includes('exitos')) return { clase: 'ok', texto: 'Exitosa' };
    if (lower.includes('fall')) return { clase: 'error', texto: 'Fallida' };
    if (lower.includes('pend')) return { clase: 'warn', texto: 'Pendiente' };
    return { clase: 'info', texto: 'Sin dato' };
  }

  const ordenarSincronizaciones = useCallback((lista: RegistroSincronizacion[]) => {
    return [...lista].sort((a, b) => {
      const fechaA = new Date(a.ejecutadoEn || a.createdAt || 0).getTime();
      const fechaB = new Date(b.ejecutadoEn || b.createdAt || 0).getTime();
      return fechaB - fechaA;
    });
  }, []);

  const sincronizacionReciente = sincronizaciones[0];
  const fechaActualizacion = ultimaActualizacionDatos ? new Date(ultimaActualizacionDatos).toLocaleString() : '-';

  const refrescarEstado = useCallback(() => {
    setCargandoEstado(true);
    setErrorEstado('');
    clienteApi
      .obtener<{ sincronizaciones?: RegistroSincronizacion[] }>('/sincronizaciones?limite=6')
      .then((payload) => {
        if (!montadoRef.current) return;
        const lista = Array.isArray(payload.sincronizaciones) ? payload.sincronizaciones : [];
        setSincronizaciones(ordenarSincronizaciones(lista));
      })
      .catch((error) => {
        if (!montadoRef.current) return;
        setSincronizaciones([]);
        setErrorEstado(mensajeDeError(error, 'No se pudo obtener el estado de sincronización'));
      })
      .finally(() => {
        if (!montadoRef.current) return;
        setCargandoEstado(false);
      });
  }, [ordenarSincronizaciones]);

  useEffect(() => {
    montadoRef.current = true;
    const timer = window.setTimeout(() => {
      if (!montadoRef.current) return;
      refrescarEstado();
    }, 0);
    return () => {
      montadoRef.current = false;
      window.clearTimeout(timer);
    };
  }, [refrescarEstado]);

  return (
    <div className="panel">
      <div className="panel">
        <h2>
          <Icono nombre="publicar" /> Sincronización, backups y estado de datos
        </h2>
        <p className="nota">
          Esta pantalla concentra la sincronización con el portal y el flujo de backups/exportaciones entre equipos.
        </p>
        <div className="estado-datos-grid">
          <div className="item-glass estado-datos-card">
            <div className="estado-datos-header">
              <div>
                <div className="estado-datos-titulo">Estado de datos locales</div>
                <div className="nota">Actualizado: {fechaActualizacion}</div>
              </div>
              <span className="estado-chip info">Local</span>
            </div>
            <div className="estado-datos-cifras">
              <div>
                <div className="estado-datos-numero">{resumenDatos.materiasActivas}</div>
                <div className="nota">Materias activas</div>
              </div>
              <div>
                <div className="estado-datos-numero">{resumenDatos.materiasArchivadas}</div>
                <div className="nota">Materias archivadas</div>
              </div>
              <div>
                <div className="estado-datos-numero">{resumenDatos.alumnos}</div>
                <div className="nota">Alumnos</div>
              </div>
              <div>
                <div className="estado-datos-numero">{resumenDatos.plantillas}</div>
                <div className="nota">Plantillas</div>
              </div>
              <div>
                <div className="estado-datos-numero">{resumenDatos.banco}</div>
                <div className="nota">Banco de preguntas</div>
              </div>
            </div>
          </div>
          <div className="item-glass estado-datos-card">
            <div className="estado-datos-header">
              <div>
                <div className="estado-datos-titulo">Ultima sincronización</div>
                <div className="nota">
                  {sincronizacionReciente ? formatearFecha(sincronizacionReciente.ejecutadoEn || sincronizacionReciente.createdAt) : 'Sin registros'}
                </div>
              </div>
              <span className={`estado-chip ${normalizarEstado(sincronizacionReciente?.estado).clase}`}>
                {normalizarEstado(sincronizacionReciente?.estado).texto}
              </span>
            </div>
            <div className="estado-datos-lista">
              {(sincronizaciones.length ? sincronizaciones : [{} as RegistroSincronizacion]).slice(0, 4).map((item, idx) => {
                if (!item || !item.estado) {
                  return (
                    <div key={`vacio-${idx}`} className="estado-datos-item">
                      <div className="nota">No hay historial disponible.</div>
                    </div>
                  );
                }
                const estado = normalizarEstado(item.estado);
                return (
                  <div key={item._id || `sync-${idx}`} className="estado-datos-item">
                    <span className={`estado-chip ${estado.clase}`}>{estado.texto}</span>
                    <div>
                      <div className="estado-datos-item__titulo">{String(item.tipo || 'publicacion').toUpperCase()}</div>
                      <div className="nota">{formatearFecha(item.ejecutadoEn || item.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {errorEstado && <InlineMensaje tipo="warning">{errorEstado}</InlineMensaje>}
            <div className="acciones">
              <Boton type="button" variante="secundario" icono={<Icono nombre="recargar" />} cargando={cargandoEstado} onClick={() => refrescarEstado()}>
                {cargandoEstado ? 'Actualizando.' : 'Actualizar estado'}
              </Boton>
            </div>
          </div>
        </div>
      </div>
      <div className="sincronizacion-grid">
        <SeccionPublicar periodos={periodos} onPublicar={onPublicar} onCodigo={onCodigo} />
        <SeccionPaqueteSincronizacion
          periodos={periodos}
          docenteCorreo={docenteCorreo}
          onExportar={onExportarPaquete}
          onImportar={onImportarPaquete}
        />
        <SeccionSincronizacionEquipos onPushServidor={onPushServidor} onPullServidor={onPullServidor} />
      </div>
    </div>
  );
}



















