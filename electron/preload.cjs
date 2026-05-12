// Preload: expone una API mínima al renderer (contextIsolation: true).
// El renderer puede leer el token + backend URL desde acá en lugar de
// depender de env vars de Vite (que solo existen en dev).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('eco:get-config'),
  // Log que llega al stdout del main process — útil para debug del renderer
  // cuando no podemos abrir DevTools.
  log: (...args) => ipcRenderer.send('eco:renderer-log', args),
});
