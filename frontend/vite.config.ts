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
  build: {
    // Habilitamos sourcemap solo en dev; en prod no para reducir bundle disk
    sourcemap: false,
    // chunk size warning solo informativo
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Separamos libs pesadas en chunks paralelos para que el navegador
        // las cachee independientemente y solo recargue el chunk de la app
        // cuando cambia código nuestro.
        manualChunks: {
          'vendor-xterm': ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
          'vendor-motion': ['motion', 'motion/react'],
          'vendor-react': ['react', 'react-dom'],
        },
      },
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
      '/fs': { target: HTTP_TARGET, changeOrigin: false },
      '/notes': { target: HTTP_TARGET, changeOrigin: false },
      '/config': { target: HTTP_TARGET, changeOrigin: false },
      '/git': { target: HTTP_TARGET, changeOrigin: false },
      '/pty': { target: HTTP_TARGET, changeOrigin: false },
      '/voice': { target: HTTP_TARGET, changeOrigin: false },
      '/dev': { target: HTTP_TARGET, changeOrigin: false },
      '/proxy': { target: HTTP_TARGET, changeOrigin: false },
      '/worktree': { target: HTTP_TARGET, changeOrigin: false },
      '/backup': { target: HTTP_TARGET, changeOrigin: false },
      '/admin': { target: HTTP_TARGET, changeOrigin: false },
      // Sync cross-device (doc store por usuario): /user/docs, /user/doc.
      '/user': { target: HTTP_TARGET, changeOrigin: false },
      // Cubre /bubble/* y /bubbles (sync + list) por match de prefijo.
      '/bubble': { target: HTTP_TARGET, changeOrigin: false },
    },
  },
});
