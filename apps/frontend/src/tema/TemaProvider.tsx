import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  aplicarTemaDocumento,
  CLAVE_TEMA_PREFERENCIA,
  guardarPreferenciaTema,
  leerPreferenciaTema,
  normalizarPreferenciaTema,
  type BucketTiempo,
  type PreferenciaTema,
  type TemaAplicado
} from './tema';

type TemaContexto = {
  preferencia: PreferenciaTema;
  temaAplicado: TemaAplicado;
  bucketTiempo: BucketTiempo;
  setPreferencia: (pref: PreferenciaTema) => void;
};

const ContextoTema = createContext<TemaContexto | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  const [preferencia, setPreferenciaState] = useState<PreferenciaTema>(() => leerPreferenciaTema());
  const [{ tema: temaAplicado, bucket: bucketTiempo }, setAplicado] = useState(() => aplicarTemaDocumento(leerPreferenciaTema()));

  useEffect(() => {
    guardarPreferenciaTema(preferencia);
    setAplicado(aplicarTemaDocumento(preferencia));
  }, [preferencia]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== CLAVE_TEMA_PREFERENCIA) return;
      setPreferenciaState(normalizarPreferenciaTema(event.newValue));
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Reaplica por cambios del SO y por cambio horario (bucket).
    const intervalId = window.setInterval(() => {
      setAplicado(aplicarTemaDocumento(preferencia));
    }, 5 * 60 * 1000);

    let media: MediaQueryList | null = null;
    let onMedia: ((e: MediaQueryListEvent) => void) | null = null;

    try {
      media = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
      onMedia = () => setAplicado(aplicarTemaDocumento(preferencia));
      media?.addEventListener?.('change', onMedia);
    } catch {
      // noop
    }

    return () => {
      window.clearInterval(intervalId);
      try {
        if (media && onMedia) media.removeEventListener?.('change', onMedia);
      } catch {
        // noop
      }
    };
  }, [preferencia]);

  const value = useMemo<TemaContexto>(
    () => ({
      preferencia,
      temaAplicado,
      bucketTiempo,
      setPreferencia: setPreferenciaState
    }),
    [preferencia, temaAplicado, bucketTiempo]
  );

  return <ContextoTema.Provider value={value}>{children}</ContextoTema.Provider>;
}

export function useTema() {
  const ctx = useContext(ContextoTema);
  if (!ctx) throw new Error('useTema debe usarse dentro de <TemaProvider>');
  return ctx;
}
