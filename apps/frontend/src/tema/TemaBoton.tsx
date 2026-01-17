import { useMemo } from 'react';
import { siguientePreferenciaTema, type PreferenciaTema } from './tema';
import { useTema } from './TemaProvider';

function IconoTema({ modo }: { modo: PreferenciaTema }) {
  // SVG mínimo (sin depender del set de iconos del proyecto)
  if (modo === 'dark') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="icono">
        <path
          d="M21 14.5A7.5 7.5 0 0 1 9.5 3a6.5 6.5 0 1 0 11.5 11.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (modo === 'light') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="icono">
        <path
          d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // auto
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="icono">
      <path d="M12 4a8 8 0 1 0 0 16V4Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4a8 8 0 0 1 0 16" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
    </svg>
  );
}

export function TemaBoton({ className }: { className?: string }) {
  const { preferencia, setPreferencia, temaAplicado } = useTema();

  const texto = useMemo(() => {
    if (preferencia === 'auto') return `Tema: Auto (${temaAplicado === 'dark' ? 'Oscuro' : 'Claro'})`;
    return preferencia === 'dark' ? 'Tema: Oscuro' : 'Tema: Claro';
  }, [preferencia, temaAplicado]);

  return (
    <button
      type="button"
      className={[
        'boton',
        'secundario',
        'boton--tema',
        className || ''
      ]
        .filter(Boolean)
        .join(' ')}
      title="Cambiar tema (Auto / Claro / Oscuro)"
      aria-label={texto}
      onClick={() => setPreferencia(siguientePreferenciaTema(preferencia))}
    >
      <IconoTema modo={preferencia} />
      <span className="boton--temaTexto">{texto}</span>
    </button>
  );
}
