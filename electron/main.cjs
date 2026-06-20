// Main process de Electron.
// Estrategia: spawneamos el backend Node compilado como child process y le
// dejamos su puerto fijo (127.0.0.1:7000). El renderer (frontend bundleado)
// se carga desde file:// y se comunica con el backend igual que en dev.

const { app, BrowserWindow, Menu, Notification, shell, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const isDev = !app.isPackaged;

// Auto-update: solo Windows empaquetado por ahora. electron-updater en macOS
// EXIGE app firmada + notarizada (sin firma checkForUpdates falla con "Could not
// get code signature"); Eco se buildea sin firma (identity:null), así que en Mac
// el updater queda inerte hasta tener cuenta Apple Developer. En dev tampoco.
const UPDATES_ENABLED = app.isPackaged && process.platform === 'win32';

// Mantener vivas las ventanas en segundo plano / ocluidas (satélites en otro
// monitor). Sin esto Chromium throttlea o SUSPENDE el render de las ventanas
// que no tienen foco o están tapadas, y solo la última enfocada anima — las
// pantallas de bloqueo de las demás quedan congeladas. Deben setearse antes de
// app.whenReady. `disable-backgrounding-occluded-windows` es la clave en macOS.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const BACKEND_HOST = '127.0.0.1';
// Default dev port: 7050 (en macOS AirPlay Receiver usa :7000). Default
// empaquetado: 7100 para que la .app coexista con `npm run dev` corriendo
// en paralelo en la misma máquina.
const BACKEND_PORT = process.env.ECO_PORT || (app.isPackaged ? '7100' : '7050');
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const DEV_FRONTEND_URL = 'http://127.0.0.1:5173';

let mainWindow = null;
let backendProc = null;
// Guardamos el pid aparte: si el backend sale solo (crash), backendProc queda
// null y no podríamos matarlo/diagnosticarlo solo con la referencia.
let backendPid = 0;
// Re-spawn acotado ante crash (evita bucle infinito si el fallo es permanente,
// ej. EADDRINUSE crónico). Se resetea cuando el backend vuelve a estar sano.
let backendRestarts = 0;
const MAX_BACKEND_RESTARTS = 3;
let respawnTimer = null;
// Ventanas "solo bubble" — un BrowserWindow por bubbleId que renderiza UNA
// sola conversación a pantalla completa (?solo=<id>). Pensado para tirar el
// bubble a otro monitor y trabajarlo aparte. Map para que re-abrir el mismo
// bubble enfoque la ventana existente en vez de duplicarla.
const bubbleWindows = new Map();
// En macOS, cerrar la ventana NO sale de la app (convención del sistema).
// Interceptamos el close del botón rojo para ocultar en lugar de destruir,
// preservando el backend y el state. Cuando el user hace Cmd+Q (o el menú
// → Quit), seteamos isQuitting=true para permitir el close real.
let isQuitting = false;
// True una vez que electron-updater terminó de bajar una versión nueva. Lo
// consulta `eco:get-config` para que la UI pueda ofrecer "instalar y reiniciar".
let updateDownloaded = false;

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
    // Project id de Firebase para que el backend verifique los ID tokens (jose).
    // Es config pública, no secreta (la seguridad son las Security Rules).
    ECO_FIREBASE_PROJECT_ID: process.env.ECO_FIREBASE_PROJECT_ID || 'aditum-eco',
  };
  console.log('[electron] spawn backend:', entry);
  backendProc = spawn(process.execPath, [entry], {
    cwd: backendCwd(),
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  backendPid = backendProc.pid || 0;
  backendProc.on('exit', (code, sig) => {
    console.log(`[electron] backend salió con code=${code} sig=${sig}`);
    backendProc = null;
    backendPid = 0;
    // Si murió por su cuenta (no fue un quit nuestro), re-levantarlo: sin esto
    // la ventana quedaba viva pero sin backend → UI congelada/negra al reabrir.
    if (!isQuitting && code !== 0) {
      if (backendRestarts < MAX_BACKEND_RESTARTS) {
        backendRestarts++;
        const wait = backendRestarts * 800;
        console.warn(`[electron] backend murió — re-spawn ${backendRestarts}/${MAX_BACKEND_RESTARTS} en ${wait}ms`);
        respawnTimer = setTimeout(() => { spawnBackend(); void reloadMainWindowWhenReady(); }, wait);
      } else {
        console.error('[electron] backend superó el máximo de reintentos; no re-spawneo más.');
      }
    }
  });
}

// Mata el backend por pid (no por la referencia, que puede ser null si salió
// solo) y resuelve cuando el proceso realmente murió, con un SIGKILL de
// respaldo. Awaitarlo en before-quit evita dejar el puerto ocupado para un
// relaunch inmediato.
function killBackend() {
  return new Promise((resolve) => {
    const pid = backendPid;
    if (!pid) { resolve(); return; }
    try { process.kill(pid, 'SIGTERM'); } catch { resolve(); return; }
    const start = Date.now();
    const iv = setInterval(() => {
      let alive = true;
      try { process.kill(pid, 0); } catch { alive = false; }
      if (!alive) { clearInterval(iv); resolve(); return; }
      if (Date.now() - start > 1500) {
        try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
        clearInterval(iv);
        resolve();
      }
    }, 100);
  });
}

// Best-effort: mata cualquier proceso que ya esté escuchando el puerto del
// backend ANTES de spawnear (un backend zombie de una corrida anterior que
// sobrevivió a un quit sucio). Solo se usa en el arranque en frío, nunca
// después de spawnear el nuestro.
function killStalePort(port) {
  return new Promise((resolve) => {
    const { exec } = require('node:child_process');
    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? `netstat -ano | findstr :${port} | findstr LISTENING`
      : `lsof -ti tcp:${port} -sTCP:LISTEN`;
    exec(cmd, (_err, stdout) => {
      const out = (stdout || '').trim();
      if (!out) { resolve(false); return; }
      const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const pids = isWin ? lines.map((l) => l.split(/\s+/).pop()).filter(Boolean) : lines;
      for (const pid of pids) {
        try {
          if (isWin) exec(`taskkill /PID ${pid} /F /T`);
          else process.kill(Number(pid), 'SIGKILL');
        } catch { /* noop */ }
      }
      console.warn(`[electron] puerto ${port} ocupado al arrancar — maté ${pids.length} proceso(s) stale`);
      setTimeout(() => resolve(true), 300);
    });
  });
}

// Tras un re-spawn del backend, espera a que /health responda y recarga el
// renderer para que reconecte (WS, fetch) en vez de quedar en un estado muerto.
async function reloadMainWindowWhenReady() {
  const ok = await waitForBackend(BACKEND_URL);
  if (!ok) return;
  backendRestarts = 0;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.reload(); } catch { /* noop */ }
  }
}

