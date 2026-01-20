// Configuracion Vite para el servidor de desarrollo y build.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  // En monorepos, centralizamos variables en el `.env` del root.
  // Esto permite que `VITE_*` se tome del mismo archivo que usa docker compose.
  envDir: path.resolve(__dirname, '..', '..'),
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: false
    }
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true
  }
});
