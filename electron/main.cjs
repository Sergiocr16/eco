// Main process de Electron.
// Estrategia: spawneamos el backend Node compilado como child process y le
// dejamos su puerto fijo (127.0.0.1:7000). El renderer (frontend bundleado)
// se carga desde file:// y se comunica con el backend igual que en dev.
//
// El sidecar listener Python NO se empaqueta — sigue corriéndose aparte.
// En esta versión Eco funciona sin él (Web Speech API en dev).

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const isDev = !app.isPackaged;
const BACKEND_HOST = '127.0.0.1';
// Default dev port: 7050 (en macOS AirPlay Receiver usa :7000). Default
// empaquetado: 7100 para que la .app coexista con `npm run dev` corriendo
// en paralelo en la misma máquina.
const BACKEND_PORT = process.env.ECO_PORT || (app.isPackaged ? '7100' : '7050');
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const DEV_FRONTEND_URL = 'http://127.0.0.1:5173';

let mainWindow = null;
let backendProc = null;

function tokenPath() {
  return path.join(os.homedir(), '.eco', 'token');
}

function readEcoToken() {
  try {
    return fs.readFileSync(tokenPath(), 'utf8').trim();
  } catch {
    return '';
  }
}

function backendEntrypoint() {
  if (isDev) {
    // En dev no spawneamos backend desde Electron — asumimos que `npm run dev:backend`
    // ya está corriendo en otra ventana.
    return null;
  }
  // En el bundle, electron-builder copia backend/dist y backend/node_modules
  // dentro de `extraResources`. Esa ruta está en `process.resourcesPath`.
  return path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
}

function backendCwd() {
  if (isDev) return path.resolve(__dirname, '..', 'backend');
  return path.join(process.resourcesPath, 'backend');
}

function spawnBackend() {
  if (isDev) {
    console.log('[electron] modo dev — esperando que `npm run dev:backend` corra aparte');
    return;
  }
  const entry = backendEntrypoint();
  if (!entry || !fs.existsSync(entry)) {
    console.error('[electron] backend bundle no encontrado en', entry);
    return;
  }
  // Heredamos el entorno + sumamos ECO_HOST/ECO_PORT por si acaso. Le
  // pasamos el ELECTRON_RUN_AS_NODE para que el binario Electron actúe
  // como Node puro (evita tener que bundlear un Node aparte).
  // Le decimos al backend dónde está el bundle del frontend para que lo sirva
  // como static — así el renderer y la API comparten origen y no hay CORS.
  const frontendDist = path.join(process.resourcesPath, 'frontend', 'dist');
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ECO_HOST: BACKEND_HOST,
    ECO_PORT: BACKEND_PORT,
    ECO_FRONTEND_DIST: frontendDist,
  };
  console.log('[electron] spawn backend:', entry);
  backendProc = spawn(process.execPath, [entry], {
    cwd: backendCwd(),
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  backendProc.on('exit', (code, sig) => {
    console.log(`[electron] backend salió con code=${code} sig=${sig}`);
    backendProc = null;
  });
}

function killBackend() {
  if (backendProc && !backendProc.killed) {
    try { backendProc.kill('SIGTERM'); } catch { /* noop */ }
    setTimeout(() => {
      if (backendProc && !backendProc.killed) {
        try { backendProc.kill('SIGKILL'); } catch { /* noop */ }
      }
    }, 1500);
  }
}

async function waitForBackend(url, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a0c',
    // En Mac usamos `hiddenInset` + `trafficLightPosition` para que los
    // semáforos floten en una posición predecible. La estética sigue siendo
    // "frameless" pero el OS nos da una guardia natural arriba.
    // En Win/Linux dejamos el frame default del sistema.
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 14 },
    } : {}),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true, // habilita <webview> para futuro navegador full-Chromium
    },
  });

  // Links externos → navegador del sistema (no abrir nuevas ventanas de Electron).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url).catch(() => { /* noop */ });
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Permisos del renderer (getUserMedia, etc.). Sin esto Chromium rechaza
  // mic/cámara antes de que el OS pueda mostrar su prompt nativo. Concedemos
  // media/audioCapture, y dejamos que macOS muestre el prompt de TCC al usuario
  // la primera vez (gracias a NSMicrophoneUsageDescription en Info.plist).
  const sess = mainWindow.webContents.session;
  sess.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = new Set(['media', 'audioCapture', 'videoCapture', 'microphone', 'clipboard-read', 'clipboard-sanitized-write']);
    callback(allowed.has(permission));
  });
  // Algunas versiones de Chromium también usan setPermissionCheckHandler para
  // chequeos sincrónicos (ej. al instanciar AudioContext). Lo concedemos para
  // los mismos permisos. Si no existe el método, ignoramos.
  if (typeof sess.setPermissionCheckHandler === 'function') {
    sess.setPermissionCheckHandler((_wc, permission) => {
      const allowed = new Set(['media', 'audioCapture', 'videoCapture', 'microphone', 'clipboard-read', 'clipboard-sanitized-write']);
      return allowed.has(permission);
    });
  }

  if (isDev) {
    await mainWindow.loadURL(DEV_FRONTEND_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // El backend sirve el frontend bundle como static. Cargamos por http://
    // del mismo origen → sin CORS, fetch funciona, ws funciona, todo en un
    // solo origen 127.0.0.1:7100.
    await mainWindow.loadURL(BACKEND_URL + '/');
    // DevTools también en prod (temporal para debug) — abrir con Cmd+Opt+I.
    if (process.env.ECO_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
}

ipcMain.on('eco:renderer-log', (_e, args) => {
  console.log('[renderer]', ...(Array.isArray(args) ? args : [args]));
});

// Folder picker nativo del OS — usado por Settings → Integraciones para
// elegir la carpeta del vault Obsidian.
ipcMain.handle('eco:pick-folder', async (_e, opts) => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: (opts && opts.title) || 'Elegir carpeta',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: (opts && opts.defaultPath) || undefined,
  });
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true, path: '' };
  return { canceled: false, path: result.filePaths[0] };
});

// IPC: el renderer pide el token o el backend URL desde el preload.
ipcMain.handle('eco:get-config', () => ({
  backendUrl: BACKEND_URL,
  token: readEcoToken(),
  platform: process.platform,
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged,
}));

app.whenReady().then(async () => {
  spawnBackend();
  if (!isDev) {
    const ok = await waitForBackend(BACKEND_URL);
    if (!ok) console.warn('[electron] backend no respondió /health en 15s, abriendo igual');
  }
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killBackend();
});