// Carga el renderer con reintentos: si el backend tarda en levantar, en vez de
// mostrar una ventana en blanco para siempre reintentamos con backoff corto.
async function loadWithRetry(win, url, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    try { await win.loadURL(url); return; }
    catch (e) {
      console.error(`[electron] loadURL falló (intento ${i + 1}/${attempts}):`, (e && e.message) || e);
      if (!win.isDestroyed() && !win.isVisible()) win.show();
      await new Promise((r) => setTimeout(r, 600));
      if (win.isDestroyed()) return;
    }
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

// Aplica las mismas reglas de seguridad a cualquier BrowserWindow: links
// externos al navegador del OS y permisos de getUserMedia. Compartido entre
// la ventana principal y las ventanas "solo bubble".
function hardenWindow(win) {
  // Links externos → navegador del sistema (no abrir nuevas ventanas de Electron).
  win.webContents.setWindowOpenHandler(({ url }) => {
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
  const allowed = new Set(['media', 'audioCapture', 'videoCapture', 'microphone', 'clipboard-read', 'clipboard-sanitized-write']);
  const sess = win.webContents.session;
  sess.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowed.has(permission));
  });
  // Algunas versiones de Chromium también usan setPermissionCheckHandler para
  // chequeos sincrónicos (ej. al instanciar AudioContext). Lo concedemos para
  // los mismos permisos. Si no existe el método, ignoramos.
  if (typeof sess.setPermissionCheckHandler === 'function') {
    sess.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  }
}

