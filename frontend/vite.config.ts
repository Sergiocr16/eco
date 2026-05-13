import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Puerto del backend en dev. Default 7000; lo movimos a 7050 por convivencia
// con macOS AirPlay Receiver (también en :7000). Override con ECO_BACKEND_PORT.
const BACKEND_PORT = process.env.ECO_BACKEND_PORT ?? '7050';
const HTTP_TARGET = `http://127.0.0.1:${BACKEND_PORT}`;
const WS_TARGET = `ws://127.0.0.1:${BACKEND_PORT}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Paths relativos para que el bundle funcione cuando Electron lo sirve
  // como file:// (el index.html bundleado vive adentro del .app).
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/ws/pty': { target: WS_TARGET, ws: true, changeOrigin: false },
      '/ws': { target: WS_TARGET, ws: true, changeOrigin: false },
      '/auth': { target: HTTP_TARGET, changeOrigin: false },
      '/health': { target: HTTP_TARGET, changeOrigin: false },
      '/info': { target: HTTP_TARGET, changeOrigin: false },
      '/tts': { target: HTTP_TARGET, changeOrigin: false },
      '/skills': { target: HTTP_TARGET, changeOrigin: false },
      '/workspaces': { target: HTTP_TARGET, changeOrigin: false },
      '/shell': { target: HTTP_TARGET, changeOrigin: false },
      '/file': { target: HTTP_TARGET, changeOrigin: false },
      '/config': { target: HTTP_TARGET, changeOrigin: false },
      '/git': { target: HTTP_TARGET, changeOrigin: false },
      '/pty': { target: HTTP_TARGET, changeOrigin: false },
      '/voice': { target: HTTP_TARGET, changeOrigin: false },
      '/dev': { target: HTTP_TARGET, changeOrigin: false },
      '/proxy': { target: HTTP_TARGET, changeOrigin: false },
    },
  },
});
