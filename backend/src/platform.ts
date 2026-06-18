// Primitivas dependientes del SO, centralizadas para soportar macOS y Windows.
// Los bloqueadores Windows eran: shell hardcodeado a /bin/zsh|/bin/bash, `lsof`
// para puertos, y `process.kill(-pgid)` (process groups, inexistente en Win).

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
