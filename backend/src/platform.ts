// Primitivas dependientes del SO, centralizadas para soportar macOS y Windows.
// Los bloqueadores Windows eran: shell hardcodeado a /bin/zsh|/bin/bash, `lsof`
// para puertos, y `process.kill(-pgid)` (process groups, inexistente en Win).

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_WIN = process.platform === 'win32';

/** Resuelve el path del CLI `claude` cross-platform.
 *  Prioridad: $CLAUDE_CLI_PATH → instalador nativo (~/.local/bin) → PATH.
 *  En Windows preferimos un ejecutable real (.exe) sobre los shims .cmd de
 *  npm: spawnear un .cmd requiere `shell:true`, que rompe el paso de args
 *  (varios call-sites mandan el prompt como argv → riesgo de quoting/injection). */
export function resolveClaudeCli(): string {
  const override = process.env.CLAUDE_CLI_PATH?.trim();
  if (override) return override;
  if (IS_WIN) {
    const local = join(homedir(), '.local', 'bin', 'claude.exe');
    if (existsSync(local)) return local;
    try {
      const r = spawnSync('where', ['claude'], { encoding: 'utf-8', timeout: 4000 });
      if (r.status === 0 && r.stdout) {
        const hits = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        const exe = hits.find((h) => /\.exe$/i.test(h));
        if (exe) return exe;
        if (hits[0]) return hits[0];
      }
    } catch { /* noop */ }
    return local;
  }
  return join(homedir(), '.local', 'bin', 'claude');
}

/** Resuelve el binario de ripgrep (`rg` / `rg.exe`) cross-platform.
 *  Prioridad: $ECO_RIPGREP/$RG_BIN → binario bundleado del claude-agent-sdk
 *  (`vendor/ripgrep/<arch>-<plat>/`) → `'rg'` en el PATH.
 *
 *  El bundleado es clave en Windows: el `.exe` empaquetado NO está en el PATH,
 *  así que `spawn('rg')` fallaba y la búsqueda caía a `grep` (inexistente en
 *  Win). Usar la ruta absoluta del binario que ya se empaqueta lo arregla y
 *  además hace la búsqueda confiable en Mac sin depender de un `rg` global.
 *  Devuelve null solo si nada existe. */
let cachedRgPath: string | null | undefined;
export function resolveRipgrepPath(): string | null {
  if (cachedRgPath !== undefined) return cachedRgPath;
  cachedRgPath = computeRipgrepPath();
  return cachedRgPath;
}
function computeRipgrepPath(): string | null {
  const override = (process.env.ECO_RIPGREP || process.env.RG_BIN)?.trim();
  if (override && existsSync(override)) return override;

  // Carpeta vendor por arch: arm64-darwin, x64-win32, x64-linux, etc.
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const plat = IS_WIN ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const binName = IS_WIN ? 'rg.exe' : 'rg';
  const vendorRel = join('vendor', 'ripgrep', `${arch}-${plat}`, binName);

  // El SDK puede resolverse via require (dev) o estar junto al backend en el
  // bundle. fileURLToPath, nunca new URL().pathname (rompe en Windows).
  const candidates: string[] = [];
  try {
    const require = createRequire(import.meta.url);
    const sdkPkg = require.resolve('@anthropic-ai/claude-agent-sdk/package.json');
    candidates.push(join(dirname(sdkPkg), vendorRel));
  } catch { /* no resoluble por require: probamos rutas relativas */ }
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  candidates.push(join(moduleDir, '..', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', vendorRel));
  candidates.push(join(moduleDir, '..', '..', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', vendorRel));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // Fallback: PATH. Confirmamos que responde a --version (en POSIX típico).
  try {
    const r = spawnSync(binName, ['--version'], { encoding: 'utf8', timeout: 4000 });
    if (r.status === 0 && (r.stdout ?? '').trim().length > 0) return binName;
  } catch { /* no en PATH */ }
  return null;
}

/** Shell interactivo para el PTY. */
export function defaultShell(): string {
  if (IS_WIN) return process.env.ComSpec || 'powershell.exe';
  return process.env.SHELL || (existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash');
}

/** cmd.exe NO entiende el prefijo POSIX `./script` (parsea `.` como comando →
 *  "'.' no se reconoce…"). Traducimos `./` (y `../`) a la forma con backslash
 *  solo al INICIO de un comando (start o tras espacio/operador), así un
 *  `./mvnw spring-boot:run` configurado una vez corre en ambos SO. No tocamos
 *  `//` de URLs (precedido por `:`) ni slashes dentro de otros args. */
function normalizeWinCommand(command: string): string {
  return command.replace(/(^|[\s&|;(])(\.\.?)\//g, '$1$2\\');
}

/** Cómo ejecutar un STRING de comando: `bash -c <cmd>` / `cmd /c <cmd>`. */
export function shellRun(command: string): { cmd: string; args: string[] } {
  if (IS_WIN) return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', normalizeWinCommand(command)] };
  return { cmd: '/bin/bash', args: ['-c', command] };
}

/** Igual pero con `sh` en POSIX (para runShell, que históricamente usaba sh). */
export function shRun(command: string): { cmd: string; args: string[] } {
  if (IS_WIN) return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', normalizeWinCommand(command)] };
  return { cmd: 'sh', args: ['-c', command] };
}

/** Opciones de spawn para poder matar TODA la descendencia luego. POSIX: process
 *  group (detached). Windows: sin grupos — se mata por pid con taskkill /T. */
export const detachForGroup: boolean = !IS_WIN;

/** PIDs escuchando en un puerto TCP. Vacío si está libre. */
export function pidsOnPort(port: number): number[] {
  try {
    if (IS_WIN) {
      const r = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf-8', timeout: 4000 });
      if (r.status !== 0 || !r.stdout) return [];
      const pids = new Set<number>();
      for (const line of r.stdout.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        // Proto  Local           Foreign        State       PID
        const m = line.trim().match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (m && Number(m[1]) === port) pids.add(Number(m[2]));
      }
      return [...pids];
    }
    const r = spawnSync('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN'], { encoding: 'utf-8', timeout: 4000 });
    if (r.status !== 0 || !r.stdout) return [];
    return r.stdout.split('\n').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  } catch { return []; }
}

/** Mata un árbol de procesos. POSIX: `process.kill(-pgid, signal)` (grupo).
 *  Windows: `taskkill /PID <pid> /T /F` (árbol completo). */
export function killTree(pidOrPgid: number, signal: NodeJS.Signals): boolean {
  try {
    if (IS_WIN) {
      const r = spawnSync('taskkill', ['/PID', String(pidOrPgid), '/T', '/F'], { timeout: 4000 });
      return r.status === 0;
    }
    process.kill(-pidOrPgid, signal);
    return true;
  } catch { return false; }
}

/** Mata un proceso individual por pid (cross-platform). */
export function killPid(pid: number, signal: NodeJS.Signals): boolean {
  try {
    if (IS_WIN) { spawnSync('taskkill', ['/PID', String(pid), '/F'], { timeout: 4000 }); return true; }
    process.kill(pid, signal);
    return true;
  } catch { return false; }
}
