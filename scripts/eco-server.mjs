#!/usr/bin/env node
// Lanza Eco en modo server: backend sirviendo el frontend estático en :7200,
// expuesto a la tailnet vía Tailscale Serve (HTTPS con certs .ts.net).
//
//   npm run serve:web              — build (si falta dist) + serve
//   npm run serve:web -- --rebuild — fuerza rebuild de backend + frontend
//
// El acceso remoto es https://<maquina>.ts.net — el cliente pega el token
// (~/.eco/token) en la pantalla "Conectar al servidor" y luego el PIN normal.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.ECO_PORT ?? 7200);
const rebuild = process.argv.includes('--rebuild');

const MAC_APP_BIN = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';

function tailscaleBin() {
  const env = process.env.ECO_TAILSCALE_BIN?.trim();
  if (env && existsSync(env)) return env;
  if (existsSync(MAC_APP_BIN)) return MAC_APP_BIN;
  const probe = spawnSync('tailscale', ['version'], { stdio: 'ignore' });
  if (!probe.error) return 'tailscale';
  return null;
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const ts = tailscaleBin();
if (!ts) {
  fail(
    'No se encontró la CLI de Tailscale. Instalá la app de macOS ' +
    '(https://tailscale.com/download) o seteá ECO_TAILSCALE_BIN al binario.',
  );
}

const statusRes = spawnSync(ts, ['status', '--json'], { encoding: 'utf-8' });
if (statusRes.status !== 0 || !statusRes.stdout) {
  fail('`tailscale status` falló — ¿está Tailscale conectado? (abrí la app y logueate)');
}

let host = '';
let backendState = '';
try {
  const status = JSON.parse(statusRes.stdout);
  backendState = String(status?.BackendState ?? '');
  // DNSName viene con punto final ("maquina.tail1234.ts.net.") — lo sacamos.
  host = String(status?.Self?.DNSName ?? '').replace(/\.$/, '').toLowerCase();
} catch {
  fail('No se pudo parsear `tailscale status --json`.');
}
if (backendState !== 'Running') {
  fail(`Tailscale está "${backendState || 'desconocido'}" — abrí la app de Tailscale y conectate antes de lanzar el server.`);
}
if (!host) fail('Tailscale no reporta DNSName — ¿MagicDNS está habilitado en la tailnet?');

// Builds — solo si faltan o con --rebuild.
const backendDist = join(root, 'backend', 'dist', 'index.js');
const frontendDist = join(root, 'frontend', 'dist', 'index.html');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) fail(`Falló: ${cmd} ${args.join(' ')}`);
}

if (rebuild || !existsSync(backendDist)) run('npm', ['run', 'build:backend']);
if (rebuild || !existsSync(frontendDist)) run('npm', ['run', 'build:frontend']);

// Tailscale Serve para el shell de Eco: https://<host> → http://127.0.0.1:PORT.
// Best-effort: si falla o se cuelga, imprimimos qué falta y seguimos — local
// igual funciona. Timeout obligatorio: cuando Serve no está habilitado en la
// tailnet, la CLI imprime una URL de activación y se queda esperando forever.
const serve = spawnSync(ts, ['serve', '--bg', '--https=443', `http://127.0.0.1:${PORT}`], {
  encoding: 'utf-8',
  timeout: 15_000,
});
const serveOut = `${serve.stdout || ''}${serve.stderr || ''}`.trim();
if (serve.status !== 0 || serve.signal) {
  console.warn('\n⚠ Tailscale Serve no quedó configurado:');
  if (serveOut) console.warn(serveOut.split('\n').map((l) => `  ${l}`).join('\n'));
  if (/not enabled on your tailnet/i.test(serveOut)) {
    console.warn('\n  → Habilitá "Serve" desde esa URL (una sola vez por tailnet) y relanzá `npm run serve:web`.');
  } else {
    console.warn('  Habilitá HTTPS Certificates en https://login.tailscale.com/admin/dns y corré:');
    console.warn(`  ${ts} serve --bg --https=443 http://127.0.0.1:${PORT}`);
  }
  console.warn('  El acceso local http://127.0.0.1:' + PORT + ' funciona igual mientras tanto.\n');
}

console.log('');
console.log('  Eco server mode');
console.log(`  · Local:   http://127.0.0.1:${PORT}`);
console.log(`  · Tailnet: https://${host}`);
console.log('  · Token de acceso para clientes remotos: ~/.eco/token');
console.log('');

const child = spawn(process.execPath, [backendDist], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ECO_PORT: String(PORT),
    ECO_FRONTEND_DIST: join(root, 'frontend', 'dist'),
    ECO_ALLOWED_ORIGINS: [
      `https://${host}`,
      `http://127.0.0.1:${PORT}`,
      `http://localhost:${PORT}`,
    ].join(','),
    ECO_EXTRA_HOSTS: host,
    ECO_PUBLIC_HOST: host,
    ECO_TAILSCALE_BIN: ts,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
