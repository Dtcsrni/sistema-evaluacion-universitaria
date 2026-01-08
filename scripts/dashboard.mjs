// Dashboard de consola para revisar API + Web local.
// Usa fetch global de Node y lee VITE_API_BASE_URL/WEB_URL.

const baseApi = process.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const urlSalud = baseApi.endsWith('/salud') ? baseApi : `${baseApi.replace(/\/$/, '')}/salud`;
const urlWeb = process.env.WEB_URL || 'http://localhost:4173';

async function fetchSeguro(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 2500);
  try {
    const res = await fetch(url, { signal: controller.signal, method: options.method || 'GET' });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    return null;
  }
}

async function verificarApi() {
  const res = await fetchSeguro(urlSalud);
  if (!res || !res.ok) return { up: false };
  const data = await res.json().catch(() => ({}));
  return {
    up: true,
    tiempoActivo: typeof data.tiempoActivo === 'number' ? Math.round(data.tiempoActivo) : undefined,
    db: data.db || undefined
  };
}

async function verificarWeb() {
  const res = await fetchSeguro(urlWeb);
  if (!res) return { up: false };
  return { up: res.ok };
}

function linea(label, value) {
  return `- ${label}: ${value}`;
}

(async () => {
  const [api, web] = await Promise.all([verificarApi(), verificarWeb()]);

  console.log('Dashboard del proyecto');
  console.log(linea('API Base', baseApi));
  console.log(linea('Web', urlWeb));
  console.log('');

  console.log(linea('Estado API', api.up ? 'UP' : 'DOWN'));
  if (api.up) {
    if (api.tiempoActivo !== undefined) console.log(linea('API Tiempo Activo', `${api.tiempoActivo}s`));
    if (api.db) {
      const dbText = typeof api.db.descripcion === 'string' ? api.db.descripcion : String(api.db.estado);
      console.log(linea('DB', dbText));
    }
  }
  console.log(linea('Estado Web', web.up ? 'UP' : 'DOWN'));

  console.log('\nTips:');
  console.log(linea('URL Salud', urlSalud));
  console.log(linea('Abrir Frontend', urlWeb));
})();
