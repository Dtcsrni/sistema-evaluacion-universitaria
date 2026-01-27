import { useMemo, useState } from 'react';
import '../App.css';
import { getSession, login, logout } from './practica-05-react/src/app/auth';

// Componente principal de la aplicación
export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const session = getSession();

  const canSubmit = useMemo(() => {
    return email.trim() && password.trim() && password.length >= 6;
  }, [email, password]);

  function manejarEnvio(e: React.FormEvent) {
    e.preventDefault();
    // Simula login y guarda sesión
    login(email, password);
    window.location.reload();
  }

  if (!session) {
    return (
      <main className="page">
        <section className='card'>
          <h1>Iniciar Sesión</h1>
          <p className='subtitulo'>Por favor ingrese sus datos</p>
          <form className='form' onSubmit={manejarEnvio}>
            <label className='field'>
              <span className='label'>Correo</span>
              <input
                className='input'
                type='email'
                placeholder='docente@universidad.edu'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className='field'>
              <span className='label'>Contraseña</span>
              <input
                className='input'
                type='password'
                placeholder='Mínimo 6 caracteres'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className='button' type='submit' disabled={!canSubmit}>
              Iniciar Sesión
            </button>
            <p className='hint'>Regla: correo válido + contraseña 6 caracteres</p>
          </form>
        </section>
      </main>
    );
  }

  // Si hay sesión activa
  return (
    <main className="page">
      <section className='card'>
        <h1>Sesión Activa</h1>
        <p className='subtitulo'>Ventana de sesión</p>
        <p style={{ marginTop: '14px' }}>
          <strong>Usuario:</strong> {session.email} <br />
        </p>
        <p style={{ marginTop: '14px' }}>
          <strong>Creado en:</strong> {new Date(session.CreadoEn).toLocaleString()} <br />
        </p>
        <button
          className='button'
          type='button'
          style={{ marginTop: '14px', opacity: 0.75 }}
          onClick={() => {
            logout();
            window.location.reload();
          }}
        >
          Cerrar Sesión
        </button>
      </section>
    </main>
  );
}



