// PIN de bloqueo LOCAL del dispositivo. Es una conveniencia de re-entrada
// rápida sobre una sesión de Firebase que sigue viva — NO reemplaza la auth
// real (esa es Firebase). Por eso se guarda solo localmente (hash SHA-256 con
// el uid como sal), por usuario y por dispositivo.

const KEY = (uid: string) => `eco.lockpin.${uid}`;

async function hash(uid: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${uid}::${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hasLockPin(uid: string): boolean {
  try { return !!window.localStorage.getItem(KEY(uid)); } catch { return false; }
}

export async function setLockPin(uid: string, pin: string): Promise<void> {
  try { window.localStorage.setItem(KEY(uid), await hash(uid, pin)); } catch { /* noop */ }
}

export async function verifyLockPin(uid: string, pin: string): Promise<boolean> {
  try {
    const stored = window.localStorage.getItem(KEY(uid));
    return !!stored && stored === await hash(uid, pin);
  } catch { return false; }
}

export function clearLockPin(uid: string): void {
  try { window.localStorage.removeItem(KEY(uid)); } catch { /* noop */ }
}
