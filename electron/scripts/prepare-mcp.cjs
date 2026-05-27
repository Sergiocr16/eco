// Antes de empaquetar, dejamos mcp-server listo para que electron-builder lo
// copie como extraResources: dist/ (TS compilado) + node_modules/ (prod) +
// package.json. La estructura final dentro del .app queda:
//   Resources/mcp-server/dist/index.js
//   Resources/mcp-server/node_modules/...
//   Resources/mcp-server/package.json
//
// mcp-server NO es workspace npm del root (a propósito — vive aparte para que
// el usuario pueda clonarlo y publicarlo independiente). Por eso instalamos
// en su propio directorio con --no-package-lock + --ignore-scripts (esbuild
// transitivo de tsx tira validateBinaryVersion en este host; lo evitamos).

const { spawnSync } = require('node:child_process');
const { existsSync, rmSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const MCP_DIR = path.join(ROOT, 'mcp-server');
const MCP_NM = path.join(MCP_DIR, 'node_modules');
const MCP_DIST = path.join(MCP_DIR, 'dist');

if (!existsSync(path.join(MCP_DIR, 'package.json'))) {
  console.error('[prepare-mcp] no se encontró mcp-server/, salgo');
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: MCP_DIR,
    stdio: 'inherit',
    env: { ...process.env, npm_config_workspaces: 'false' },
    ...opts,
  });
  if (r.status !== 0) {
    console.error(`[prepare-mcp] ${cmd} ${args.join(' ')} falló con code`, r.status);
    process.exit(r.status ?? 1);
  }
}

console.log('[prepare-mcp] limpiando dist + node_modules');
rmSync(MCP_DIST, { recursive: true, force: true });
rmSync(MCP_NM, { recursive: true, force: true });

// Install completo (incluye tsc para poder compilar). --ignore-scripts evita
// el postinstall de esbuild (validateBinaryVersion explota en esta máquina).
console.log('[prepare-mcp] npm install (con dev deps, ignore-scripts)');
run('npm', ['install', '--no-package-lock', '--no-audit', '--no-fund', '--ignore-scripts', '--workspaces=false']);

// Compilar TS → dist/
console.log('[prepare-mcp] tsc -p tsconfig.json');
run('npx', ['tsc', '-p', 'tsconfig.json']);

if (!existsSync(path.join(MCP_DIST, 'index.js'))) {
  console.error('[prepare-mcp] dist/index.js no se generó');
  process.exit(1);
}

// Pruning: ahora dejamos solo prod deps (saca tsc, tsx, @types/node, etc).
console.log('[prepare-mcp] npm prune --omit=dev');
run('npm', ['prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false']);

console.log('[prepare-mcp] mcp-server listo');
