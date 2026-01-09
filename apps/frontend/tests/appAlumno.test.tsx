import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppAlumno } from '../src/apps/app_alumno/AppAlumno';

describe('AppAlumno', () => {
  it('muestra formulario de acceso sin token', () => {
    render(<AppAlumno />);

    expect(screen.getByText('Codigo de acceso')).toBeInTheDocument();
    expect(screen.getByText('Matricula')).toBeInTheDocument();
  });

  it('muestra boton salir con token', () => {
    localStorage.setItem('tokenAlumno', 'token-falso');
    render(<AppAlumno />);

    expect(screen.getByText('Salir')).toBeInTheDocument();
  });
});
