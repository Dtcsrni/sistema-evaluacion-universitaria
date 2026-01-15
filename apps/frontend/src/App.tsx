/**
 * Selector de app docente o alumno segun variable de entorno.
 */
import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AppAlumno } from './apps/app_alumno/AppAlumno';
import { AppDocente } from './apps/app_docente/AppDocente';

function establecerFavicon(href: string) {
  if (typeof document === 'undefined') return;
  const head = document.head;
  if (!head) return;

  const existentes = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
  const link = existentes[0] || document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = href;
  if (!existentes[0]) head.appendChild(link);
}

function App() {
  const destino = import.meta.env.VITE_APP_DESTINO || 'docente';
  const googleClientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  useEffect(() => {
    const esAlumno = destino === 'alumno';
    document.title = esAlumno ? 'Portal Alumno - Sistema de Evaluacion' : 'Plataforma Docente - Sistema de Evaluacion';
    establecerFavicon(esAlumno ? '/favicon-alumno.svg' : '/favicon-docente.svg');
  }, [destino]);

  const contenido = destino === 'alumno' ? <AppAlumno /> : <AppDocente />;

  return <main className="page">{googleClientId && destino !== 'alumno' ? <GoogleOAuthProvider clientId={googleClientId}>{contenido}</GoogleOAuthProvider> : contenido}</main>;
}

export default App;
