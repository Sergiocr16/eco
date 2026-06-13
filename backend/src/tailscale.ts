// Exposición de puertos de dev servers a la tailnet (modo server) vía
// `tailscale serve`, que da HTTPS (el BrowserPanel embebe sin mixed-content).
//
// REQUISITO: el dev server bindea SOLO 127.0.0.1 (ver HOST + server.address en
// dev-server.ts). Si bindea 0.0.0.0 toma 100.x:<port> y tailscale serve no
// puede usar ese puerto → "port in use".
//
// Robusto: async, no bloqueante, con timeout duro. Si falla, se loguea y sigue.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const MAC_APP_BIN = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';

export function tailscaleBin(): string {
  const env = process.env.ECO_TAILSCALE_BIN?.trim();
  if (env && existsSync(env)) return env;
  if (existsSync(MAC_APP_BIN)) return MAC_APP_BIN;
  return 'tailscale';
}

function runServe(args: string[], onWarn: (detail: string) => void): void {
  let stderr = '';
  try {
    const proc = spawn(tailscaleBin(), ['serve', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.stderr?.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2000); });
    const killer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      onWarn(stderr.trim() || 'timeout (¿Serve habilitado en la tailnet?)');
    }, 12_000);
    proc.on('error', (e) => { clearTimeout(killer); onWarn(e.message); });
    proc.on('exit', (code, signal) => {
      clearTimeout(killer);
      if (code !== 0 && signal !== 'SIGKILL') onWarn(stderr.trim() || `exit ${code}`);
    });
  } catch (e) {
    onWarn(e instanceof Error ? e.message : String(e));
  }
}

export function serveOn(port: number): void {
  runServe(['--bg', `--https=${port}`, `http://127.0.0.1:${port}`], (detail) => {
    console.warn(`[tailscale] no se pudo exponer el puerto ${port}: ${detail}`);
  });
}

export function serveOff(port: number): void {
  runServe([`--https=${port}`, 'off'], (detail) => {
    console.warn(`[tailscale] cleanup del puerto ${port}: ${detail}`);
  });
}
