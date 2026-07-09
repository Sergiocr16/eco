// Detección del método de autenticación del CLI de Codex (OpenAI).
//
// Igual que Claude, Codex tiene dos caminos:
//   1. CLI session: `codex login` (OAuth con la cuenta ChatGPT). Las credenciales
//      van a ~/.codex/auth.json O al keyring del SO, según la opción
//      `cli_auth_credentials_store` de ~/.codex/config.toml.
//   2. API key directa: la guardamos en ~/.eco/openai-api-key y la inyectamos
//      como OPENAI_API_KEY en el PTY donde corre `codex` (ver pty-server.ts).
//
// Por el keyring, `existsSync(auth.json)` sub-reporta. La fuente autoritativa es
// `codex login status` (exit 0 = logueado); el archivo queda como fallback para
// cuando el binario no responde.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { config } from './config.js';
import { hasKey, maskedKey } from './api-key-store.js';

export type CodexAuthStatus = {
  cliInstalled: boolean;
  cliPath: string;
  cliVersion: string | null;
  cliLoggedIn: boolean;
  cliLoginHint: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  effectiveMethod: 'cli' | 'apikey' | 'none';
};

// El endpoint lo consultan la barra de terminales y Settings (que ademas
// pollea cada 30 s), y cada llamada son dos spawnSync. Cache corto.
const CACHE_TTL_MS = 5000;
let cached: { at: number; status: CodexAuthStatus } | null = null;

function codexHome(): string {
  return process.env.CODEX_HOME?.trim() || join(homedir(), '.codex');
}

function checkCliInstalled(): { installed: boolean; version: string | null } {
  try {
    const r = spawnSync(config.codexCliPath, ['--version'], { timeout: 3000, encoding: 'utf-8' });
    if (r.status === 0 && r.stdout) {
      const m = r.stdout.match(/(\d+\.\d+\.\d+)/);
      return { installed: true, version: m?.[1] ?? r.stdout.trim().slice(0, 40) };
    }
  } catch { /* noop */ }
  return { installed: false, version: null };
}

function checkLogin(cliInstalled: boolean): { found: boolean; hint: string } {
  // Sin binario no hay sesión que reportar: unas credenciales huérfanas en disco
  // solo producirían un "CLI no instalado · sesión activa" contradictorio.
  if (!cliInstalled) return { found: false, hint: '' };
  try {
    const r = spawnSync(config.codexCliPath, ['login', 'status'], { timeout: 4000, encoding: 'utf-8' });
    // status null = timeout/señal, r.error = fallo de spawn: inconcluso, caemos
    // al archivo. Un exit code cualquiera SÍ es autoritativo: `codex logout`
    // puede dejar un auth.json viejo y el fallback mentiría "sesión activa".
    if (!r.error && r.status !== null) {
      if (r.status !== 0) return { found: false, hint: '' };
      // `codex login status` escribe "Logged in using ChatGPT" en stderr, no stdout.
      const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
      const line = out.split('\n').map((s) => s.trim()).find(Boolean);
      return { found: true, hint: line?.slice(0, 60) ?? 'codex login' };
    }
  } catch { /* noop */ }
  // Binario presente pero no interrogable (timeout). El archivo es lo único que
  // queda. No cubre el caso keyring (cli_auth_credentials_store).
  const authFile = join(codexHome(), 'auth.json');
  if (existsSync(authFile)) return { found: true, hint: authFile.replace(homedir(), '~') };
  return { found: false, hint: '' };
}

export function getCodexAuthStatus(): CodexAuthStatus {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.status;

  const cli = checkCliInstalled();
  const session = checkLogin(cli.installed);
  const apiKeyConfigured = hasKey('openai');
  // Misma prioridad que Claude: la sesión del CLI gana sobre la API key.
  const effectiveMethod: 'cli' | 'apikey' | 'none' =
    cli.installed && session.found ? 'cli'
    : apiKeyConfigured ? 'apikey'
    : 'none';

  const status: CodexAuthStatus = {
    cliInstalled: cli.installed,
    cliPath: config.codexCliPath,
    cliVersion: cli.version,
    cliLoggedIn: session.found,
    cliLoginHint: session.hint,
    apiKeyConfigured,
    apiKeyMasked: maskedKey('openai'),
    effectiveMethod,
  };
  cached = { at: Date.now(), status };
  return status;
}

/** Invalida el cache — tras guardar/borrar la key o instalar el CLI. */
export function invalidateCodexAuthCache(): void {
  cached = null;
}

/** Env para el PTY de Codex: la API key solo si el usuario la guardó.
 *  Acotado a ese spawn — no se filtra a shells planos ni a los dev servers. */
export function openaiEnvOverrides(): Record<string, string> {
  const key = config.openaiApiKey;
  return key ? { OPENAI_API_KEY: key } : {};
}
