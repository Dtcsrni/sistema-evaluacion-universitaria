export type PreferenciaTema = 'auto' | 'light' | 'dark';
export type TemaAplicado = 'light' | 'dark';
export type BucketTiempo = 'dawn' | 'day' | 'dusk' | 'night';

export const CLAVE_TEMA_PREFERENCIA = 'seu.portal.tema';

export function normalizarPreferenciaTema(valor: unknown): PreferenciaTema {
  if (valor === 'light' || valor === 'dark' || valor === 'auto') return valor;
  return 'auto';
}

export function leerPreferenciaTema(): PreferenciaTema {
  if (typeof window === 'undefined') return 'auto';
  try {
    return normalizarPreferenciaTema(window.localStorage.getItem(CLAVE_TEMA_PREFERENCIA));
  } catch {
    return 'auto';
  }
}

export function guardarPreferenciaTema(preferencia: PreferenciaTema) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_TEMA_PREFERENCIA, preferencia);
  } catch {
    // noop
  }
}

export function calcularBucketTiempo(ahora = new Date()): BucketTiempo {
  const h = ahora.getHours();
  // Ajustes simples: noche 21-5, amanecer 6-8, dia 9-16, atardecer 17-20
  if (h >= 21 || h <= 5) return 'night';
  if (h <= 8) return 'dawn';
  if (h <= 16) return 'day';
  return 'dusk';
}

function prefiereOscuroPorSistema(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  } catch {
    return false;
  }
}

export function resolverTema(preferencia: PreferenciaTema, bucket = calcularBucketTiempo()): TemaAplicado {
  if (preferencia === 'light') return 'light';
  if (preferencia === 'dark') return 'dark';

  // Auto: primero respeta el SO; si no existe, cae a horario.
  if (prefiereOscuroPorSistema()) return 'dark';
  return bucket === 'night' || bucket === 'dusk' ? 'dark' : 'light';
}

export function aplicarTemaDocumento(preferencia: PreferenciaTema): { tema: TemaAplicado; bucket: BucketTiempo } {
  const bucket = calcularBucketTiempo();
  const tema = resolverTema(preferencia, bucket);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.dataset.theme = tema;
    root.dataset.time = bucket;

    // Ayuda a controles nativos (inputs, scrollbars, etc.)
    try {
      // @ts-expect-error: `colorScheme` existe en CSSStyleDeclaration moderno.
      root.style.colorScheme = tema;
    } catch {
      // noop
    }
  }

  return { tema, bucket };
}

export function siguientePreferenciaTema(actual: PreferenciaTema): PreferenciaTema {
  switch (actual) {
    case 'auto':
      return 'light';
    case 'light':
      return 'dark';
    default:
      return 'auto';
  }
}
