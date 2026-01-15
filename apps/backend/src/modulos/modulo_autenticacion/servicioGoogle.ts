import { OAuth2Client } from 'google-auth-library';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion';
import { esCorreoDeDominioPermitido } from '../../compartido/utilidades/correo';
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

  const correoFinal = String(correo).toLowerCase();
  if (
    Array.isArray(configuracion.dominiosCorreoPermitidos) &&
    configuracion.dominiosCorreoPermitidos.length > 0 &&
    !esCorreoDeDominioPermitido(correoFinal, configuracion.dominiosCorreoPermitidos)
  ) {
    throw new ErrorAplicacion(
      'DOMINIO_CORREO_NO_PERMITIDO',
      'Correo no permitido por politicas. Usa tu correo institucional.',
      403
    );
  }

  return {
    correo: correoFinal,
    sub: String(sub),
    nombreCompleto: typeof payload?.name === 'string' ? payload.name : undefined
  };
}
