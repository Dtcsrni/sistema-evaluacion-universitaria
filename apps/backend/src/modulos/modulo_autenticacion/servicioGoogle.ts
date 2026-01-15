import { OAuth2Client } from 'google-auth-library';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { configuracion } from '../../configuracion';

export type PerfilGoogle = {
  correo: string;
  sub: string;
  nombreCompleto?: string;
};

let client: OAuth2Client | null = null;

function obtenerClient() {
  if (!configuracion.googleOauthClientId) {
    throw new ErrorAplicacion('GOOGLE_NO_CONFIG', 'Acceso con Google no configurado', 501);
  }
  if (!client) {
    client = new OAuth2Client(configuracion.googleOauthClientId);
  }
  return client;
}

export async function verificarCredencialGoogle(credential: string): Promise<PerfilGoogle> {
  if (!credential || typeof credential !== 'string') {
    throw new ErrorAplicacion('GOOGLE_CREDENCIAL_INVALIDA', 'Credencial invalida', 401);
  }

  const c = obtenerClient();
  const ticket = await c.verifyIdToken({
    idToken: credential,
    audience: configuracion.googleOauthClientId
  });

  const payload = ticket.getPayload();
  const correo = payload?.email;
  const sub = payload?.sub;
  const verificado = payload?.email_verified;

  if (!correo || !sub) {
    throw new ErrorAplicacion('GOOGLE_CREDENCIAL_INVALIDA', 'Credencial invalida', 401);
  }
  if (verificado !== true) {
    throw new ErrorAplicacion('GOOGLE_EMAIL_NO_VERIFICADO', 'El correo de Google no esta verificado', 401);
  }

  return {
    correo: String(correo).toLowerCase(),
    sub: String(sub),
    nombreCompleto: typeof payload?.name === 'string' ? payload.name : undefined
  };
}
