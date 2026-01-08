/**
 * Selector de app docente o alumno segun variable de entorno.
 */
import { AppAlumno } from './apps/app_alumno/AppAlumno';
import { AppDocente } from './apps/app_docente/AppDocente';

function App() {
  const destino = import.meta.env.VITE_APP_DESTINO || 'docente';

  return (
    <main className="page">
      {destino === 'alumno' ? <AppAlumno /> : <AppDocente />}
    </main>
  );
}

export default App;
