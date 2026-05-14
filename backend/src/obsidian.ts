// Integración con Obsidian — escribe sesiones de agentes y lee contexto
// del proyecto (MOC, última sesión, ADRs) directamente del filesystem,
// equivalente funcional a `@bitbonsai/mcpvault` pero sin overhead MCP.
//
// El vault se asume estructurado PARA-lite:
//   10 - Projects/<repo>/_MOC.md          — índice maestro del proyecto
//   10 - Projects/<repo>/Sessions/        — sesiones de Claude Code
//   10 - Projects/<repo>/Decisions/       — ADRs
//   10 - Projects/<repo>/Notes/           — referencia técnica
//
// Config persistida en `~/.eco/obsidian.json` (chmod 600).

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, chmodSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(homedir(), '.eco', 'obsidian.json');

export type ObsidianMode = 'builtin' | 'custom';

export type ObsidianConfig = {
  enabled: boolean;
  vaultPath: string;
  /**
   * Modo de guardado:
   *  - 'builtin' (default): Eco escribe directo al vault con estructura
   *    PARA-lite (10 - Projects/<repo>/Sessions/...).
   *  - 'custom': Eco corre `customCommand` y pipea el markdown de la
   *    sesión por stdin. Útil para usar tu propio skill global (ej.
   *    `claude -p "/kb"` que invoca el skill /kb configurado en
   *    ~/.claude/commands/kb.md).
   */
  mode: ObsidianMode;
  /** Comando shell a ejecutar cuando mode='custom'. Ejecuta con shell
   *  habilitado y CWD = workspace de la burbuja. La sesión se pasa por
   *  stdin como markdown. */
  customCommand: string;
};

export function readConfig(): ObsidianConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Partial<ObsidianConfig>;
      return {
        enabled: !!raw.enabled,
        vaultPath: typeof raw.vaultPath === 'string' ? raw.vaultPath : '',
        mode: raw.mode === 'custom' ? 'custom' : 'builtin',
        customCommand: typeof raw.customCommand === 'string' ? raw.customCommand : '',
      };
    }
  } catch { /* noop */ }
  return { enabled: false, vaultPath: '', mode: 'builtin', customCommand: '' };
}

export function saveConfig(cfg: ObsidianConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try { chmodSync(CONFIG_PATH, 0o600); } catch { /* noop */ }
}

export type ObsidianStatus = {
  configured: boolean;       // hay config con vaultPath
  enabled: boolean;          // toggle on
  vaultPath: string;
  vaultExists: boolean;      // el path existe en disco
  hasParaStructure: boolean; // existe `10 - Projects/`
  noteCount: number;         // .md files en el vault (preview de tamaño)
  mode: ObsidianMode;
  customCommand: string;
};

export function status(): ObsidianStatus {
  const cfg = readConfig();
  const out: ObsidianStatus = {
    configured: !!cfg.vaultPath || (cfg.mode === 'custom' && !!cfg.customCommand),
    enabled: cfg.enabled,
    vaultPath: cfg.vaultPath,
    vaultExists: false,
    hasParaStructure: false,
    noteCount: 0,
    mode: cfg.mode,
    customCommand: cfg.customCommand,
  };
  if (!cfg.vaultPath) return out;
  try {
    const s = statSync(cfg.vaultPath);
    out.vaultExists = s.isDirectory();
  } catch { out.vaultExists = false; }
  if (!out.vaultExists) return out;
  try {
    out.hasParaStructure = existsSync(join(cfg.vaultPath, '10 - Projects'));
  } catch { /* noop */ }
  try {
    out.noteCount = countMarkdown(cfg.vaultPath, 0, 600);
  } catch { /* noop */ }
  return out;
}

// ─────────────────────────── Detectar vaults instalados
// Obsidian guarda la lista de vaults conocidos en su config:
//   mac:   ~/Library/Application Support/obsidian/obsidian.json
//   linux: ~/.config/obsidian/obsidian.json
//   win:   %APPDATA%/obsidian/obsidian.json
//
// El formato es: { vaults: { "<id>": { path, ts, open?, ... } } }
export type DetectedVault = { id: string; path: string; name: string; lastOpened: number; open: boolean };

