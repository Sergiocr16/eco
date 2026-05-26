// Backup & restore del estado de Eco.
//
// Dos zonas de estado se preservan:
//   1. Archivos JSON en ~/.eco/* (configs, auth, github PAT, etc.)
//   2. Por cada bubble con worktree: branch, HEAD sha, y `git diff HEAD` para
//      preservar cambios sin commitear.
//
// El localStorage de la app (donde vive `eco.bubbles` con todos los agentes y
// mensajes) NO lo lee el backend — vive en el renderer. El frontend lo agrega
// al zip al exportar y lo restaura directo en el renderer al importar.
//
// Lo que NO se incluye:
//   - ~/.eco/token: regenerable, security risk si el zip se filtra.
//   - Archivos untracked de worktrees: out of scope v1.
//   - ~/.claude/projects/*: sesiones de Claude CLI, viven fuera de Eco.

import {
  existsSync, readFileSync, writeFileSync, chmodSync,
  mkdirSync, unlinkSync, statSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ECO_DIR = join(homedir(), '.eco');
const BACKUP_CONFIG_PATH = join(ECO_DIR, 'backup.json');
const WORKTREES_DIR = join(ECO_DIR, 'worktrees');

// Archivos que se backupean del directorio ~/.eco/. Se leen y restauran como
// texto raw — preserva schema exacto sin tener que modelar cada formato.
// `api-key` es texto plano (no JSON); los demás son JSON con sus schemas.
const BACKED_UP_FILES = [
  'user.json',
  'github.json',
  'obsidian.json',
  'workspaces.json',
  'dev-sessions.json',
  'api-key',
] as const;

export type EcoFileName = typeof BACKED_UP_FILES[number];
export type EcoSnapshot = Partial<Record<EcoFileName, string>>;

export function snapshotEcoState(): EcoSnapshot {
  const out: EcoSnapshot = {};
  for (const name of BACKED_UP_FILES) {
    const p = join(ECO_DIR, name);
    if (!existsSync(p)) continue;
    try { out[name] = readFileSync(p, 'utf-8'); } catch { /* skip */ }
  }
  return out;
}

export type RestoreEcoResult = { restored: EcoFileName[]; errors: string[] };

export function restoreEcoState(snap: EcoSnapshot): RestoreEcoResult {
  if (!existsSync(ECO_DIR)) mkdirSync(ECO_DIR, { recursive: true, mode: 0o700 });
  const restored: EcoFileName[] = [];
  const errors: string[] = [];
  for (const name of BACKED_UP_FILES) {
    const content = snap[name];
    if (typeof content !== 'string') continue;
    const p = join(ECO_DIR, name);
    try {
      writeFileSync(p, content, { mode: 0o600 });
      try { chmodSync(p, 0o600); } catch { /* noop */ }
      restored.push(name);
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { restored, errors };
}

// ─── Worktree states ──────────────────────────────────────────────────────

export type WorktreeState = {
  bubbleId: string;
  branch?: string;
  sha?: string;
  diff?: string;
  missing?: boolean;
};

function gitCapture(cwd: string, args: string[], timeoutMs = 5000): { ok: boolean; out: string; err: string } {
  try {
    const r = spawnSync('git', ['-C', cwd, ...args], { timeout: timeoutMs, encoding: 'utf-8' });
    return {
      ok: r.status === 0,
      out: (r.stdout ?? '').toString(),
      err: (r.stderr ?? '').toString(),
    };
  } catch { return { ok: false, out: '', err: 'spawn error' }; }
}

export function collectWorktreeStates(bubbleIds: string[]): WorktreeState[] {
  const out: WorktreeState[] = [];
  if (!existsSync(WORKTREES_DIR)) return out;
  for (const id of bubbleIds) {
    const wt = join(WORKTREES_DIR, id);
    if (!existsSync(wt)) { out.push({ bubbleId: id, missing: true }); continue; }
    const branch = gitCapture(wt, ['rev-parse', '--abbrev-ref', 'HEAD']).out.trim();
    const sha = gitCapture(wt, ['rev-parse', 'HEAD']).out.trim();
    // `git diff HEAD --binary` captura cambios sin commitear incluyendo binarios.
    // Timeout amplio: repos grandes con muchos cambios pueden tardar.
    const diff = gitCapture(wt, ['diff', 'HEAD', '--binary'], 15_000).out;
    out.push({ bubbleId: id, branch, sha, diff });
  }
  return out;
}

export type ApplyResult = { bubbleId: string; ok: boolean; warning?: string };

/**
 * Aplica los diffs guardados sobre los worktrees existentes. Si un worktree
 * no existe (porque se borró el ~/.eco/worktrees/<id>), reporta warning para
 * que el user lo recree manualmente — recrear automáticamente requiere conocer
 * el repo padre, que solo está en la metadata del bubble (localStorage).
 */
export function applyWorktreeStates(states: WorktreeState[]): ApplyResult[] {
  const results: ApplyResult[] = [];
  for (const s of states) {
    if (s.missing || !s.diff || !s.diff.trim()) {
      results.push({ bubbleId: s.bubbleId, ok: true });
      continue;
    }
    const wt = join(WORKTREES_DIR, s.bubbleId);
    if (!existsSync(wt)) {
      results.push({
        bubbleId: s.bubbleId, ok: false,
        warning: `Worktree no existe en ${wt}. Recreá con \`git worktree add\` desde el repo padre y reintentá.`,
      });
      continue;
    }
    const tmpFile = join(homedir(), `.eco-tmp-diff-${s.bubbleId.replace(/[^a-zA-Z0-9_-]/g, '_')}.patch`);
    try {
      writeFileSync(tmpFile, s.diff, 'utf-8');
      const check = spawnSync('git', ['-C', wt, 'apply', '--check', tmpFile], { encoding: 'utf-8', timeout: 10_000 });
      if (check.status !== 0) {
        results.push({
          bubbleId: s.bubbleId, ok: false,
          warning: `Conflicto al aplicar diff: ${(check.stderr ?? '').toString().slice(0, 240)}`,
        });
        continue;
      }
      const apply = spawnSync('git', ['-C', wt, 'apply', tmpFile], { encoding: 'utf-8', timeout: 10_000 });
      if (apply.status !== 0) {
        results.push({
          bubbleId: s.bubbleId, ok: false,
          warning: `git apply falló: ${(apply.stderr ?? '').toString().slice(0, 240)}`,
        });
      } else {
        results.push({ bubbleId: s.bubbleId, ok: true });
      }
    } catch (e) {
      results.push({
        bubbleId: s.bubbleId, ok: false,
        warning: e instanceof Error ? e.message : String(e),
      });
    } finally {
      try { unlinkSync(tmpFile); } catch { /* noop */ }
    }
  }
  return results;
}

// ─── Backup config (~/.eco/backup.json) ───────────────────────────────────

export type BackupConfig = {
  enabled: boolean;
  folder?: string;
  retention: number;     // cuántos backups mantener (rolling). default 7.
  lastBackup?: number;   // ms timestamp
  lastError?: string;
};

const DEFAULT_CONFIG: BackupConfig = { enabled: false, retention: 7 };

export function readBackupConfig(): BackupConfig {
  if (!existsSync(BACKUP_CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    if ((statSync(BACKUP_CONFIG_PATH).mode & 0o777) !== 0o600) chmodSync(BACKUP_CONFIG_PATH, 0o600);
    const raw = readFileSync(BACKUP_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      folder: typeof parsed.folder === 'string' ? parsed.folder : undefined,
      retention: typeof parsed.retention === 'number' && parsed.retention > 0 && parsed.retention <= 365
        ? Math.floor(parsed.retention) : 7,
      lastBackup: typeof parsed.lastBackup === 'number' ? parsed.lastBackup : undefined,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : undefined,
    };
  } catch { return { ...DEFAULT_CONFIG }; }
}

export function writeBackupConfig(cfg: BackupConfig): void {
  if (!existsSync(ECO_DIR)) mkdirSync(ECO_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(BACKUP_CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try { chmodSync(BACKUP_CONFIG_PATH, 0o600); } catch { /* noop */ }
}

export function resetBackupConfig(): void {
  try { unlinkSync(BACKUP_CONFIG_PATH); } catch { /* noop */ }
}

// ─── Util: lista de bubbleIds conocidos por el backend (de worktrees) ─────
// Hacemos best-effort listando directorios bajo ~/.eco/worktrees/. El frontend
// también puede pasar la lista derivada de `eco.bubbles`, pero darle un default
// hace que `GET /backup/snapshot` sin ids funcione standalone.

export function listKnownBubbleIds(): string[] {
  if (!existsSync(WORKTREES_DIR)) return [];
  try {
    return readdirSync(WORKTREES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch { return []; }
}
