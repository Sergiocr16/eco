import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

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
      '/ws/pty': { target: 'ws://127.0.0.1:7000', ws: true, changeOrigin: false },
      '/ws': { target: 'ws://127.0.0.1:7000', ws: true, changeOrigin: false },
      '/auth': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/health': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/info': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/tts': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/skills': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/workspaces': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/shell': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/file': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/config': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/git': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/pty': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/voice': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/dev': { target: 'http://127.0.0.1:7000', changeOrigin: false },
      '/proxy': { target: 'http://127.0.0.1:7000', changeOrigin: false },
    },
  },
});
