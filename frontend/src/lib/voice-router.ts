// Pequeño router para decidir adónde mandar el texto de voz transcrito:
// - 'chat' (default) → input al chat / comandos meta
// - 'pty'             → escribir como input en el PTY activo
//
// Cuando el usuario está mirando el sub-tab Shell de la pestaña Terminal,
// el TerminalPanel setea target='pty' y RealTerminal registra un writer.
// Los comandos meta ("Eco ...") siguen ejecutándose normalmente — solo la
// voz "libre" (sin wake prefix) va al PTY cuando target='pty'.

export type VoiceTarget = 'chat' | 'pty';

let target: VoiceTarget = 'chat';
let ptyWriter: ((text: string) => void) | null = null;

export function setVoiceTarget(t: VoiceTarget): void {
  target = t;
}

export function getVoiceTarget(): VoiceTarget {
  return target;
}

export function registerPtyWriter(fn: (text: string) => void): () => void {
  ptyWriter = fn;
  return () => { if (ptyWriter === fn) ptyWriter = null; };
}

export function writeVoiceToPty(text: string): boolean {
  if (!ptyWriter) return false;
  try { ptyWriter(text); return true; } catch { return false; }
}
