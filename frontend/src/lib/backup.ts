// Backup utilities — armar y parsear el zip de backup en el renderer.
//
// Zonas que se backupean:
//   1. localStorage del renderer (todas las claves `eco.*` — donde vive
//      `eco.bubbles` con todos los agentes, mensajes, configs por bubble).
//   2. ~/.eco/*.json + api-key (el backend lo expone vía /backup/snapshot).
//   3. Por bubble con worktree: branch, HEAD sha, y `git diff HEAD --binary`.
//
// El formato es un zip con:
//   metadata.json   — { version, exportedAt, localStorage, eco }
//   version.txt     — "1"
//   worktrees/<id>/HEAD.txt
//   worktrees/<id>/diff.patch

import { zip as fflateZip, unzip as fflateUnzip, strToU8, strFromU8 } from 'fflate';

export type EcoSnapshot = Record<string, string>;
export type WorktreeState = {
  bubbleId: string;
  branch?: string;
  sha?: string;
  diff?: string;
  missing?: boolean;
};
export type BackupMetadata = {
  version: 1;
  exportedAt: string;       // ISO timestamp
  appVersion?: string;
  localStorage: Record<string, string>;
  eco: EcoSnapshot;
};
export type BackupBundle = {
  metadata: BackupMetadata;
  worktrees: WorktreeState[];
};

// ─── localStorage helpers ─────────────────────────────────────────────────

// Claves que NO se restauran aunque estén en el backup. `eco.session` es el
// token de sesión runtime — restaurarlo en otra instalación no sirve (el
// backend no conoce esa sesión). Se preserva la actual.
const NON_RESTORABLE_KEYS = new Set<string>(['eco.session']);

export function collectLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith('eco.')) continue;
    const val = window.localStorage.getItem(key);
    if (val == null) continue;
    out[key] = val;
  }
  return out;
}

export function restoreLocalStorage(data: Record<string, string>): { restored: number; skipped: number } {
  // Limpiamos primero todas las eco.* existentes EXCEPTO las no-restorables.
  // Sin esto, los restores quedarían mergeados con state stale (peor que
  // un reemplazo limpio).
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith('eco.') && !NON_RESTORABLE_KEYS.has(key)) toRemove.push(key);
  }
  for (const k of toRemove) window.localStorage.removeItem(k);

  let restored = 0;
  let skipped = 0;
  for (const [key, val] of Object.entries(data)) {
    if (!key.startsWith('eco.')) { skipped += 1; continue; }
    if (NON_RESTORABLE_KEYS.has(key)) { skipped += 1; continue; }
    try { window.localStorage.setItem(key, val); restored += 1; }
    catch { skipped += 1; }
  }
  return { restored, skipped };
}

// ─── Zip build / parse ────────────────────────────────────────────────────

export function buildBackupZip(bundle: BackupBundle): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const files: Record<string, Uint8Array> = {};
    files['version.txt'] = strToU8('1');
    files['metadata.json'] = strToU8(JSON.stringify(bundle.metadata, null, 2));
    for (const wt of bundle.worktrees) {
      const safeId = wt.bubbleId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const head = `${wt.branch ?? ''}\n${wt.sha ?? ''}\n`;
      files[`worktrees/${safeId}/HEAD.txt`] = strToU8(head);
      if (wt.diff && wt.diff.trim()) {
        files[`worktrees/${safeId}/diff.patch`] = strToU8(wt.diff);
      }
      if (wt.missing) {
        files[`worktrees/${safeId}/MISSING`] = strToU8('worktree no presente al hacer el backup');
      }
    }
    fflateZip(files, { level: 6 }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export function parseBackupZip(bytes: Uint8Array): Promise<BackupBundle> {
  return new Promise((resolve, reject) => {
    fflateUnzip(bytes, (err, files) => {
      if (err) { reject(err); return; }
      try {
        const versionBuf = files['version.txt'];
        if (!versionBuf) { reject(new Error('Archivo de backup inválido: falta version.txt')); return; }
        const version = strFromU8(versionBuf).trim();
        if (version !== '1') { reject(new Error(`Versión de backup no soportada: ${version}`)); return; }

        const metaBuf = files['metadata.json'];
        if (!metaBuf) { reject(new Error('Archivo de backup inválido: falta metadata.json')); return; }
        const metadata = JSON.parse(strFromU8(metaBuf)) as BackupMetadata;

        // Reconstruir worktree states del subdir worktrees/
        const byId = new Map<string, WorktreeState>();
        for (const path of Object.keys(files)) {
          const m = /^worktrees\/([^/]+)\/(HEAD\.txt|diff\.patch|MISSING)$/.exec(path);
          if (!m) continue;
          const [, id, kind] = m;
          const existing = byId.get(id) ?? { bubbleId: id };
          const text = strFromU8(files[path]);
          if (kind === 'HEAD.txt') {
            const [branch, sha] = text.split('\n');
            existing.branch = branch?.trim();
            existing.sha = sha?.trim();
          } else if (kind === 'diff.patch') {
            existing.diff = text;
          } else if (kind === 'MISSING') {
            existing.missing = true;
          }
          byId.set(id, existing);
        }
        resolve({ metadata, worktrees: Array.from(byId.values()) });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

// ─── Naming helpers ───────────────────────────────────────────────────────

export function backupFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `eco-backup-${y}-${m}-${d}-${hh}${mm}.zip`;
}

export const BACKUP_FILE_REGEX = /^eco-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/;

// ─── electronAPI typings ──────────────────────────────────────────────────
// Tipado de los métodos que main.cjs expone vía preload. Si Electron no está
// (browser dev), los métodos vuelven undefined y el caller cae a fallback.

export type ElectronBackupAPI = {
  saveDialog?: (opts: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; path: string }>;
  openDialog?: (opts: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; path: string }>;
  writeBinaryFile?: (opts: { path: string; base64: string }) => Promise<{ ok: boolean; error?: string }>;
  readBinaryFile?: (opts: { path: string }) => Promise<{ ok: boolean; base64?: string; error?: string }>;
  listDir?: (opts: { dir: string }) => Promise<{ ok: boolean; entries?: { name: string; path: string; mtime: number }[]; error?: string }>;
  deleteFile?: (opts: { path: string }) => Promise<{ ok: boolean; error?: string }>;
};

export function getElectronBackupAPI(): ElectronBackupAPI | null {
  const w = window as unknown as { electronAPI?: ElectronBackupAPI };
  return w.electronAPI ?? null;
}

export function u8ToBase64(bytes: Uint8Array): string {
  // En Electron 33+ Buffer está disponible en el renderer si nodeIntegration
  // estuviera on, pero NO está (contextIsolation). Usamos vanilla.
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