export function detectInstalledVaults(): DetectedVault[] {
  const candidates = [
    join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json'),
    join(homedir(), '.config', 'obsidian', 'obsidian.json'),
    process.env.APPDATA ? join(process.env.APPDATA, 'obsidian', 'obsidian.json') : '',
  ].filter(Boolean);

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      const vaults = raw?.vaults;
      if (!vaults || typeof vaults !== 'object') continue;
      const out: DetectedVault[] = [];
      for (const [id, v] of Object.entries(vaults as Record<string, unknown>)) {
        const vv = v as { path?: string; ts?: number; open?: boolean };
        if (!vv.path || typeof vv.path !== 'string') continue;
        if (!existsSync(vv.path)) continue;
        out.push({
          id,
          path: vv.path,
          name: basename(vv.path),
          lastOpened: typeof vv.ts === 'number' ? vv.ts : 0,
          open: !!vv.open,
        });
      }
      // Más recientes primero.
      out.sort((a, b) => b.lastOpened - a.lastOpened);
      return out;
    } catch { /* siguiente candidato */ }
  }
  return [];
}

function countMarkdown(dir: string, current: number, max: number): number {
  if (current >= max) return current;
  let count = current;
  for (const entry of readdirSync(dir)) {
    if (count >= max) break;
    if (entry.startsWith('.')) continue;
    const p = join(dir, entry);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      count = countMarkdown(p, count, max);
    } else if (entry.toLowerCase().endsWith('.md')) {
      count += 1;
    }
  }
  return count;
}

// ─────────────────────────── Project name detection
// Dado un workspace path, devuelve el "repo name" que usamos como subcarpeta
// dentro del vault (ej: ~/Documents/GitHub/aditum-jh → "aditum-jh").
function projectFolderName(workspace: string): string {
  return basename(workspace.replace(/\/$/, ''));
}

// ─────────────────────────── Contexto auto-cargado
// Lee MOC + última sesión + ADR reciente del proyecto para inyectar al
// system prompt de Claude o mostrar en el UI.
export function loadProjectContext(workspace: string): string {
  const cfg = readConfig();
  if (!cfg.enabled || !cfg.vaultPath) return '';
  if (!workspace) return '';

  const repo = projectFolderName(workspace);
  const projectDir = join(cfg.vaultPath, '10 - Projects', repo);
  if (!existsSync(projectDir)) return '';

  const parts: string[] = [];

  // 1) MOC del proyecto (índice maestro).
  const mocPath = join(projectDir, '_MOC.md');
  if (existsSync(mocPath)) {
    try {
      const moc = readFileSync(mocPath, 'utf-8').trim();
      if (moc) parts.push(`# MOC del proyecto (${repo})\n\n${truncate(moc, 4000)}`);
    } catch { /* noop */ }
  }

  // 2) Última sesión (Sessions/).
  const sessionsDir = join(projectDir, 'Sessions');
  if (existsSync(sessionsDir)) {
    const latest = latestMarkdown(sessionsDir);
    if (latest) {
      try {
        const body = readFileSync(latest, 'utf-8').trim();
        if (body) parts.push(`# Última sesión (${basename(latest)})\n\n${truncate(body, 3000)}`);
      } catch { /* noop */ }
    }
  }

  // 3) Último ADR (Decisions/).
  const decisionsDir = join(projectDir, 'Decisions');
  if (existsSync(decisionsDir)) {
    const latest = latestMarkdown(decisionsDir);
    if (latest) {
      try {
        const body = readFileSync(latest, 'utf-8').trim();
        if (body) parts.push(`# ADR reciente (${basename(latest)})\n\n${truncate(body, 2000)}`);
      } catch { /* noop */ }
    }
  }

  return parts.join('\n\n---\n\n');
}

function latestMarkdown(dir: string): string | null {
  try {
    const entries = readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith('.md'))
      .map((n) => {
        const p = join(dir, n);
        try { return { path: p, mtime: statSync(p).mtimeMs }; } catch { return null; }
      })
      .filter((x): x is { path: string; mtime: number } => x !== null)
      .sort((a, b) => b.mtime - a.mtime);
    return entries[0]?.path ?? null;
  } catch { return null; }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 12) + '\n\n…(truncado)';
}

// ─────────────────────────── Guardar sesión
export type SessionToSave = {
  title: string;
  workspace: string;
  bubbleId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; text: string; createdAt: number }>;
  createdAt: number;
  updatedAt: number;
};

export type SaveSessionResult = { ok: true; path: string } | { ok: false; error: string };

