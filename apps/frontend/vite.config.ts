// Configuracion Vite para el servidor de desarrollo y build.
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '..', '..');
  const env = loadEnv(mode, envDir, '');
  const flagHttps = String(env.VITE_HTTPS || '').trim();
  const usarHttps = /^(1|true|si|yes)$/i.test(flagHttps);

  const certPath = String(env.VITE_HTTPS_CERT_PATH || '').trim();
  const keyPath = String(env.VITE_HTTPS_KEY_PATH || '').trim();
  const certReady = Boolean(
    usarHttps &&
    certPath &&
    keyPath &&
    fs.existsSync(certPath) &&
    fs.existsSync(keyPath)
  );

  const httpsConfig = certReady
    ? {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      }
    : false;

  const plugins = [react()];

  return {
    plugins,
    // En monorepos, centralizamos variables en el `.env` del root.
    // Esto permite que `VITE_*` se tome del mismo archivo que usa docker compose.
    envDir,
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      https: httpsConfig,
      proxy: {
        '/api': {
          target: String(env.VITE_API_PROXY_TARGET || 'http://localhost:4000'),
          changeOrigin: true
        }
      },
      hmr: {
        overlay: false
      }
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: true,
      https: httpsConfig
    }
  };
});