// URL base del renderer según el modo (dev sirve Vite, packaged lo sirve el
// backend como static en el mismo origen).
function rendererBaseUrl() {
  return isDev ? DEV_FRONTEND_URL : BACKEND_URL + '/';
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

  hardenWindow(mainWindow);

  // Mostrar la ventana en cuanto el contenido esté listo. Registrado ANTES del
  // loadURL a propósito: si loadURL rechaza (ej. el backend no levantó), abajo
  // forzamos el show igual — sino la ventana (show:false) quedaba INVISIBLE para
  // siempre y la app parecía "no abrir nada".
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Dev: Vite. Packaged: el backend sirve el frontend bundle como static en el
  // mismo origen (127.0.0.1:<port>) → sin CORS, fetch y ws funcionan directo.
  const targetUrl = isDev ? DEV_FRONTEND_URL : BACKEND_URL + '/';
  await loadWithRetry(mainWindow, targetUrl);

  // Red de seguridad post-carga: si una carga YA exitosa falla después (backend
  // re-spawneado, asset 404 tras rebuild), recargar solo. `hasLoadedOnce` evita
  // pisar el reintento de arranque (loadWithRetry); el contador acotado evita un
  // bucle de recargas si el fallo es permanente.
  let hasLoadedOnce = false;
  let loadFailCount = 0;
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, _desc, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 = ERR_ABORTED (navegación cancelada)
    if (!hasLoadedOnce || loadFailCount >= 5) return;
    loadFailCount++;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(rendererBaseUrl()).catch(() => { /* noop */ });
      }
    }, 800);
  });

  if (process.env.ECO_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Estado fullscreen → renderer. En fullscreen los traffic lights de macOS
  // desaparecen, así que el renderer no necesita reservar los 36px del top
  // inset. Notificamos al renderer para que ajuste el layout.
  const sendFullscreen = (isFull) => {
    try { mainWindow?.webContents.send('eco:fullscreen-changed', !!isFull); }
    catch { /* renderer no listo, ignoramos */ }
  };
  mainWindow.on('enter-full-screen', () => sendFullscreen(true));
  mainWindow.on('leave-full-screen', () => sendFullscreen(false));
  // Enviar estado inicial cuando el renderer está listo.
  mainWindow.webContents.on('did-finish-load', () => {
    hasLoadedOnce = true;
    loadFailCount = 0;
    sendFullscreen(mainWindow.isFullScreen());
  });

  // macOS: el botón rojo "cierra" la ventana pero la app sigue corriendo.
  // Interceptamos el close para ocultar la ventana en lugar de destruirla
  // — así el backend, los PTYs y los dev servers no mueren, y al re-abrir
  // (click en el dock) recuperamos la sesión exacta. En Cmd+Q normal,
  // before-quit setea isQuitting=true y dejamos pasar el close real.
  if (process.platform === 'darwin') {
    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
  }
}

ipcMain.on('eco:renderer-log', (_e, args) => {
  console.log('[renderer]', ...(Array.isArray(args) ? args : [args]));
});

// Abre un URL/URI con el handler default del OS. Pensado para URIs custom
// (vscode://, idea://, cursor://) que disparan el "Open in IDE" del
// FileEditor. shell.openExternal sigue las mismas reglas que el browser:
// no se ejecuta nada local arbitrariamente, solo se invoca el protocol
// handler registrado.
ipcMain.handle('eco:open-external', async (_e, url) => {
  if (typeof url !== 'string' || !url) return { ok: false, error: 'url requerido' };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'open failed' };
  }
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

