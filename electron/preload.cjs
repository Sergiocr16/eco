// Preload: expone una API mínima al renderer (contextIsolation: true).
// El renderer puede leer el token + backend URL desde acá en lugar de
// depender de env vars de Vite (que solo existen en dev).
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('eco:get-config'),
  // Log que llega al stdout del main process — útil para debug del renderer
  // cuando no podemos abrir DevTools.
  log: (...args) => ipcRenderer.send('eco:renderer-log', args),
  // Folder picker nativo del OS.
  pickFolder: (opts) => ipcRenderer.invoke('eco:pick-folder', opts),
  // Save/Open dialogs nativos + read/write de archivos binarios fuera de
  // ~/.eco (para el backup zip que el user elige guardar/cargar).
  saveDialog: (opts) => ipcRenderer.invoke('eco:save-dialog', opts),
  openDialog: (opts) => ipcRenderer.invoke('eco:open-dialog', opts),
  writeBinaryFile: (opts) => ipcRenderer.invoke('eco:write-binary', opts),
  readBinaryFile: (opts) => ipcRenderer.invoke('eco:read-binary', opts),
  // Lista archivos de un directorio (solo nombres + mtime). Usado por el
  // backup scheduler para limpiar backups viejos (retention rolling).
  listDir: (opts) => ipcRenderer.invoke('eco:list-dir', opts),
  // Elimina un archivo por path absoluto. Mismo allowlist que write/read.
  deleteFile: (opts) => ipcRenderer.invoke('eco:delete-file', opts),
  // Suscripción al estado fullscreen del BrowserWindow. Devuelve una función
  // que cancela la suscripción. El callback se invoca con un bool tras cada
  // cambio (incluye el estado inicial al did-finish-load).
  onFullscreenChange: (cb) => {
    const handler = (_e, isFull) => { try { cb(!!isFull); } catch { /* noop */ } };
    ipcRenderer.on('eco:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('eco:fullscreen-changed', handler);
  },
  // Abre un URL/URI con el handler default del OS (shell.openExternal).
  // Sirve para http(s):// y también URI schemes custom como vscode://,
  // idea://, cursor:// — útil para el botón "Open in IDE" del FileEditor.
  openExternal: (url) => ipcRenderer.invoke('eco:open-external', url),
  // Notificación nativa de macOS via electron.Notification (funciona en
  // .dmg unsigned, a diferencia de la Web API). Click trae la app al frente
  // y dispara onNotificationClicked con el bubbleId.
  notify: (opts) => ipcRenderer.invoke('eco:notify', opts),
  onNotificationClicked: (cb) => {
    const handler = (_e, payload) => { try { cb(payload); } catch { /* noop */ } };
    ipcRenderer.on('eco:notification_clicked', handler);
    return () => ipcRenderer.removeListener('eco:notification_clicked', handler);
  },
  // Zoom de toda la UI de ESTA ventana (webFrame.setZoomFactor opera sobre el
  // frame del renderer actual). En Electron 11+ el zoom es por-webContents, así
  // que cada ventana escala independiente — la principal y cada satélite de otro
  // monitor mantienen su propio factor. 1 = 100%.
  setZoomFactor: (factor) => { try { webFrame.setZoomFactor(factor); return true; } catch { return false; } },
  getZoomFactor: () => { try { return webFrame.getZoomFactor(); } catch { return 1; } },
  // El menú Vista (Cmd +/−/0) emite 'in' | 'out' | 'reset' a ESTA ventana.
  // Devuelve una función para desuscribirse.
  onZoom: (cb) => {
    const handler = (_e, dir) => { try { cb(dir); } catch { /* noop */ } };
    ipcRenderer.on('eco:zoom', handler);
    return () => ipcRenderer.removeListener('eco:zoom', handler);
  },
  // Etiquetas traducidas del menú nativo (siguen el idioma de la app).
  setMenuLabels: (labels) => ipcRenderer.invoke('eco:set-menu-labels', labels),
  // Abre (o enfoca) un bubble en una ventana aparte — para tirarlo a otro
  // monitor y trabajarlo solo. Devuelve {ok, existing}.
  openBubbleWindow: (bubbleId) => ipcRenderer.invoke('eco:open-bubble-window', bubbleId),
  closeBubbleWindow: (bubbleId) => ipcRenderer.invoke('eco:close-bubble-window', bubbleId),
  // Lista los bubbleIds actualmente abiertos en ventana aparte. La ventana
  // principal lo consulta al montar para reconstruir su estado "detached".
  listBubbleWindows: () => ipcRenderer.invoke('eco:list-bubble-windows'),
  // Notifica a la ventana principal cuando una ventana de bubble se abre o
  // cierra. Devuelve una función para desuscribirse.
  onBubbleWindowChange: (cb) => {
    const onOpen = (_e, payload) => { try { cb({ ...payload, open: true }); } catch { /* noop */ } };
    const onClose = (_e, payload) => { try { cb({ ...payload, open: false }); } catch { /* noop */ } };
    ipcRenderer.on('eco:bubble-window-opened', onOpen);
    ipcRenderer.on('eco:bubble-window-closed', onClose);
    return () => {
      ipcRenderer.removeListener('eco:bubble-window-opened', onOpen);
      ipcRenderer.removeListener('eco:bubble-window-closed', onClose);
    };
  },
  // Auto-update (electron-updater). checkForUpdates dispara el chequeo manual;
  // installAndRestart aplica la versión ya descargada y reinicia. Los on* son
  // suscripciones al ciclo de vida del update (cada uno devuelve unsubscribe).
  checkForUpdates: () => ipcRenderer.invoke('eco:check-updates'),
  installAndRestart: () => ipcRenderer.invoke('eco:install-update'),
  onUpdateAvailable: (cb) => {
    const handler = (_e, payload) => { try { cb(payload); } catch { /* noop */ } };
    ipcRenderer.on('eco:update-available', handler);
    return () => ipcRenderer.removeListener('eco:update-available', handler);
  },
  onUpdateProgress: (cb) => {
    const handler = (_e, payload) => { try { cb(payload); } catch { /* noop */ } };
    ipcRenderer.on('eco:update-progress', handler);
    return () => ipcRenderer.removeListener('eco:update-progress', handler);
  },
  onUpdateReady: (cb) => {
    const handler = (_e, payload) => { try { cb(payload); } catch { /* noop */ } };
    ipcRenderer.on('eco:update-ready', handler);
    return () => ipcRenderer.removeListener('eco:update-ready', handler);
  },
  onUpdateError: (cb) => {
    const handler = (_e, payload) => { try { cb(payload); } catch { /* noop */ } };
    ipcRenderer.on('eco:update-error', handler);
    return () => ipcRenderer.removeListener('eco:update-error', handler);
  },
});
