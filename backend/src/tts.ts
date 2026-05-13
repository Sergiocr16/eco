import { spawn } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PIPER_ROOT = join(__dirname, '..', 'piper');
const PIPER_BIN = process.env.ECO_PIPER_BIN ?? join(PIPER_ROOT, 'piper', 'piper');
const VOICES_DIR = process.env.ECO_PIPER_VOICES ?? join(PIPER_ROOT, 'voices');

// Schema unificado para ambos backends (piper y macsay). El voice id de
// macsay puede contener espacios y paréntesis ("Mónica (Premium)"), por eso
// no aplicamos la regex estricta acá — cada backend valida lo suyo.
export const TTSRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().min(1).max(120).optional(),
  backend: z.enum(['piper', 'macsay']).optional(),
});

export type TTSRequest = z.infer<typeof TTSRequestSchema>;

export type VoiceInfo = {
  id: string;
  name: string;
  language: string;
  quality: string;
  bytes: number;
};

const VOICE_NAME_RE = /^([a-z]{2}_[A-Z]{2})-([a-z0-9_]+)-(low|medium|high|x_low)\.onnx$/;

export function isPiperAvailable(): boolean {
  return existsSync(PIPER_BIN) && existsSync(VOICES_DIR);
}

export function listVoices(): VoiceInfo[] {
  if (!existsSync(VOICES_DIR)) return [];
  const files = readdirSync(VOICES_DIR).filter((f) => f.endsWith('.onnx'));
  const voices: VoiceInfo[] = [];
  for (const f of files) {
    const match = VOICE_NAME_RE.exec(f);
    if (!match) continue;
    const [, language, speakerRaw, quality] = match;
    const id = basename(f, extname(f));
    let prettyName = (speakerRaw ?? id).replace(/_/g, ' ');
    prettyName = prettyName.charAt(0).toUpperCase() + prettyName.slice(1);
    let bytes = 0;
    try { bytes = readFileSync(join(VOICES_DIR, f)).byteLength; } catch { /* noop */ }
    voices.push({ id, name: prettyName, language: language ?? '', quality: quality ?? '', bytes });
  }
  return voices.sort((a, b) => {
    if (a.language.startsWith('es') && !b.language.startsWith('es')) return -1;
    if (!a.language.startsWith('es') && b.language.startsWith('es')) return 1;
    const qOrder = { high: 0, medium: 1, low: 2, x_low: 3 } as Record<string, number>;
    return (qOrder[a.quality] ?? 9) - (qOrder[b.quality] ?? 9);
  });
}

export function defaultVoiceId(): string | null {
  const voices = listVoices();
  return voices[0]?.id ?? null;
}

const PIPER_VOICE_RE = /^[A-Za-z0-9_.-]+$/;

export async function synthesize(req: TTSRequest, signal?: AbortSignal): Promise<Buffer> {
  const voiceId = req.voice ?? defaultVoiceId();
  if (!voiceId) throw new Error('No hay voces Piper instaladas');
  // Validamos el voice id contra una whitelist estricta — el id se usa como
  // componente de path; cualquier intento de traversal acá se bloquea.
  if (!PIPER_VOICE_RE.test(voiceId)) throw new Error(`Voz inválida: ${voiceId}`);

  const modelPath = join(VOICES_DIR, `${voiceId}.onnx`);
  if (!existsSync(modelPath)) throw new Error(`Voz no encontrada: ${voiceId}`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      PIPER_BIN,
      ['--model', modelPath, '--output_file', '-', '--json-input'],
      {
        cwd: join(PIPER_ROOT, 'piper'),
        signal,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { LD_LIBRARY_PATH: join(PIPER_ROOT, 'piper'), PATH: process.env.PATH ?? '' },
      },
    );

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let killed = false;

    const killTimeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
    }, 30_000);

    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));

    child.on('error', (err) => {
      clearTimeout(killTimeout);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(killTimeout);
      if (killed) return reject(new Error('TTS timeout'));
      if (code !== 0) {
        const errText = Buffer.concat(errChunks).toString('utf-8').slice(-500);
        return reject(new Error(`piper exited ${code}: ${errText}`));
      }
      resolve(Buffer.concat(chunks));
    });

    const input = JSON.stringify({ text: req.text }) + '\n';
    child.stdin.write(input);
    child.stdin.end();
  });
}