// ─── Save/Open dialogs + file I/O para backup ─────────────────────────────
// El user elige dónde guardar el zip de backup y dónde abrirlo. El renderer
// no puede escribir/leer files arbitrarios, pero el main sí — con un allowlist
// que bloquea paths de sistema y el directorio ~/.eco (no querés que el user
// pueda corromper su propio estado activo por accidente).

function isSafeUserPath(absPath) {
  if (typeof absPath !== 'string' || !absPath) return false;
  // Path traversal o paths relativos no son seguros.
  if (absPath.includes('\0')) return false;
  if (!path.isAbsolute(absPath)) return false;
  // Bloqueamos dirs de sistema y el dir de estado de Eco.
  const home = os.homedir();
  const blocked = [
    '/System', '/Library', '/usr', '/bin', '/sbin', '/etc', '/private/etc',
    '/private/var', path.join(home, '.eco'),
  ];
  for (const b of blocked) {
    if (absPath === b || absPath.startsWith(b + path.sep)) return false;
  }
  return true;
}

ipcMain.handle('eco:save-dialog', async (_e, opts) => {
  const o = opts || {};
  const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: o.title || 'Guardar',
    defaultPath: o.defaultPath || undefined,
    filters: Array.isArray(o.filters) ? o.filters : undefined,
  });
  if (result.canceled || !result.filePath) return { canceled: true, path: '' };
  return { canceled: false, path: result.filePath };
});

ipcMain.handle('eco:open-dialog', async (_e, opts) => {
  const o = opts || {};
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: o.title || 'Abrir',
    defaultPath: o.defaultPath || undefined,
    filters: Array.isArray(o.filters) ? o.filters : undefined,
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true, path: '' };
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('eco:write-binary', async (_e, opts) => {
  const o = opts || {};
  if (!isSafeUserPath(o.path)) return { ok: false, error: 'path_blocked' };
  if (typeof o.base64 !== 'string') return { ok: false, error: 'base64_required' };
  try {
    fs.mkdirSync(path.dirname(o.path), { recursive: true });
    fs.writeFileSync(o.path, Buffer.from(o.base64, 'base64'));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'write_error' };
  }
});

ipcMain.handle('eco:read-binary', async (_e, opts) => {
  const o = opts || {};
  if (!isSafeUserPath(o.path)) return { ok: false, error: 'path_blocked' };
  try {
    const buf = fs.readFileSync(o.path);
    return { ok: true, base64: buf.toString('base64') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'read_error' };
  }
});

ipcMain.handle('eco:list-dir', async (_e, opts) => {
  const o = opts || {};
  if (!isSafeUserPath(o.dir)) return { ok: false, error: 'path_blocked' };
  try {
    const entries = fs.readdirSync(o.dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => {
        const p = path.join(o.dir, d.name);
        let mtime = 0;
        try { mtime = fs.statSync(p).mtimeMs; } catch { /* noop */ }
        return { name: d.name, path: p, mtime };
      });
    return { ok: true, entries };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'list_error' };
  }
});

ipcMain.handle('eco:delete-file', async (_e, opts) => {
  const o = opts || {};
  if (!isSafeUserPath(o.path)) return { ok: false, error: 'path_blocked' };
  try {
    fs.unlinkSync(o.path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'delete_error' };
  }
});

