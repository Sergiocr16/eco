// Preload: expone una API mínima al renderer (contextIsolation: true).
// El renderer puede leer el token + backend URL desde acá en lugar de
// depender de env vars de Vite (que solo existen en dev).
const { contextBridge, ipcRenderer } = require('electron');

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
});
