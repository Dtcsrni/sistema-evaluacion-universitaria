//Lógica para autenticar usuario almacenando datos en Local Storage
//-Persistencia local en navegador
//-Almacenamiento de strings
export type Session = {
  email: string;
  CreadoEn: string;
};

const KEY = 'sistemaEvalua.session.v1';

export function getSession(): Session | null {
  const raw = localStorage.getItem (KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse (raw) as Session;
    return session;
  } catch (error) {
    console.error ('Error al convertir la variable de sesión desde Local Storage', error);
    return null;
  }
}
export function login (email: string):void {
    const session: Session = {
        email,
        CreadoEn: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(session));
}

export function logout(): void {
    localStorage.removeItem(KEY);
}