// IPC: notificación nativa via `electron.Notification`. Usado por
// `usePtyBusyNotifier` cuando un agente termina (PTY busy→idle). En
// `.dmg` unsigned, `new Notification(...)` de la Web API NO aparece en
// Notification Center de macOS — pero Electron.Notification sí, porque
// Electron asocia internamente la notif con el bundle ID.
// Click handler: trae la ventana al frente y manda al renderer un
// `eco:notification_clicked` con el bubbleId para que abra el agente.
ipcMain.handle('eco:notify', (_event, opts) => {
  const o = opts || {};
  if (!o.title) return { ok: false, error: 'title requerido' };
  if (!Notification.isSupported()) return { ok: false, error: 'unsupported' };
  try {
    const n = new Notification({
      title: String(o.title),
      body: o.body ? String(o.body) : '',
      silent: !!o.silent,
    });
    if (o.bubbleId) {
      n.on('click', () => {
        try {
          if (!mainWindow) return;
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          if (app.dock && typeof app.dock.show === 'function') {
            try { app.dock.show(); } catch { /* noop */ }
          }
          mainWindow.webContents.send('eco:notification_clicked', { bubbleId: String(o.bubbleId) });
        } catch { /* noop */ }
      });
    }
    n.show();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'notify error' };
  }
});

// Notifica a la ventana principal qué bubbles están abiertos en ventana
// aparte, para que mueva el foco al dashboard y los marque como "detached".
function notifyBubbleWindows(channel, bubbleId) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, { bubbleId });
    }
  } catch { /* renderer no listo */ }
}

// Crea (o enfoca) la ventana "solo bubble" para un bubbleId. El renderer
// carga el mismo origen con ?solo=<id> y App.tsx detecta el query param para
// montar SOLO ese AgentDetail, sin sidebar ni dashboard. Comparte backend,
// token (~/.eco) y localStorage con la ventana principal.
function createBubbleWindow(bubbleId) {
  const id = typeof bubbleId === 'string' ? bubbleId.trim() : '';
  if (!id) return { ok: false, error: 'bubbleId requerido' };
  // Solo ids con forma de bubble (alfanum + _ -). Defensa antes de meterlo en
  // la URL del renderer.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, error: 'bubbleId inválido' };

  const existing = bubbleWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return { ok: true, existing: true };
  }

  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0a0a0c',
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
      webviewTag: true,
      // Las ventanas satélite viven en otro monitor y se miran aunque no tengan
      // foco (ej. la pantalla de bloqueo, o el agente trabajando). Sin esto,
      // Chromium congela su render en segundo plano y solo la enfocada anima.
      backgroundThrottling: false,
    },
  });

  hardenWindow(win);
  bubbleWindows.set(id, win);

  const url = `${rendererBaseUrl()}?solo=${encodeURIComponent(id)}`;
  win.loadURL(url).catch((e) => console.error('[electron] solo window loadURL falló', e));

  win.once('ready-to-show', () => win.show());
  if (process.env.ECO_DEVTOOLS === '1') {
    win.webContents.once('did-finish-load', () => win.webContents.openDevTools({ mode: 'detach' }));
  }

  // Estado fullscreen → su propio renderer (mismo contrato que mainWindow).
  const sendFull = (isFull) => {
    try { win.webContents.send('eco:fullscreen-changed', !!isFull); } catch { /* noop */ }
  };
  win.on('enter-full-screen', () => sendFull(true));
  win.on('leave-full-screen', () => sendFull(false));
  win.webContents.on('did-finish-load', () => sendFull(win.isFullScreen()));

  // A diferencia de mainWindow, estas SÍ se destruyen al cerrar (no se ocultan).
  // Al cerrarse, avisamos a la principal para que re-adopte el bubble.
  win.on('closed', () => {
    bubbleWindows.delete(id);
    notifyBubbleWindows('eco:bubble-window-closed', id);
  });

  notifyBubbleWindows('eco:bubble-window-opened', id);
  return { ok: true, existing: false };
}

ipcMain.handle('eco:open-bubble-window', (_e, bubbleId) => createBubbleWindow(bubbleId));

ipcMain.handle('eco:close-bubble-window', (_e, bubbleId) => {
  const id = typeof bubbleId === 'string' ? bubbleId.trim() : '';
  const win = id ? bubbleWindows.get(id) : null;
  if (win && !win.isDestroyed()) win.close();
  return { ok: true };
});

ipcMain.handle('eco:list-bubble-windows', () => {
  const ids = [];
  for (const [id, win] of bubbleWindows) {
    if (win && !win.isDestroyed()) ids.push(id);
  }
  return ids;
});

