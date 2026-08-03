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

// Wrapper que instala "Install CLI" del menú de Tailscale. Es un shell script
// de 3 líneas que delega en el binario de adentro del .app.
const MAC_CLI_WRAPPER = '/usr/local/bin/tailscale';
const MAC_APP_BIN = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';

// El wrapper va PRIMERO. Ejecutar el Mach-O de adentro de otra .app directamente
// desde una app empaquetada cuelga: el proceso arranca y nunca termina (se
// diagnosticó como "timeout ejecutando …/MacOS/Tailscale" desde Eco.app,
// mientras el mismo comando respondía al instante desde una terminal).
export function tailscaleBin(): string {
  const env = process.env.ECO_TAILSCALE_BIN?.trim();
  if (env && existsSync(env)) return env;
  if (existsSync(MAC_CLI_WRAPPER)) return MAC_CLI_WRAPPER;
  if (existsSync(MAC_APP_BIN)) return MAC_APP_BIN;
  return 'tailscale';
}

function runServe(args: string[], onWarn: (detail: string) => void): void {
  let stderr = '';
  try {
    const proc = spawn(tailscaleBin(), ['serve', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.stderr?.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2000); });
    // Mismo motivo que en tailnetProbe: desde la app empaquetada el CLI de
    // Tailscale tarda mucho más que desde una terminal.
    const killer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      onWarn(stderr.trim() || 'timeout (¿Serve habilitado en la tailnet?)');
    }, 30_000);
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

// Publica Eco entero en https://<maquina>.ts.net (puerto 443) apuntando al
// backend local. A diferencia de serveOn/serveOff —que mapean puerto→mismo
// puerto para las previews de dev servers— acá el puerto público y el destino
// son distintos: 443 → 7100.
export function servePublic(targetPort: number, onWarn?: (d: string) => void): void {
  runServe(['--bg', '--https=443', `http://127.0.0.1:${targetPort}`], (detail) => {
    console.warn(`[tailscale] no se pudo publicar Eco en :443 -> ${targetPort}: ${detail}`);
    onWarn?.(detail);
  });
}

export function servePublicOff(): void {
  runServe(['--https=443', 'off'], (detail) => {
    console.warn(`[tailscale] cleanup de :443: ${detail}`);
  });
}

export type TailnetProbe = { host: string | null; detail: string };

// Nombre DNS de esta máquina en la tailnet (<maquina>.<tailnet>.ts.net).
// Devuelve también el motivo cuando no se pudo: sin el detalle, un fallo acá
// es indistinguible de "Tailscale apagado" y no hay forma de diagnosticarlo
// desde la app empaquetada (macOS puede bloquear el spawn del binario de otra
// app, y ese error solo aparece en stderr).
export async function tailnetProbe(): Promise<TailnetProbe> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (host: string | null, detail: string) => {
      if (!done) { done = true; resolve({ host, detail }); }
    };
    const bin = tailscaleBin();
    try {
      const proc = spawn(bin, ['status', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stdout?.on('data', (c: Buffer) => { out = (out + c.toString()).slice(0, 512 * 1024); });
      proc.stderr?.on('data', (c: Buffer) => { err = (err + c.toString()).slice(-2000); });
      // 30s y no 8: el MISMO comando responde al instante desde una terminal
      // pero tarda decenas de segundos cuando lo spawnea la app empaquetada
      // (el CLI de Tailscale es sandboxed y arranca por un camino más lento
      // cuando el padre es otra .app). Con 8s abortábamos un comando que iba
      // a funcionar — se veía como "Tailscale apagado" con Tailscale corriendo.
      const killer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* noop */ }
        finish(null, `timeout (>30s) ejecutando ${bin}`);
      }, 30_000);
      proc.on('error', (e) => { clearTimeout(killer); finish(null, `spawn falló: ${e.message}`); });
      proc.on('exit', (code) => {
        clearTimeout(killer);
        if (code !== 0) return finish(null, `exit ${code}: ${err.trim() || 'sin stderr'}`);
        try {
          const j = JSON.parse(out) as { BackendState?: string; Self?: { DNSName?: string } };
          if (j.BackendState !== 'Running') {
            return finish(null, `Tailscale en estado ${j.BackendState ?? 'desconocido'}`);
          }
          const dns = String(j.Self?.DNSName ?? '').replace(/\.$/, '').toLowerCase();
          if (!dns) return finish(null, 'sin DNSName (¿MagicDNS apagado?)');
          finish(dns, 'ok');
        } catch (e) {
          finish(null, `JSON inválido (${out.length} bytes): ${e instanceof Error ? e.message : String(e)}`);
        }
      });
    } catch (e) {
      finish(null, `spawn lanzó: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

export async function tailnetHostname(): Promise<string | null> {
  return (await tailnetProbe()).host;
}
