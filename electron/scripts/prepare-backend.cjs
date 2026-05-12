// Antes de empaquetar con electron-builder, el backend necesita su propia
// carpeta backend/node_modules con las prod deps. Los workspaces npm hoistean
// todo al root, así que acá hacemos el install dedicado.
//
// Para mantener el repo limpio, generamos `backend/node_modules/` fresh con
// `--omit=dev --no-package-lock` y luego electron-builder lo copia tal cual
// vía extraResources.

const { spawnSync } = require('node:child_process');
const { existsSync, rmSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const BACKEND_NM = path.join(BACKEND_DIR, 'node_modules');

console.log('[prepare-backend] limpiando', BACKEND_NM);
rmSync(BACKEND_NM, { recursive: true, force: true });

// `npm install` en backend/ ignorando workspaces — usamos --workspaces=false
// para que no intente conectar con el root.
console.log('[prepare-backend] npm install --omit=dev (backend)');
const r = spawnSync(
  'npm',
  ['install', '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', '--workspaces=false', '--install-strategy=nested'],
  {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: { ...process.env, npm_config_workspaces: 'false' },
  },
);
if (r.status !== 0) {
  console.error('[prepare-backend] npm install falló con code', r.status);
  process.exit(r.status ?? 1);
}

if (!existsSync(BACKEND_NM)) {
  console.error('[prepare-backend] backend/node_modules no se creó');
  process.exit(1);
}

// node-pty: asegurar bit ejecutable del spawn-helper. npm install a veces lo
// pierde y entonces el PTY falla con "posix_spawnp failed." al empaquetar.
const { chmodSync } = require('node:fs');
for (const arch of ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']) {
  const helper = path.join(BACKEND_NM, 'node-pty', 'prebuilds', arch, 'spawn-helper');
  if (existsSync(helper)) {
    try { chmodSync(helper, 0o755); console.log('[prepare-backend] chmod +x', helper); }
    catch (e) { console.warn('[prepare-backend] no pude chmod', helper, e); }
  }
}

console.log('[prepare-backend] backend/node_modules listo');