// IPC: el renderer pide el token o el backend URL desde el preload.
ipcMain.handle('eco:get-config', () => ({
  backendUrl: BACKEND_URL,
  token: readEcoToken(),
  platform: process.platform,
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  updatesSupported: UPDATES_ENABLED,
}));

// Rutea el zoom al renderer ENFOCADO (puede ser la principal o una satélite de
// otro monitor) para que él aplique+persista su propio factor por ventana.
function sendZoomToFocused(dir) {
  const win = BrowserWindow.getFocusedWindow();
  if (!win || win.isDestroyed()) return;
  try { win.webContents.send('eco:zoom', dir); } catch { /* noop */ }
}

// Etiquetas del menú traducidas por el renderer (vía eco:set-menu-labels) para
// que sigan el toggle ES/EN de la app. null = aún no llegó → usamos defaults ES
// (idioma default de la app). Los ítems con `role` los localiza Electron solo.
let menuLabels = null;

// Menú de app propio. Reemplaza al default de Electron para poder rutear el
// zoom (Cmd +/−/0) a nuestra lógica por-ventana en vez de los roles built-in
// (zoomIn/zoomOut/resetZoom), que operan sobre webContents sin persistir ni
// distinguir ventana. Mantenemos los roles estándar de macOS (Edit, Window,
// About/Quit/Hide) para no romper Cmd+C/V/X/Z/A/Q ni los atajos del sistema.
function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const L = menuLabels || {};
  const zoomIn = L.zoomIn || 'Acercar';
  const zoomItems = [
    { label: zoomIn, accelerator: 'CommandOrControl+Plus', click: () => sendZoomToFocused('in') },
    // Cmd+= (sin Shift) es el atajo real en teclados US para "zoom in".
    { label: zoomIn, accelerator: 'CommandOrControl+=', visible: false, acceleratorWorksWhenHidden: true, click: () => sendZoomToFocused('in') },
    { label: L.zoomOut || 'Alejar', accelerator: 'CommandOrControl+-', click: () => sendZoomToFocused('out') },
    { label: L.zoomActual || 'Tamaño real', accelerator: 'CommandOrControl+0', click: () => sendZoomToFocused('reset') },
  ];
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: L.edit || 'Edición',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: L.view || 'Vista',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        ...zoomItems,
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: L.window || 'Ventana',
      role: 'window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// El renderer manda las etiquetas traducidas al montar y en cada cambio de
// idioma. Reconstruimos el menú con ellas.
ipcMain.handle('eco:set-menu-labels', (_e, labels) => {
  if (labels && typeof labels === 'object') {
    menuLabels = labels;
    buildAppMenu();
  }
  return { ok: true };
});

// Lock de instancia única: si ya corre un Eco, el segundo proceso le pasa el
// foco a la ventana existente y se cierra. Sin esto, cada doble clic abría una
// instancia NUEVA (con su propio backend): procesos zombie que después bloquean
// al instalador ("Eco cannot be closed") y hacen que "no pase nada" al abrir,
// porque el backend nuevo no puede bindear el puerto y la ventana queda detrás.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Reenvía un evento de update al renderer principal (si está vivo).
function sendUpdateEvent(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  } catch { /* renderer no listo */ }
}

