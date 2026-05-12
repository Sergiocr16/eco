// Beep sutil con WebAudio para señalizar que Eco entró en modo comando.
// Sin assets, sin latencia perceptible.

let audioCtx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => { /* noop */ });
  }
  return audioCtx;
}

export function playWakeBeep(volume = 0.06) {
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Doble tono breve: 880 → 1320 Hz. Estilo "pip-pip" sutil.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.setValueAtTime(1320, now + 0.06);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.setValueAtTime(volume, now + 0.11);
  gain.gain.linearRampToValueAtTime(0, now + 0.14);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}

export function playDismissBeep(volume = 0.04) {
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.linearRampToValueAtTime(440, now + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.linearRampToValueAtTime(0, now + 0.14);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}
