export const DANGEROUS_BASH_PATTERNS: RegExp[] = [
  /\brm\s+-rf?\b[^|;&]*\s\//,
  /\bsudo\b/,
  /\bsu\s+-/,
  /\bchmod\s+-R\s+777\b/,
  /(?:curl|wget|fetch)\s+[^|;&]*\|\s*(?:sh|bash|zsh|fish|ksh|tcsh|csh|dash)\b/,
  /\bnc\b[^|;&]*\s-e\b/,
  /\bdd\b[^|;&]*\sof=\/dev\//,
  />\s*\/dev\/(?:sd[a-z]|nvme|disk|hda|hdb)/,
  /\bmkfs\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bpoweroff\b/,
  /\bhalt\b/,
  /:\(\)\s*\{\s*:\|:&\s*\};/,
  /\beval\s+.*\$\(/,
  /\bexec\s+.*\$\(/,
  /\b\$\(.*curl|wget.*\$\(/,
  /\b(?:cat|sed|tee)\b[^|;&]*>\s*\/etc\//,
  /\bln\s+-s[^|;&]*\/etc/,
  /\b(?:python|python3|node|ruby|perl|php)\s+-c\s+["']\s*os\.system|subprocess|exec/i,
];

export function isDangerousBash(command: string): { dangerous: boolean; reason?: string } {
  for (const re of DANGEROUS_BASH_PATTERNS) {
    if (re.test(command)) {
      return { dangerous: true, reason: `Patrón bloqueado: ${re.source.slice(0, 40)}…` };
    }
  }
  return { dangerous: false };
}

import { delimiter as PATH_DELIMITER } from 'node:path';

const IS_WIN = process.platform === 'win32';

// Prefijos de variables internas de Eco que NO se filtran a procesos
// spawneados (config/puertos/ids del backend; el bearer vive en ~/.eco/token,
// la API key se inyecta explícitamente vía `extras`, no por env del proceso).
const ENV_DENY_PREFIXES = ['ECO_'];

// Directorios bin que el SO NO siempre incluye en el PATH cuando la app se
// lanza desde su launcher (Finder/Dock en mac, acceso directo en Windows).
// Sin esto, `claude`, `gh`, `git`/`mvn` de Homebrew o los binarios de npm
// global no se resuelven al spawnear desde el backend empaquetado.
const EXTRA_PATH_DIRS = (IS_WIN
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

/** Devuelve un PATH que combina el heredado + los dirs de Homebrew/npm/local,
 *  sin duplicados. Los dirs extra van al FINAL (prioridad al PATH del user
 *  si lo tiene completo, ej. en dev con `npm run`). El separador es ';' en
 *  Windows y ':' en POSIX (path.delimiter). */
function augmentedPath(): string {
  const inherited = (process.env.PATH || '').split(PATH_DELIMITER).filter(Boolean);
  const seen = new Set(inherited);
  const merged = [...inherited];
  for (const d of EXTRA_PATH_DIRS) {
    if (!seen.has(d)) { merged.push(d); seen.add(d); }
  }
  return merged.join(PATH_DELIMITER);
}

// Los procesos spawneados (terminal interactiva, dev-server, git, claude -p)
// HEREDAN todo el entorno del usuario, así cualquier toolchain instalado
// (JAVA_HOME, NVM, PYENV, GOROOT, etc.) funciona sin mantener un allowlist.
// No es un riesgo: la terminal ya da shell completo al usuario, filtrar
// variables no aportaba seguridad y rompía librerías. Solo bloqueamos el
// prefijo interno de Eco y reescribimos PATH (augmentado). `extras` pisa al
// final (identidad git, API key, etc.).
export function buildSafeEnv(extras: Record<string, string | undefined> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (ENV_DENY_PREFIXES.some((p) => k.startsWith(p))) continue;
    env[k] = v;
  }
  env.PATH = augmentedPath();
  for (const [k, v] of Object.entries(extras)) {
    if (v) env[k] = v;
  }
  return env;
}