export function saveSession(session: SessionToSave): SaveSessionResult {
  const cfg = readConfig();
  if (!cfg.enabled) return { ok: false, error: 'Obsidian no está activado' };

  const body = renderSessionMarkdown(session);

  // Modo custom: spawn comando con la sesión por stdin. El user controla
  // el comando (ej: `claude -p "/kb"` para usar su skill global).
  if (cfg.mode === 'custom') {
    if (!cfg.customCommand.trim()) return { ok: false, error: 'Comando custom vacío' };
    return runCustomCommand(cfg.customCommand, body, session.workspace);
  }

  // Modo builtin: escritura directa al vault con estructura PARA-lite.
  if (!cfg.vaultPath) return { ok: false, error: 'Vault path no configurado' };
  if (!existsSync(cfg.vaultPath)) return { ok: false, error: 'Vault path no existe' };

  const repo = projectFolderName(session.workspace || homedir());
  const projectDir = join(cfg.vaultPath, '10 - Projects', repo);
  const sessionsDir = join(projectDir, 'Sessions');

  try {
    if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true });
  } catch (e) {
    return { ok: false, error: `No pude crear ${sessionsDir}: ${(e as Error).message}` };
  }

  const date = new Date(session.createdAt || Date.now());
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const dateStamp = `${yyyy}-${mm}-${dd}`;
  const fileBase = sanitizeFilename(`${dateStamp} ${hh}-${mi} ${session.title || 'Sesión'}`);
  const filePath = join(sessionsDir, `${fileBase}.md`);

  try {
    writeFileSync(filePath, body, 'utf-8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: `Error escribiendo nota: ${(e as Error).message}` };
  }
}

// Spawn shell command con `cwd` = workspace y pipea la sesión markdown
// por stdin. Timeout 60s. Devuelve la última línea del stdout como `path`
// (útil si el script reporta el path del archivo creado), o un mensaje
// genérico si no.
function runCustomCommand(command: string, stdin: string, workspace: string): SaveSessionResult {
  // Spawn sincrónico no existe en node sin spawnSync; lo hacemos sync
  // adoptando spawnSync para mantener la firma sync de saveSession.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  const cwd = workspace && existsSync(workspace) ? workspace : homedir();
  const r = spawnSync(command, {
    cwd,
    input: stdin,
    shell: true,
    timeout: 60_000,
    encoding: 'utf-8',
  });
  if (r.error) return { ok: false, error: r.error.message };
  if (r.status !== 0) {
    const errOut = (r.stderr || r.stdout || '').trim().slice(0, 600);
    return { ok: false, error: errOut || `Comando salió con código ${r.status}` };
  }
  const out = (r.stdout || '').trim();
  const lastLine = out.split('\n').filter(Boolean).pop() || 'Comando ejecutado';
  return { ok: true, path: lastLine };
}

// Silenciamos el `import spawn` ya que usamos spawnSync via require.
void spawn;

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function renderSessionMarkdown(s: SessionToSave): string {
  const created = new Date(s.createdAt).toISOString();
  const updated = new Date(s.updatedAt).toISOString();
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: ${jsonString(s.title)}`);
  lines.push(`type: session`);
  lines.push(`source: eco`);
  lines.push(`workspace: ${jsonString(s.workspace)}`);
  lines.push(`bubble_id: ${jsonString(s.bubbleId)}`);
  lines.push(`created: ${created}`);
  lines.push(`updated: ${updated}`);
  lines.push(`message_count: ${s.messages.length}`);
  lines.push('---');
  lines.push('');

  lines.push(`# ${s.title || 'Sesión'}`);
  lines.push('');
  lines.push(`> Sesión de Eco · workspace \`${s.workspace || '—'}\` · ${s.messages.length} mensajes`);
  lines.push('');

  // Mensajes
  lines.push('## Conversación');
  lines.push('');
  for (const m of s.messages) {
    const who = m.role === 'user' ? '**Tú**'
      : m.role === 'assistant' ? '**Claude**'
      : m.role === 'tool' ? '*tool*'
      : '*system*';
    const when = new Date(m.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    lines.push(`### ${who} · ${when}`);
    lines.push('');
    lines.push(m.text.trim() || '*(sin contenido)*');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Próximos pasos');
  lines.push('');
  lines.push('- _(completar después)_');
  lines.push('');

  return lines.join('\n');
}

function jsonString(s: string): string {
  // YAML frontmatter — encerramos en comillas dobles y escapamos.
  return `"${(s || '').replace(/"/g, '\\"')}"`;
}
