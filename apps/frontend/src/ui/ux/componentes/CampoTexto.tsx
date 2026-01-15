import type { InputHTMLAttributes, ReactNode } from 'react';

export function CampoTexto({
  etiqueta,
  ayuda,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  error?: ReactNode;
  children?: never;
}) {
  const invalid = Boolean(error);

  return (
    <label className="campo">
      {etiqueta}
      {invalid ? <input {...props} aria-invalid="true" /> : <input {...props} />}
      {error ? <small className="ayuda error">{error}</small> : ayuda ? <small className="ayuda">{ayuda}</small> : null}
    </label>
  );
}
