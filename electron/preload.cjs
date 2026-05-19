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
  // Suscripción al estado fullscreen del BrowserWindow. Devuelve una función
  // que cancela la suscripción. El callback se invoca con un bool tras cada
  // cambio (incluye el estado inicial al did-finish-load).
  onFullscreenChange: (cb) => {
    const handler = (_e, isFull) => { try { cb(!!isFull); } catch { /* noop */ } };
    ipcRenderer.on('eco:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('eco:fullscreen-changed', handler);
  },
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
