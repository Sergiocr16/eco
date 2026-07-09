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
import { EXTRA_PATH_DIRS } from './platform.js';

// Prefijos de variables internas de Eco que NO se filtran a procesos
// spawneados (config/puertos/ids del backend; el bearer vive en ~/.eco/token,
// la API key se inyecta explícitamente vía `extras`, no por env del proceso).
// `CLAUDE_CODE_` = identidad de la sesión de Claude Code del backend: si Eco se
// lanzó desde una sesión `claude`, el process.env del backend trae
// CLAUDE_CODE_SESSION_ID/ENTRYPOINT/EXECPATH/CHILD_SESSION. Heredarlas hace que
// el `claude` interactivo del PTY se crea hijo anidado y NO persista su propia
// sesión -> `/resume` en la terminal queda vacío. El allowlist viejo las
// filtraba; el passthrough las reintrodujo (regresión).
const ENV_DENY_PREFIXES = ['ECO_', 'CLAUDE_CODE_'];

// Variables de "identidad ambiental" sueltas que tampoco deben heredarse:
// - CLAUDECODE/CLAUDE_EFFORT: marcan ejecución anidada de Claude Code.
// - TERM_SESSION_ID/TERM_PROGRAM*: identidad del terminal anfitrión; en zsh
//   disparan el restore de sesión de Apple Terminal ("Restored session...")
//   dentro del PTY de Eco y confunden la detección de TTY.
const ENV_DENY_EXACT = new Set([
  'CLAUDECODE',
  'CLAUDE_EFFORT',
  'TERM_SESSION_ID',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
]);

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
    if (ENV_DENY_EXACT.has(k)) continue;
    env[k] = v;
  }
  env.PATH = augmentedPath();
  // El PTY de Eco no es Apple Terminal — desactivá el guardado/restore de
  // sesión de zsh para que no escupa "Restored session" ni intente borrar
  // archivos en ~/.zsh_sessions. Un extras puede pisarlo si hiciera falta.
  env.SHELL_SESSIONS_DISABLE = '1';
  for (const [k, v] of Object.entries(extras)) {
    if (v) env[k] = v;
  }
  return env;
}
