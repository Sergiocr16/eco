// Primitivas dependientes del SO, centralizadas para soportar macOS y Windows.
// Los bloqueadores Windows eran: shell hardcodeado a /bin/zsh|/bin/bash, `lsof`
// para puertos, y `process.kill(-pgid)` (process groups, inexistente en Win).

import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_WIN = process.platform === 'win32';

// Directorios bin que el SO NO siempre incluye en el PATH cuando la app se
// lanza desde su launcher (Finder/Dock en mac, acceso directo en Windows).
// Sin esto, `claude`, `codex`, `gh`, `git`/`mvn` de Homebrew o los binarios de
// npm global no se resuelven al spawnear desde el backend empaquetado.
// `security.ts:augmentedPath()` los agrega al PATH de los hijos; `resolveCli`
// los recorre para encontrar un binario sin depender del PATH heredado.
export const EXTRA_PATH_DIRS = (IS_WIN
  ? [
      process.env.APPDATA ? `${process.env.APPDATA}\\npm` : '', // npm global (claude.cmd, etc.)
      process.env.USERPROFILE ? `${process.env.USERPROFILE}\\.local\\bin` : '', // claude.exe
    ]
  : [
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      process.env.HOME ? `${process.env.HOME}/.local/bin` : '',
    ]
).filter(Boolean);

/** Bin dirs de npm-global bajo un manejador de versiones de Node (nvm). Un
 *  `npm i -g @openai/codex` deja el binario en
 *  `~/.nvm/versions/node/<v>/bin/`, que NO está en EXTRA_PATH_DIRS y que el
 *  backend empaquetado tampoco tiene en su PATH.
 *
 *  Solo para DESCUBRIR binarios: deliberadamente NO van a EXTRA_PATH_DIRS,
 *  porque agregarlos al PATH de los hijos metería `node` v6/v7/v10 en el
 *  PATH de cualquier dev-server. Versiones en orden descendente → gana la
 *  más nueva, que es donde el user instaló el CLI. */
function nvmBinDirs(): string[] {
  if (IS_WIN) return [];
  const dirs: string[] = [];
  const active = process.env.NVM_BIN?.trim();
  if (active) dirs.push(active);
  const root = join(homedir(), '.nvm', 'versions', 'node');
  try {
    const versions = readdirSync(root).filter((v) => v.startsWith('v'));
    versions.sort(compareNodeVersionsDesc);
    for (const v of versions) dirs.push(join(root, v, 'bin'));
  } catch { /* sin nvm */ }
  return dirs;
}

function compareNodeVersionsDesc(a: string, b: string): number {
  const parse = (v: string) => v.slice(1).split('.').map((n) => Number(n) || 0);
  const [a0, a1, a2] = parse(a);
  const [b0, b1, b2] = parse(b);
  return (b0! - a0!) || (b1! - a1!) || (b2! - a2!);
}

// Memo de resoluciones EXITOSAS. Un fallo no se cachea: si el user instala
// `codex` con Eco abierto, el botón "Reintentar" tiene que encontrarlo sin
// reiniciar el backend. El existsSync cubre el caso inverso (lo desinstaló).
const resolvedClis = new Map<string, string>();

/** Resuelve el path de un CLI de agente (`claude`, `codex`) cross-platform.
 *  Prioridad: $<envVar> → instalador nativo (~/.local/bin) → bin dirs conocidos
 *  (Homebrew, npm global) → bins de nvm → PATH → fallback a ~/.local/bin (para
 *  que el warning de config.ts sea informativo).
 *
 *  El paso por los bin dirs conocidos existe porque el backend empaquetado
 *  hereda un PATH mínimo del launcher del SO: `where`/`which` no encontrarían
 *  un binario instalado por Homebrew o npm -g.
 *
 *  En Windows preferimos un ejecutable real (.exe) sobre los shims .cmd de
 *  npm: spawnear un .cmd requiere `shell:true`, que rompe el paso de args
 *  (varios call-sites mandan el prompt como argv → riesgo de quoting/injection). */
function resolveCli(binName: string, envVar: string): string {
  const override = process.env[envVar]?.trim();
  if (override) return override;

  const memo = resolvedClis.get(binName);
  if (memo && existsSync(memo)) return memo;

  const exeName = IS_WIN ? `${binName}.exe` : binName;
  const localBin = join(homedir(), '.local', 'bin', exeName);

  const hit = firstExisting([localBin, ...EXTRA_PATH_DIRS.map((d) => join(d, exeName))])
    ?? lookupOnPath(binName)
    ?? firstExisting(nvmBinDirs().map((d) => join(d, exeName)));

  if (hit) {
    resolvedClis.set(binName, hit);
    return hit;
  }
  return localBin;
}

function firstExisting(candidates: string[]): string | null {
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function lookupOnPath(binName: string): string | null {
  try {
    const r = IS_WIN ? spawnSync('where', [binName], { encoding: 'utf-8', timeout: 4000 })
                     : spawnSync('which', [binName], { encoding: 'utf-8', timeout: 4000 });
    if (r.status !== 0 || !r.stdout) return null;
    const hits = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (IS_WIN) {
      const exe = hits.find((h) => /\.exe$/i.test(h));
      if (exe) return exe;
    }
    return hits[0] ?? null;
  } catch { return null; }
}

export function resolveClaudeCli(): string {
  return resolveCli('claude', 'CLAUDE_CLI_PATH');
}

export function resolveCodexCli(): string {
  return resolveCli('codex', 'CODEX_CLI_PATH');
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
