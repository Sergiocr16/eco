// Open in external IDE — usa URI schemes que VSCode/IntelliJ/Cursor/WebStorm
// registran al instalarse. Sergio elige cuál usar desde Settings; el botón
// del FileEditor abre el archivo en la línea exacta del cursor.
//
// Tradeoffs: no podemos detectar si el URI realmente abrió el IDE (los URI
// schemes son fire-and-forget en browser/Electron). Si nada se abre, es
// porque el IDE no está instalado o el OS no tiene el handler registrado.

export type ExternalIde = 'auto' | 'vscode' | 'intellij' | 'webstorm' | 'cursor' | 'none';

const LS_KEY = 'eco.editor.external';

export function getExternalIde(): ExternalIde {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'vscode' || v === 'intellij' || v === 'webstorm' || v === 'cursor' || v === 'none') return v;
    return 'auto';
  } catch { return 'auto'; }
}

export function setExternalIde(ide: ExternalIde): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, ide); } catch { /* noop */ }
}

export function buildIdeUri(
  ide: Exclude<ExternalIde, 'none'>,
  absPath: string,
  line: number,
  column = 1,
): string {
  switch (ide) {
    case 'vscode':
      return `vscode://file/${absPath}:${line}:${column}`;
    case 'cursor':
      return `cursor://file/${absPath}:${line}:${column}`;
    case 'intellij':
    case 'webstorm':
      // IntelliJ family acepta `idea://` con query params.
      return `idea://open?file=${encodeURIComponent(absPath)}&line=${line}`;
    case 'auto':
      // Auto = VSCode primero (el más común). Si el user usa otro IDE,
      // que elija el específico en Settings.
      return `vscode://file/${absPath}:${line}:${column}`;
  }
}

export function ideDisplayLabel(ide: ExternalIde): string {
  switch (ide) {
    case 'vscode': return 'VSCode';
    case 'intellij': return 'IntelliJ IDEA';
    case 'webstorm': return 'WebStorm';
    case 'cursor': return 'Cursor';
    case 'auto': return 'Auto (VSCode)';
    case 'none': return 'Ninguno';
  }
}

// Resuelve un path relativo al workspace en absoluto (para el URI).
// Si ya es absoluto, lo devuelve tal cual.
export function resolveAbsPath(workspace: string, filePath: string): string {
  if (filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath)) return filePath;
  const ws = workspace.endsWith('/') ? workspace.slice(0, -1) : workspace;
  return `${ws}/${filePath}`;
}

type ElectronAPI = { openExternal?: (url: string) => Promise<void> | void };

export async function openInIde(
  absPath: string,
  line: number,
  column = 1,
): Promise<{ ok: boolean; ide: ExternalIde; uri?: string }> {
  const ide = getExternalIde();
  if (ide === 'none') return { ok: false, ide };
  const uri = buildIdeUri(ide as Exclude<ExternalIde, 'none'>, absPath, line, column);
  // Electron: invoca shell.openExternal vía el preload IPC.
  const electronAPI = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
  if (electronAPI?.openExternal) {
    try {
      await electronAPI.openExternal(uri);
      return { ok: true, ide, uri };
    } catch {
      return { ok: false, ide, uri };
    }
  }
  // Browser fallback — el OS dispara el handler de protocolo si está registrado.
  try {
    window.open(uri, '_blank');
    return { ok: true, ide, uri };
  } catch {
    return { ok: false, ide, uri };
  }
}
