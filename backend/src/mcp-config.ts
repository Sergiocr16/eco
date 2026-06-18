// Registro del MCP server "eco" en Claude Code. Delegamos al binario
// `claude` (que ya requerimos como dependencia operativa) para no parsear
// ~/.claude.json directamente — el formato es interno y la CLI ya nos da
// add/remove/list con el contrato estable.

import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

export type McpStatus = {
  // Existe el binario mcp-server/dist/index.js bundleado/en repo
  binaryAvailable: boolean;
  // Path resuelto del index.js que registramos en Claude Code
  binaryPath: string;
  // El binario `claude` existe en disco
  claudeAvailable: boolean;
  claudePath: string;
  // El MCP "eco" está registrado en Claude Code (user scope)
  installed: boolean;
  scope: 'user' | 'project' | 'local' | null;
  // Output crudo del `claude mcp get eco` cuando installed=true (para debugging)
  rawInfo?: string;
};

// Resolvemos el index.js del mcp-server. La ruta relativa funciona tanto en
// dev (backend corre desde src/ o dist/ → ../../mcp-server/dist/index.js apunta
// al repo) como en packaged (.app/Resources/backend/dist → .app/Resources/
// mcp-server/dist via prepare-mcp + extraResources). Mismo offset.
function resolveBinaryPath(): string {
  // fileURLToPath en vez de `new URL(...).pathname`: en Windows el pathname
  // queda como `/C:/...` (con barra inicial y separadores POSIX) y rompe el
  // path.resolve. fileURLToPath devuelve el path nativo correcto en todo SO.
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '..', '..', 'mcp-server', 'dist', 'index.js');
}

function resolveClaudePath(): string {
  return config.claudeCliPath;
}

function runClaude(args: string[], opts: SpawnOptionsWithoutStdio = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const claudePath = resolveClaudePath();
    const child = spawn(claudePath, args, { ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (b) => { stdout += b.toString(); });
    child.stderr?.on('data', (b) => { stderr += b.toString(); });
    child.on('error', () => resolve({ code: -1, stdout, stderr }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } }, 10_000);
  });
}

export async function getMcpStatus(): Promise<McpStatus> {
  const binaryPath = resolveBinaryPath();
  const binaryAvailable = existsSync(binaryPath);
  const claudePath = resolveClaudePath();
  const claudeAvailable = existsSync(claudePath);

  if (!claudeAvailable) {
    return {
      binaryAvailable, binaryPath, claudeAvailable, claudePath,
      installed: false, scope: null,
    };
  }

  // `claude mcp get eco` devuelve exit 0 si está registrado en cualquier scope.
  // No usamos `claude mcp list` para evitar parsear todos los MCPs del user.
  const r = await runClaude(['mcp', 'get', 'eco']);
  const installed = r.code === 0;

  // Scope: extraerlo del output si está disponible. La CLI imprime
  // "Scope: User" / "Scope: Project" / "Scope: Local" o similar.
  let scope: McpStatus['scope'] = null;
  if (installed) {
    const m = r.stdout.match(/scope:\s*(user|project|local)/i);
    if (m) scope = m[1]!.toLowerCase() as McpStatus['scope'];
  }

  return {
    binaryAvailable, binaryPath, claudeAvailable, claudePath,
    installed, scope,
    ...(installed ? { rawInfo: r.stdout.slice(0, 2000) } : {}),
  };
}

export async function installMcp(): Promise<{ ok: true; stdout: string } | { ok: false; code: string; message: string }> {
  const binaryPath = resolveBinaryPath();
  if (!existsSync(binaryPath)) {
    return { ok: false, code: 'mcp.binary_missing', message: 'mcp-server/dist/index.js no existe (ejecutá `npm run build:mcp`)' };
  }
  if (!existsSync(resolveClaudePath())) {
    return { ok: false, code: 'mcp.claude_missing', message: `claude CLI no encontrado en ${resolveClaudePath()}` };
  }

  // Si ya estaba instalado, lo removemos primero para que la re-instalación
  // refresque el path (ej: después de mover el .app de carpeta).
  await runClaude(['mcp', 'remove', 'eco', '-s', 'user']).catch(() => {});

  const r = await runClaude(['mcp', 'add', 'eco', '-s', 'user', '--', 'node', binaryPath]);
  if (r.code !== 0) {
    return {
      ok: false, code: 'mcp.install_failed',
      message: (r.stderr || r.stdout || `claude mcp add salió con code ${r.code}`).slice(0, 800),
    };
  }
  return { ok: true, stdout: r.stdout.slice(0, 800) };
}

export async function uninstallMcp(): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!existsSync(resolveClaudePath())) {
    return { ok: false, code: 'mcp.claude_missing', message: 'claude CLI no encontrado' };
  }
  const r = await runClaude(['mcp', 'remove', 'eco', '-s', 'user']);
  if (r.code !== 0) {
    return {
      ok: false, code: 'mcp.uninstall_failed',
      message: (r.stderr || r.stdout || `claude mcp remove salió con code ${r.code}`).slice(0, 800),
    };
  }
  return { ok: true };
}