// Configura electron-updater: auto-descarga en background y reenvía el ciclo de
// vida al renderer. Solo se llama cuando UPDATES_ENABLED.
let autoUpdaterWired = false;
function setupAutoUpdater() {
  if (!UPDATES_ENABLED || autoUpdaterWired) return;
  autoUpdaterWired = true;
  autoUpdater.autoDownload = true;
  // Fallback: si el user simplemente cierra la app sin apretar "reiniciar", el
  // update igual se aplica en el próximo arranque.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on('update-available', (info) => {
    sendUpdateEvent('eco:update-available', { version: info?.version });
  });
  autoUpdater.on('download-progress', (p) => {
    sendUpdateEvent('eco:update-progress', { percent: Math.round(p?.percent || 0) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    sendUpdateEvent('eco:update-ready', { version: info?.version });
    try {
      if (Notification.isSupported()) {
        const n = new Notification({
          title: 'Eco',
          body: `Nueva versión ${info?.version || ''} lista — reiniciá para actualizar`,
        });
        n.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
        });
        n.show();
      }
    } catch { /* noop */ }
  });
  autoUpdater.on('error', (err) => {
    sendUpdateEvent('eco:update-error', { message: (err && err.message) || String(err) });
  });

  // Chequeo inicial diferido (deja respirar al arranque) + periódico cada 6 h.
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => { /* noop */ }); }, 8_000);
  setInterval(() => { autoUpdater.checkForUpdates().catch(() => { /* noop */ }); }, 6 * 60 * 60 * 1000);
}

ipcMain.handle('eco:check-updates', async () => {
  if (!UPDATES_ENABLED) return { available: false, error: 'unsupported_platform' };
  try {
    const r = await autoUpdater.checkForUpdates();
    const info = r && r.updateInfo;
    const available = !!info && info.version !== app.getVersion();
    return { available, version: info?.version };
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message : 'check_failed' };
  }
});

ipcMain.handle('eco:install-update', async () => {
  if (!UPDATES_ENABLED) return { ok: false, error: 'unsupported_platform' };
  if (!updateDownloaded) return { ok: false, error: 'not_downloaded' };
  // Matar el backend ANTES de quitAndInstall: libera el puerto para el relaunch y
  // evita que el handler de before-quit (preventDefault + killBackend) bloquee el
  // quit del updater. quitFinishing=true salta esa re-entrada.
  isQuitting = true;
  quitFinishing = true;
  if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
  try { await killBackend(); } catch { /* noop */ }
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  buildAppMenu();
  // Antes de spawnear, liberar el puerto si quedó un backend zombie de una
  // corrida anterior — sino el nuestro choca con EADDRINUSE y muere en silencio.
  if (!isDev) await killStalePort(BACKEND_PORT);
  spawnBackend();
  if (!isDev) {
    const ok = await waitForBackend(BACKEND_URL);
    if (ok) backendRestarts = 0;
    else console.warn('[electron] backend no respondió /health en 15s, abriendo igual');
  }
  await createWindow();

  setupAutoUpdater();

  app.on('activate', () => {
    // En Mac: si la ventana está oculta (cerrada con botón rojo) la mostramos.
    // Si no existe (raro porque la mantenemos viva), creamos una nueva.
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      // Si el backend murió mientras la ventana estaba oculta, re-levantarlo y
      // recargar — sino la UI vuelve pero sin backend (congelada/negra).
      if (!isDev && !backendProc) {
        console.warn('[electron] backend no está corriendo al reactivar — re-spawn');
        if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
        backendRestarts = 0;
        spawnBackend();
        void reloadMainWindowWhenReady();
      }
    } else if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // En macOS, NO matamos el backend al cerrar la ventana — la app sigue
  // viva en el dock y el user espera que su sesión continue al re-abrir.
  // killBackend solo en Win/Linux donde cerrar la ventana sí quitea la app.
  if (process.platform !== 'darwin') {
    isQuitting = true;
    void killBackend().then(() => app.quit());
  }
});

// El quit espera a que el backend muera de verdad antes de salir: sino el
// proceso hijo podía sobrevivir ocupando el puerto y romper un relaunch
// inmediato (EADDRINUSE → ventana negra).
let quitFinishing = false;
app.on('before-quit', (event) => {
  // Marca que esto es un quit "de verdad" (Cmd+Q, menú Quit, app.quit()),
  // así el handler de 'close' del mainWindow deja pasar el destroy real.
  isQuitting = true;
  if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
  if (quitFinishing || !backendPid) return; // ya esperamos / nada que matar
  quitFinishing = true;
  event.preventDefault();
  killBackend().then(() => app.quit());
});
