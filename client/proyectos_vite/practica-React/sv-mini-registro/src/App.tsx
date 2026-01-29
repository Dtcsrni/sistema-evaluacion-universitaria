import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Práctica: Sistemas Visuales (React + TypeScript)
 * Ejemplo didáctico: todos los conceptos clave de React en un solo archivo para facilitar el estudio y la experimentación.
 * Incluye manejo de formularios, validaciones, eventos, temporizador, renderizado condicional y manipulación del DOM.
 */
export default function App() {
  // =========================
  // 1) ESTADO LOCAL (useState)
  // =========================
  // Ejemplo de formulario controlado: el valor de cada input vive en el estado de React
  const [nombre, setNombre] = useState<string>('');
  const [matricula, setMatricula] = useState<string>('');

  // Radio buttons: selección única (solo un valor posible)
  const [turno, setTurno] = useState<'matutino' | 'vespertino'>('matutino');

  // Checkbox: acepta términos y condiciones
  const [aceptaTerminos, setAceptaTerminos] = useState<boolean>(false);
 
  // Carrera: lista desplegable (select)
  const [carrera, setCarrera] = useState<string>('ISC');

  // Menú simulado: controla qué sección/pantalla se muestra
  const [seccion, setSeccion] = useState<'registro' | 'ayuda'>('registro');

  // Temporizador y barra de progreso: simulan un proceso visual
  const [progreso, setProgreso] = useState<number>(0);
  const [corriendo, setCorriendo] = useState<boolean>(false);

  // Tamaño de la ventana: se actualiza dinámicamente al cambiar el tamaño del navegador
  const [windowSize, setWindowSize] = useState<{ w: number; h: number }>({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  // Referencia a un input: permite enfocar la caja de texto de nombre desde código (ejemplo de useRef)
  const nombreRef = useRef<HTMLInputElement | null>(null);

  // =========================
  // 2) EVENTOS DE VENTANA (window)
  // =========================
  useEffect(() => {
    // Evento global: resize. Actualiza el estado con el tamaño de la ventana cada vez que el usuario cambia el tamaño.
    const onResize = () => {
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    };

    // Evento global: beforeunload. Advierte al usuario si intenta salir de la página con datos escritos en el formulario.
    // Nota: los navegadores modernos limitan el texto personalizado en este diálogo.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const hayDatos = nombre.trim() !== '' || matricula.trim() !== '';
      if (!hayDatos) return;

      e.preventDefault();
      e.returnValue = ''; // requerido para que el navegador muestre diálogo
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('beforeunload', onBeforeUnload);

    // Cleanup: elimina los listeners al desmontar el componente o al cambiar dependencias (buena práctica para evitar fugas de memoria)
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [nombre, matricula]);

  // =========================
  // 3) TEMPORIZADOR (Timer) + BARRA DE PROGRESO
  // =========================
  useEffect(() => {
    if (!corriendo) return;

    // setInterval: simula un temporizador que incrementa el progreso cada 500 ms. Guardamos el id para poder detenerlo correctamente.
    const id = window.setInterval(() => {
      setProgreso((prev) => {
        const next = prev + 10;
        return next >= 100 ? 100 : next;
      });
    }, 500);

    // Cleanup: detiene el temporizador cuando el componente se desmonta o cuando cambia 'corriendo'.
    return () => window.clearInterval(id);
  }, [corriendo]);

  // Cuando el progreso llega a 100%, detenemos automáticamente el temporizador.
  useEffect(() => {
    if (progreso >= 100) setCorriendo(false);
  }, [progreso]);

  // =========================
  // 4) VALIDACIONES DERIVADAS (useMemo)
  // =========================
  // Calcula si el formulario es válido: nombre y matrícula con longitud mínima y términos aceptados.
  const formularioValido = useMemo(() => {
    return (
      nombre.trim().length >= 3 &&
      matricula.trim().length >= 6 &&
      aceptaTerminos
    );
  }, [nombre, matricula, aceptaTerminos]);

  // =========================
  // 5) ACCIONES Y MANEJADORES DE EVENTOS (botón, teclado, formulario)
  // =========================
  // Limpia todos los campos del formulario y reinicia el progreso. Además, enfoca el input de nombre para mejorar la experiencia de usuario.
  const limpiar = () => {
    setNombre('');
    setMatricula('');
    setTurno('matutino');
    setAceptaTerminos(false);
    setCarrera('ISC');
    setProgreso(0);
    setCorriendo(false);
    nombreRef.current?.focus();
  };

  // Valida el formulario y simula el registro del alumno. Si es válido, muestra confirmación y arranca la barra de progreso.
  const validarYRegistrar = (e?: React.FormEvent) => {
    e?.preventDefault(); // Evita recargar la página si viene de un submit
    if (!formularioValido) {
      alert('Formulario incompleto: revisa campos y acepta términos.');
      return;
    }
    const ok = confirm(
      `¿Registrar alumno?\n\nNombre: ${nombre}\nMatrícula: ${matricula}\nCarrera: ${carrera}\nTurno: ${turno}`
    );
    if (!ok) return;
    alert('Registro exitoso (simulado).');
    setProgreso(0);
    setCorriendo(true);
  };

  // =========================
  // 6) UI: MENÚ DE SECCIONES
  // =========================
  const Menu = (
    <nav style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      {/* Menú: botones que cambian "seccion" */}
      <button onClick={() => setSeccion('registro')}>
        Registro
      </button>
      <button onClick={() => setSeccion('ayuda')}>
        Ayuda
      </button>
      <span style={{ marginLeft: 'auto', opacity: 0.75 }}>
        Ventana: {windowSize.w}×{windowSize.h}
      </span>
    </nav>
  );

  // =========================
  // 7) UI: ENCABEZADO (Etiqueta e imagen)
  // =========================
  const Header = (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      {/* Imagen: usamos un SVG inline simple para no depender de archivos */}
      <svg width="42" height="42" viewBox="0 0 64 64" aria-label="Logo">
        <circle cx="32" cy="32" r="30" />
        <text x="32" y="38" textAnchor="middle" fontSize="18" fill="white">
          SV
        </text>
      </svg>

      {/* Etiqueta (Label) */}
      <div>
        <h1 style={{ margin: 0 }}>Módulo de Registro (Sistemas Visuales)</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Componentes básicos + eventos (React + TypeScript)
        </p>
      </div>
    </header>
  );

  // =========================
  // 8) SECCIONES PRINCIPALES (renderizado condicional)
  // =========================
  const SeccionAyuda = (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12 }}>
      <h2>Ayuda</h2>
      <ul>
        <li><b>Botones</b>: cambian estado y ejecutan acciones.</li>
        <li><b>Cajas de texto</b>: son controladas por estado.</li>
        <li><b>Radio</b>: elección única.</li>
        <li><b>Checkbox</b>: verdadero/falso.</li>
        <li><b>Select</b>: lista desplegable.</li>
        <li><b>Diálogo</b>: confirmación con <code>confirm()</code>.</li>
        <li><b>Temporizador</b>: <code>setInterval</code> simula avance.</li>
        <li><b>Ventana</b>: evento <code>resize</code> actualiza dimensiones.</li>
      </ul>
    </section>
  );

  const SeccionRegistro = (
    // Frame + Formulario:
    // - Frame: contenedor visual con borde y padding
    // - Form: formulario controlado con validación y submit
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12 }}>
      <h2>Registro</h2>

      <form onSubmit={validarYRegistrar}>
        {/* Caja de texto (TextBox) */}
        <div style={{ marginBottom: 10 }}>
          <label>
            Nombre (mínimo 3 chars):
            <br />
            <input
              ref={nombreRef}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Juan Pérez"
            />
          </label>
        </div>

        {/* Caja de texto (TextBox) */}
        <div style={{ marginBottom: 10 }}>
          <label>
            Matrícula (mínimo 6 chars):
            <br />
            <input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              placeholder="Ej. 202512"
              // Evento de teclado: Enter ya hace submit por defecto en el form,
              // pero aquí mostramos cómo capturar otras teclas (Escape para limpiar).
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  // Escape: limpia todos los campos rápidamente (ejemplo de evento de teclado personalizado)
                  limpiar();
                }
              }}
            />
          </label>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Tip: presiona <b>Escape</b> para limpiar.
          </div>
        </div>

        {/* Lista desplegable (ComboBox/Select): permite elegir la carrera */}
        <div style={{ marginBottom: 10 }}>
          <label>
            Carrera:
            <br />
            <select value={carrera} onChange={(e) => setCarrera(e.target.value)}>
              <option value="ISC">Ingeniería en Sistemas</option>
              <option value="ITI">Tecnologías de la Información</option>
              <option value="IG">Ingeniería Industrial</option>
            </select>
          </label>
        </div>

        {/* Radio button (selección única): permite elegir el turno */}
        <div style={{ marginBottom: 10 }}>
          <div>Turno:</div>
          <label style={{ marginRight: 10 }}>
            <input
              type="radio"
              name="turno"
              checked={turno === 'matutino'}
              onChange={() => setTurno('matutino')}
            />
            Matutino
          </label>
          <label>
            <input
              type="radio"
              name="turno"
              checked={turno === 'vespertino'}
              onChange={() => setTurno('vespertino')}
            />
            Vespertino
          </label>
        </div>

        {/* Checkbox: acepta términos y condiciones */}
        <div style={{ marginBottom: 10 }}>
          <label>
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
            />
            Acepto términos
          </label>
        </div>

        {/* Botones: submit para registrar y limpiar para reiniciar el formulario */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button type="submit" disabled={!formularioValido}>
            Registrar
          </button>

          <button type="button" onClick={limpiar}>
            Limpiar
          </button>
        </div>

        {/* Validación: muestra mensaje si el formulario está incompleto */}
        {!formularioValido && (
          <p style={{ color: 'crimson', marginTop: 0 }}>
            Completa: nombre (≥3), matrícula (≥6) y acepta términos.
          </p>
        )}
      </form>

      {/* Temporizador + barra de progreso: simula un proceso visual tras el registro */}
      <div style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 6 }}>
          Proceso (simulado): {progreso}%
        </div>

        {/* Barra de progreso visual con color dinámico según el avance */}
        <div
          style={{
            height: 14,
            borderRadius: 999,
            border: '1px solid #999',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progreso}%`,
              height: '100%',
              transition: 'width 0.3s',
              background:
                progreso < 40
                  ? '#f39c12' // naranja para <40%
                  : progreso < 80
                  ? '#3498db' // azul para 40-79%
                  : '#2ecc71', // verde para 80-100%
            }}
          />
        </div>

        {/* Controles de la barra de progreso: iniciar, pausar y reiniciar */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => {
              setProgreso(0);
              setCorriendo(true);
            }}
          >
            Iniciar
          </button>

          <button
            type="button"
            onClick={() => setCorriendo(false)}
            disabled={!corriendo}
          >
            Pausar
          </button>

          <button
            type="button"
            onClick={() => {
              setCorriendo(false);
              setProgreso(0);
            }}
          >
            Reiniciar
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <div style={{ padding: 16 }}>
      {Header}
      {Menu}

      {/* Render condicional de secciones: simula “ventanas” o “pantallas” en la UI */}
      {seccion === 'registro' ? SeccionRegistro : SeccionAyuda}
    </div>
  );
}
