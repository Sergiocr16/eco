// Detección del método de autenticación de Claude Code.
//
// Eco tiene dos formas de autenticarse contra Anthropic:
//   1. CLI session: el usuario corre `claude login` una vez y el SDK lee
//      las credentials OAuth (Keychain en mac, ~/.claude/* en linux/win).
//      El consumo va contra su suscripción Pro/Max — sin costo extra.
//   2. API key directa: el usuario pega su sk-ant-... que guardamos en
//      ~/.eco/api-key. Cada request consume su API budget.
//
// Si AMBAS están configuradas, el SDK de Claude Code prefiere la sesión
// CLI. Lo reflejamos en `effectiveMethod` para que la UI sea clara.

import { spawnSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { config } from './config.js';
import { hasApiKey, maskedApiKey } from './api-key-store.js';

export type ClaudeAuthStatus = {
  // CLI
  cliInstalled: boolean;
  cliPath: string;
  cliVersion: string | null;
  cliLoggedIn: boolean;
  cliLoginHint: string;     // dónde está guardada la sesión (keychain / file)
  // API key
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  // Resolución efectiva
  effectiveMethod: 'cli' | 'apikey' | 'none';
};

function checkCliInstalled(): { installed: boolean; version: string | null } {
  try {
    const r = spawnSync(config.claudeCliPath, ['--version'], {
      timeout: 3000, encoding: 'utf-8',
    });
    if (r.status === 0 && r.stdout) {
      const m = r.stdout.match(/(\d+\.\d+\.\d+)/);
      return { installed: true, version: m?.[1] ?? r.stdout.trim().slice(0, 40) };
    }
  } catch { /* noop */ }
  return { installed: false, version: null };
}

function checkKeychainLogin(): { found: boolean; hint: string } {
  // macOS: Claude Code guarda OAuth en Keychain bajo el service name
  // "Claude Code-credentials". Solo verificamos PRESENCIA, no leemos.
  try {
    execSync('security find-generic-password -s "Claude Code-credentials" 2>/dev/null', {
      timeout: 2000,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return { found: true, hint: 'Keychain de macOS' };
  } catch { /* not found */ }
  return { found: false, hint: '' };
}

function checkFileLogin(): { found: boolean; hint: string } {
  const candidates = [
    join(homedir(), '.claude', '.credentials.json'),
    join(homedir(), '.claude', 'credentials.json'),
    join(homedir(), '.config', 'claude', 'credentials.json'),
    process.env.APPDATA ? join(process.env.APPDATA, 'claude', 'credentials.json') : '',
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return { found: true, hint: p.replace(homedir(), '~') };
  }
  return { found: false, hint: '' };
}

export function getClaudeAuthStatus(): ClaudeAuthStatus {
  const cli = checkCliInstalled();
  // Detectar sesión CLI según OS.
  let session: { found: boolean; hint: string } = { found: false, hint: '' };
  if (platform() === 'darwin') {
    session = checkKeychainLogin();
    if (!session.found) session = checkFileLogin();
  } else {
    session = checkFileLogin();
  }
  const apiKeyConfigured = hasApiKey();
  // Prioridad: CLI > API key (el SDK también prioriza CLI cuando ambas existen).
  const effectiveMethod: 'cli' | 'apikey' | 'none' =
    cli.installed && session.found ? 'cli'
    : apiKeyConfigured ? 'apikey'
    : 'none';
  return {
    cliInstalled: cli.installed,
    cliPath: config.claudeCliPath,
    cliVersion: cli.version,
    cliLoggedIn: session.found,
    cliLoginHint: session.hint,
    apiKeyConfigured,
    apiKeyMasked: maskedApiKey(),
    effectiveMethod,
  };
}
