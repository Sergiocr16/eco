// Primitivas dependientes del SO, centralizadas para soportar macOS y Windows.
// Los bloqueadores Windows eran: shell hardcodeado a /bin/zsh|/bin/bash, `lsof`
// para puertos, y `process.kill(-pgid)` (process groups, inexistente en Win).

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const IS_WIN = process.platform === 'win32';

/** Shell interactivo para el PTY. */
export function defaultShell(): string {
  if (IS_WIN) return process.env.ComSpec || 'powershell.exe';
  return process.env.SHELL || (existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash');
}

/** Cómo ejecutar un STRING de comando: `bash -c <cmd>` / `cmd /c <cmd>`. */
export function shellRun(command: string): { cmd: string; args: string[] } {
  if (IS_WIN) return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command] };
  return { cmd: '/bin/bash', args: ['-c', command] };
}

/** Igual pero con `sh` en POSIX (para runShell, que históricamente usaba sh). */
export function shRun(command: string): { cmd: string; args: string[] } {
  if (IS_WIN) return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command] };
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
