import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppDocente } from '../src/apps/app_docente/AppDocente';

describe('AppDocente', () => {
  it('muestra formulario de acceso cuando no hay token', () => {
    render(<AppDocente />);

    expect(screen.getByText('Acceso docente')).toBeInTheDocument();
    expect(screen.getByText('Plataforma Docente')).toBeInTheDocument();
  });

  it('muestra panel docente cuando existe token', async () => {
    localStorage.setItem('tokenDocente', 'token-falso');
    render(<AppDocente />);

    expect(await screen.findByText('Panel Docente')).toBeInTheDocument();
  });
});
