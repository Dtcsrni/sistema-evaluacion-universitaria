// Pruebas basicas de la app docente.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    expect(await screen.findByRole('navigation', { name: 'Secciones del portal docente' })).toBeInTheDocument();
  });

  it('permite crear materia sin crashear el render', async () => {
    localStorage.setItem('tokenDocente', 'token-falso');
    const user = userEvent.setup();
    render(<AppDocente />);

    expect(await screen.findByRole('navigation', { name: 'Secciones del portal docente' })).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Secciones del portal docente' });
    const tabsMaterias = within(nav).getAllByRole('button', { name: 'Materias' });
    await user.click(tabsMaterias[0]);

    fireEvent.change(screen.getByLabelText('Nombre de la materia'), { target: { value: 'Algebra I' } });
    fireEvent.change(screen.getByLabelText('Fecha inicio'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Fecha fin'), { target: { value: '2026-01-30' } });

    await user.click(screen.getByRole('button', { name: 'Crear materia' }));

    expect(await screen.findByText('Materia creada')).toBeInTheDocument();
  });
});

