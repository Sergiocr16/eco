// Drag & drop de archivos sobre la terminal: lo que hacen iTerm/Terminal.app,
// tipear la ruta del archivo. Claude Code detecta una ruta de imagen pegada y
// la adjunta como imagen; el resto de los CLIs reciben la ruta como texto.
import { apiFetch } from './api';

const IS_WIN_HOST = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

// Mismo escape que Terminal.app (backslash por carácter especial), que es el
// formato que Claude Code reconoce al soltar una imagen. En Windows, comillas.
export function quotePathForTerminal(p: string): string {
  if (IS_WIN_HOST) return /[\s&()^%!"]/.test(p) ? `"${p}"` : p;
  return p.replace(/([^A-Za-z0-9_\-.,:/@+=%~])/g, '\\$1');
}

async function uploadDroppedFile(file: File): Promise<string> {
  const res = await apiFetch('/terminal/drop', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Eco-Filename': encodeURIComponent(file.name),
    },
    body: file,
  });
  const data = await res.json().catch(() => null) as { ok?: boolean; path?: string; message?: string } | null;
  if (!res.ok || !data?.ok || !data.path) {
    throw new Error(data?.message ?? `HTTP ${res.status}`);
  }
  return data.path;
}

// En Electron el backend corre en la misma máquina, así que la ruta local del
// archivo sirve tal cual. En el navegador (remoto por la tailnet) el archivo
// vive en otro dispositivo: se sube al host y se usa la ruta de allá.
export async function resolveDroppedPaths(files: File[]): Promise<string[]> {
  const localPath = window.electronAPI?.getPathForFile;
  const paths: string[] = [];
  for (const file of files) {
    const local = localPath?.(file) ?? '';
    paths.push(local || await uploadDroppedFile(file));
  }
  return paths;
}

export function dragHasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}
