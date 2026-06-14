// Auto-backup: chequea periódicamente si pasaron ≥ 2h desde el último backup.
// Si sí, snapshot + zip + write al folder configurado. Borra los más viejos
// según la política de retención (rolling, default 30). Solo corre para el
// admin — el backup vive en la máquina anfitriona y respalda a TODOS los
// usuarios (~/.eco/users/**).
//
// La fuente de verdad de la config es `~/.eco/backup.json` (vía /backup/config).
// Esta es la única zona donde el renderer hace este tipo de scheduling — la
// alternativa (cron del SO) requeriría que el backend pudiera leer localStorage,
// que no puede.

import { useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import {
  collectLocalStorage, buildBackupZip, backupFilename,
  getElectronBackupAPI, u8ToBase64,
  BACKUP_FILE_REGEX,
  type BackupBundle, type BackupMetadata, type WorktreeState,
} from '@/lib/backup';

type BackupConfig = {
  enabled: boolean;
  folder?: string;
  retention: number;
  lastBackup?: number;
  lastError?: string;
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * ONE_HOUR_MS;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // chequea cada 30 min
// Delay inicial al mount — no queremos disparar el chequeo apenas abre la app.
const INITIAL_DELAY_MS = 30_000;

export function useBackupScheduler(role: 'admin' | 'member' | null = null) {
  const runningRef = useRef(false);

  useEffect(() => {
    // Solo el admin corre el auto-backup (respalda a todos en la anfitriona).
    if (role !== 'admin') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) {
        // Pausa con pestaña hidden — re-chequeamos en el próximo intervalo.
        scheduleNext();
        return;
      }
      try {
        const r = await apiFetch('/backup/config');
        const cfg = await r.json() as BackupConfig;
        if (cancelled) return;
        const last = cfg.lastBackup ?? 0;
        const needsBackup = cfg.enabled && cfg.folder && (Date.now() - last >= TWO_HOURS_MS);
        if (needsBackup && !runningRef.current) {
          runningRef.current = true;
          try { await runAutoBackup(cfg); }
          finally { runningRef.current = false; }
        }
      } catch { /* silenciar — re-intenta al próximo tick */ }
      scheduleNext();
    };

    const scheduleNext = () => {
      if (cancelled) return;
      timer = setTimeout(() => { void tick(); }, CHECK_INTERVAL_MS);
    };

    // Primer chequeo después de INITIAL_DELAY_MS.
    timer = setTimeout(() => { void tick(); }, INITIAL_DELAY_MS);

    // Re-chequear cuando la pestaña vuelve a ser visible (caso típico:
    // la dejaste hidden días y volvés — querés que dispare ASAP).
    const onVis = () => {
      if (!document.hidden && !runningRef.current) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void tick(); }, 5_000);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [role]);
}

async function runAutoBackup(cfg: BackupConfig): Promise<void> {
  const api = getElectronBackupAPI();
  if (!api?.writeBinaryFile || !cfg.folder) return;

  try {
    const bubbleIds = collectBubbleIdsFromLocalStorage();
    const r = await apiFetch('/backup/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bubbleIds }),
    });
    const snap = await r.json() as {
      ok: boolean;
      eco?: Record<string, string>;
      worktrees?: WorktreeState[];
      error?: string;
    };
    if (!snap.ok) throw new Error(snap.error || 'snapshot failed');

    const metadata: BackupMetadata = {
      version: 1,
      exportedAt: new Date().toISOString(),
      localStorage: collectLocalStorage(),
      eco: snap.eco ?? {},
    };
    const bundle: BackupBundle = { metadata, worktrees: snap.worktrees ?? [] };
    const zipBytes = await buildBackupZip(bundle);

    const filename = backupFilename();
    const fullPath = joinPath(cfg.folder, filename);
    const w = await api.writeBinaryFile({ path: fullPath, base64: u8ToBase64(zipBytes) });
    if (!w.ok) throw new Error(w.error || 'write failed');

    // Limpieza de backups viejos (rolling retention).
    await pruneOldBackups(cfg.folder, cfg.retention);

    await apiFetch('/backup/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cfg, lastBackup: Date.now(), lastError: undefined }),
    });
  } catch (e) {
    // Persistimos el error en config para que el user lo vea en Settings.
    try {
      await apiFetch('/backup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cfg,
          lastError: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
        }),
      });
    } catch { /* noop */ }
  }
}

async function pruneOldBackups(folder: string, retention: number): Promise<void> {
  const api = getElectronBackupAPI();
  if (!api?.listDir || !api?.deleteFile) return;
  const list = await api.listDir({ dir: folder });
  if (!list.ok || !list.entries) return;
  const backups = list.entries
    .filter((e) => BACKUP_FILE_REGEX.test(e.name))
    .sort((a, b) => b.mtime - a.mtime); // descendente — más nuevos primero
  const toDelete = backups.slice(retention);
  for (const f of toDelete) {
    try { await api.deleteFile({ path: f.path }); } catch { /* noop */ }
  }
}

function collectBubbleIdsFromLocalStorage(): string[] {
  try {
    const raw = window.localStorage.getItem('eco.bubbles');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((b: { id?: string }) => b?.id).filter((id): id is string => typeof id === 'string');
  } catch { return []; }
}

function joinPath(folder: string, filename: string): string {
  if (folder.endsWith('/')) return folder + filename;
  return folder + '/' + filename;
}
