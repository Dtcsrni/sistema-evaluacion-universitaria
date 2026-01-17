import type { ReactNode } from 'react';

type PropsIcono = {
  nombre:
    | 'inicio'
    | 'periodos'
    | 'alumnos'
    | 'banco'
    | 'plantillas'
    | 'recepcion'
    | 'escaneo'
    | 'calificar'
    | 'publicar'
    | 'alumno'
    | 'docente'
    | 'salir'
    | 'entrar'
    | 'recargar'
    | 'pdf'
    | 'nuevo'
    | 'chevron'
    | 'ok'
    | 'alerta'
    | 'info';
  size?: number;
  className?: string;
  title?: string;
  ariaHidden?: boolean;
};

function SvgBase({
  children,
  size = 18,
  className,
  title,
  ariaHidden = true,
  viewBox = '0 0 24 24',
  dataIcono
}: {
  children: ReactNode;
  size?: number;
  className?: string;
  title?: string;
  ariaHidden?: boolean;
  viewBox?: string;
  dataIcono?: string;
}) {
  const a11y = ariaHidden
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': title || 'icono' } as const);

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      data-icono={dataIcono}
      {...a11y}
    >
      {title && !ariaHidden ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function Icono(props: PropsIcono) {
  const { nombre, size, className = 'icono', title, ariaHidden } = props;
  const common = { size, className, title, ariaHidden, dataIcono: nombre };

  switch (nombre) {
    case 'inicio':
      return (
        <SvgBase {...common}>
          <path d="M4 11.5 12 4l8 7.5V21a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </SvgBase>
      );
    case 'periodos':
      return (
        <SvgBase {...common}>
          <path d="M7 3v3M17 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 8h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12h3M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'alumnos':
      return (
        <SvgBase {...common}>
          <path d="M16 11a4 4 0 1 0-8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 21c1.5-4 5-6 9-6s7.5 2 9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'banco':
      return (
        <SvgBase {...common}>
          <path d="M4 6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14H6a2 2 0 0 0-2 2V6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 20h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 8h8M8 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'plantillas':
      return (
        <SvgBase {...common}>
          <path d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
          <path d="M14 3v4h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 11h8M8 15h8M8 19h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'recepcion':
      return (
        <SvgBase {...common}>
          <path d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="2" />
          <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </SvgBase>
      );
    case 'escaneo':
      return (
        <SvgBase {...common}>
          <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'calificar':
      return (
        <SvgBase {...common}>
          <path d="M9 12l2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
        </SvgBase>
      );
    case 'publicar':
      return (
        <SvgBase {...common}>
          <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'alumno':
      return (
        <SvgBase {...common}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
          <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'docente':
      return (
        <SvgBase {...common}>
          <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 17V7a4 4 0 1 1 8 0v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'salir':
      return (
        <SvgBase {...common}>
          <path d="M10 17l-1 4h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H9l1 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 9l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </SvgBase>
      );
    case 'entrar':
      return (
        <SvgBase {...common}>
          <path d="M14 7l1-4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10l-1-4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 12h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 9l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </SvgBase>
      );
    case 'recargar':
      return (
        <SvgBase {...common}>
          <path d="M20 12a8 8 0 1 1-2.3-5.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </SvgBase>
      );
    case 'nuevo':
      return (
        <SvgBase {...common}>
          <path d="M12 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
        </SvgBase>
      );
    case 'pdf':
      return (
        <SvgBase {...common}>
          <path d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
          <path d="M14 3v4h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 13h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgBase>
      );
    case 'chevron':
      return (
        <SvgBase {...common}>
          <path d="M10 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </SvgBase>
      );
    case 'ok':
      return (
        <SvgBase {...common}>
          <path d="M9 12l2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </SvgBase>
      );
    case 'alerta':
      return (
        <SvgBase {...common}>
          <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 17h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M10.3 4.3a2 2 0 0 1 3.4 0l7.4 12.8A2 2 0 0 1 19.4 20H4.6a2 2 0 0 1-1.7-3L10.3 4.3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </SvgBase>
      );
    case 'info':
      return (
        <SvgBase {...common}>
          <path d="M12 17v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 8h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
        </SvgBase>
      );
    default:
      return null;
  }
}

export function Spinner({ size = 18, className = 'spinner' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      data-icono="spinner"
      aria-hidden="true"
    >
      <path
        d="M12 4a8 8 0 1 0 8 8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IlustracionSinResultados({ className = 'ilustracion' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="320" y2="160" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c7d2fe" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>
      <rect x="10" y="20" width="300" height="120" rx="18" fill="url(#g)" opacity="0.75" />
      <path d="M78 104c18-26 46-40 82-40 28 0 52 10 70 28" stroke="#1e40af" strokeWidth="8" strokeLinecap="round" opacity="0.65" />
      <path d="M110 108h100" stroke="#0f172a" strokeWidth="8" strokeLinecap="round" opacity="0.35" />
      <circle cx="74" cy="74" r="22" fill="#ffffff" opacity="0.7" />
      <circle cx="250" cy="92" r="18" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}
