import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Puerto del backend en dev. Default 7000; lo movimos a 7050 por convivencia
// con macOS AirPlay Receiver (también en :7000). Override con ECO_BACKEND_PORT.
const BACKEND_PORT = process.env.ECO_BACKEND_PORT ?? '7050';
const HTTP_TARGET = `http://127.0.0.1:${BACKEND_PORT}`;
const WS_TARGET = `ws://127.0.0.1:${BACKEND_PORT}`;

// La config de Firebase se hornea en el bundle en build-time (no hay forma de
// inyectarla después: el .exe/.app llega a una máquina sin `.env.local`). Si
// falta, `firebaseConfigured()` devuelve false y el usuario ve "Firebase no
// está configurado" sin poder loguearse.
//
// Esto pasó de verdad: el workflow release-win hacía checkout limpio y publicó
// instaladores sin Firebase desde v1.0.1 hasta v1.0.4 — el build no se quejaba.
// Fallar acá convierte un instalador roto en un CI en rojo.
// Validamos FORMA, no solo presencia: un secret mal cargado en CI (p.ej. el
// literal "-" de un `gh secret set --body -`) no está vacío, pasaría un check
// de presencia y volvería a publicar un instalador roto con el CI en verde.
const FIREBASE_SHAPE: Record<string, RegExp> = {
  VITE_FIREBASE_API_KEY: /^AIza[\w-]{30,}$/,
  VITE_FIREBASE_AUTH_DOMAIN: /\.firebaseapp\.com$/,
  VITE_FIREBASE_PROJECT_ID: /^[a-z0-9][a-z0-9-]{3,29}$/,
  VITE_FIREBASE_STORAGE_BUCKET: /\.(appspot\.com|firebasestorage\.app)$/,
  VITE_FIREBASE_MESSAGING_SENDER_ID: /^\d{6,}$/,
  VITE_FIREBASE_APP_ID: /^\d+:\d+:web:[a-z0-9]+$/i,
};

function assertFirebaseConfigured(mode: string): void {
  // loadEnv mergea los .env* del root con las VITE_* que ya estén en process.env
  // (que es como las inyecta CI).
  const env = loadEnv(mode, __dirname, 'VITE_');
  const bad = Object.entries(FIREBASE_SHAPE)
    .filter(([k, re]) => !re.test(env[k]?.trim() ?? ''))
    .map(([k]) => k);
  if (bad.length === 0) return;
  throw new Error(
    `Build abortado: ${bad.join(', ')} falta(n) o no tiene(n) forma de config de Firebase.\n` +
      `El bundle quedaría sin Firebase y nadie podría loguearse.\n` +
      `Local: copiá frontend/.env.example a frontend/.env.local.\n` +
      `CI: cargá los secrets VITE_FIREBASE_* (ver .github/workflows/release-win.yml).`,
  );
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') assertFirebaseConfigured(mode);
  return {
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
        // Config por workspace (admin define server + base branches, todos leen).
        '/workspace-config': { target: HTTP_TARGET, changeOrigin: false },
      },
    },
  };
});
