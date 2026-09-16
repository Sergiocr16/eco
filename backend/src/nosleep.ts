// "No dormir aunque cierres la tapa" (solo macOS).
//
// `pmset -a disablesleep 1` es la única forma de evitar el sleep en clamshell:
// el powerSaveBlocker de Electron mantiene despierta la pantalla/el sistema
// mientras la app corre, pero cerrar la tapa igual duerme la Mac.
//
// Escribir el flag necesita root. Desde una app de GUI no hay TTY donde pedir
// la contraseña, así que el camino es `osascript … with administrator
// privileges`: abre el diálogo nativo de macOS (Touch ID / contraseña) y corre
// el comando como root. Un `sudo` pelado fallaría con "no tty present".

import { execFile } from 'node:child_process';

const TIMEOUT_MS = 120_000; // el diálogo de autorización espera al usuario

export type NoSleepStatus = {
  /** false en Windows/Linux: la UI esconde el control entero. */
  supported: boolean;
  enabled: boolean;
  /** Motivo del último fallo (autorización cancelada, pmset ausente…). */
  error?: string;
};

export function noSleepSupported(): boolean {
  return process.platform === 'darwin';
}

function run(bin: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        out: String(stdout ?? ''),
        err: String(stderr ?? '') || (error ? error.message : ''),
      });
    });
  });
}

// Leer NO necesita root: `pmset -g` imprime "SleepDisabled  1" en la sección
// system-wide. Cuando el flag está en 0 macOS a veces omite la línea, así que
// la ausencia se interpreta como apagado.
export async function readNoSleep(): Promise<boolean> {
  if (!noSleepSupported()) return false;
  const r = await run('pmset', ['-g']);
  if (!r.ok) return false;
  const m = /SleepDisabled\s+(\d+)/i.exec(r.out);
  return m ? m[1] !== '0' : false;
}

export async function noSleepStatus(): Promise<NoSleepStatus> {
  if (!noSleepSupported()) return { supported: false, enabled: false };
  return { supported: true, enabled: await readNoSleep() };
}

export async function setNoSleep(enabled: boolean): Promise<NoSleepStatus> {
  if (!noSleepSupported()) return { supported: false, enabled: false };

  // El comando va embebido en un AppleScript, así que el string no puede
  // venir del usuario: es literal salvo el 0/1 que decidimos acá.
  const flag = enabled ? '1' : '0';
  const script = `do shell script "/usr/bin/pmset -a disablesleep ${flag}" with administrator privileges`;
  const r = await run('osascript', ['-e', script]);

  const status = await noSleepStatus();
  if (!r.ok) {
    // -128 = el usuario canceló el diálogo de autorización.
    const detail = /-128/.test(r.err) ? 'cancelled' : (r.err.trim() || 'osascript falló');
    return { ...status, error: detail };
  }
  return status;
}
