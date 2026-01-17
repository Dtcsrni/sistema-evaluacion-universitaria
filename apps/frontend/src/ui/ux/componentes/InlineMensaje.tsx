import type { ReactNode } from 'react';
import { Icono } from '../../iconos';

export type TipoMensaje = 'info' | 'ok' | 'error';

export function InlineMensaje({
  tipo = 'info',
  leading,
  mostrarIcono = true,
  children
}: {
  tipo?: TipoMensaje;
  leading?: ReactNode;
  mostrarIcono?: boolean;
  children: ReactNode;
}) {
  const clase = `mensaje${tipo === 'ok' ? ' ok' : tipo === 'error' ? ' error' : ''}`;
  const icono = tipo === 'error' ? 'alerta' : tipo === 'ok' ? 'ok' : 'info';

  if (tipo === 'error') {
    return (
      <p className={clase} role="alert">
        {leading ? leading : mostrarIcono ? <Icono nombre={icono} /> : null} {children}
      </p>
    );
  }

  return (
    <p className={clase} role="status">
      {leading ? leading : mostrarIcono ? <Icono nombre={icono} /> : null} {children}
    </p>
  );
}
