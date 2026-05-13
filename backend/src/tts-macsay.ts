// macOS `say` TTS backend.
//
// Usa /usr/bin/say (incluido en cada macOS) con las voces que el usuario tenga
// descargadas. Las voces "Premium" / "Enhanced" suenan casi humanas y son
// gratis — se bajan desde Ajustes → Accesibilidad → Contenido hablado.
//
// El sintetizador escribe WAV a un temp file y lo devuelve como Buffer; eso
// evita líos con AIFF en el browser y mantiene la misma API que Piper.

import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SAY_BIN = '/usr/bin/say';

export type MacSayVoice = {
  id: string;        // nombre exacto que recibe `say -v`
  name: string;      // mismo, presentado al usuario
  language: string;  // ej. "es_MX", "es_ES"
  premium: boolean;  // true si trae "(Premium)" o "(Enhanced)" en el nombre
};

// TTL corto: si el usuario descarga una voz Premium nueva desde Ajustes,
// la verá sin tener que reiniciar el backend.
const VOICES_CACHE_TTL_MS = 60_000;
let voicesCache: { at: number; voices: MacSayVoice[] } | null = null;

export function isMacSayAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SAY_BIN);
}

export async function listMacSayVoices(): Promise<MacSayVoice[]> {
  if (!isMacSayAvailable()) return [];
  if (voicesCache && Date.now() - voicesCache.at < VOICES_CACHE_TTL_MS) {
    return voicesCache.voices;
  }
  return new Promise((resolve) => {
    const child = spawn(SAY_BIN, ['-v', '?'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf-8');
      const voices: MacSayVoice[] = [];
      for (const line of text.split('\n')) {
        // Línea típica: "Mónica (Premium)      es_ES    # ¡Hola! Me llamo..."
        // El nombre puede tener espacios y paréntesis; el código de idioma es
        // siempre xx_YY; los separa whitespace de 2+ espacios.
        const m = /^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})\s/.exec(line);
        if (!m) continue;
        const name = m[1]!.trim();
        const language = m[2]!;
        const premium = /\((Premium|Enhanced)\)/i.test(name);
        voices.push({ id: name, name, language, premium });
      }
      voicesCache = { at: Date.now(), voices };
      resolve(voices);
    });
    child.on('error', () => resolve([]));
  });
}

export async function synthesizeMacSay(
  text: string,
  voice: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!isMacSayAvailable()) throw new Error('say no disponible en este sistema');

  // Validamos que la voz pedida exista en el listado del sistema. Esto evita
  // que un voice id arbitrario pase por la CLI y previene cualquier intento
  // de inyectar flags (aunque spawn() ya no usa shell).
  const voices = await listMacSayVoices();
  if (!voices.some((v) => v.id === voice)) {
    throw new Error(`Voz no encontrada: ${voice}`);
  }

  const tmpfile = join(
    tmpdir(),
    `eco-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`,
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        SAY_BIN,
        [
          '-v', voice,
          '--file-format=WAVE',
          '--data-format=LEI16@22050',
          '-o', tmpfile,
          text,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'], signal },
      );
      const errChunks: Buffer[] = [];
      let killed = false;

      const killTimeout = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
      }, 30_000);

      child.stderr.on('data', (c: Buffer) => errChunks.push(c));
      child.on('error', (err) => {
        clearTimeout(killTimeout);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(killTimeout);
        if (killed) return reject(new Error('TTS timeout'));
        if (code !== 0) {
          const errText = Buffer.concat(errChunks).toString('utf-8').slice(-300);
          return reject(new Error(`say exited ${code}: ${errText}`));
        }
        resolve();
      });
    });
    return await readFile(tmpfile);
  } finally {
    try { await unlink(tmpfile); } catch { /* noop */ }
  }
}
