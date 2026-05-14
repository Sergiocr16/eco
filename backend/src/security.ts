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

export const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'TMPDIR', 'TEMP', 'TMP', 'USER', 'LOGNAME', 'PWD', 'TERM',
];

// Directorios bin que macOS NO incluye en el PATH cuando una app .app se
// lanza desde Finder/Dock (solo hereda `/usr/bin:/bin:/usr/sbin:/sbin`).
// Homebrew instala en `/opt/homebrew/bin` (Apple Silicon) o `/usr/local/bin`
// (Intel). Sin esto, herramientas como `gh`, `git` de brew, `mvn`, etc.
// no se encuentran al spawnear desde el backend empaquetado.
const EXTRA_PATH_DIRS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
];

/** Devuelve un PATH que combina el heredado + los dirs de Homebrew/local,
 *  sin duplicados. Los dirs extra van al FINAL (prioridad al PATH del user
 *  si lo tiene completo, ej. en dev con `npm run`). */
function augmentedPath(): string {
  const inherited = (process.env.PATH || '').split(':').filter(Boolean);
  const seen = new Set(inherited);
  const merged = [...inherited];
  for (const d of EXTRA_PATH_DIRS) {
    if (!seen.has(d)) { merged.push(d); seen.add(d); }
  }
  return merged.join(':');
}

export function buildSafeEnv(extras: Record<string, string | undefined> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const v = process.env[key];
    if (v) env[key] = v;
  }
  // PATH siempre augmentado — incluso si el caller pasó uno, lo
  // sobreescribimos con la versión completa (el extras lo puede pisar abajo
  // si explícitamente manda PATH).
  env.PATH = augmentedPath();
  for (const [k, v] of Object.entries(extras)) {
    if (v) env[k] = v;
  }
  return env;
}
