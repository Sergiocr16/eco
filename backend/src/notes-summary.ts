// Resumen de una conversación con el agente, generado one-shot por
// `claude -p`. Mismo patrón que `suggestCommitMessage` (`git-ops.ts:682`).
// El endpoint `/notes/summarize` lo invoca cuando el user pulsa el botón
// "Resumen" en la pestaña Notas.

import { spawnSync } from 'node:child_process';
import { buildSafeEnv } from './security.js';
import { config } from './config.js';

const MAX_MESSAGES = 30;          // últimos N (chat opcional)
const MAX_TEXT_PER_MSG = 2000;    // caracteres por message
const MAX_PTY_BUFFER = 60_000;    // últimos chars del terminal (~60KB)
const CLAUDE_TIMEOUT_MS = 90_000; // resumen puede tardar más que un commit

export type SummaryMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts?: number;
};

export type SummaryResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

// Limpia escapes ANSI del output del PTY — códigos de color, cursor-move,
// clear-line, etc. Sin esto el modelo recibe basura visual.
function stripAnsi(s: string): string {
  // ESC[ … letra (CSI) + ESC] … BEL/ST (OSC) + ESC + simple letras.
  // Patrón estándar de "ansi-regex" pero inline para no agregar dep.
  // eslint-disable-next-line no-control-regex
  const re = /[][[\]()#;?]*(?:(?:(?:[a-zA-Z0-9*;]*)?)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PRZcf-ntqry=><~]))/g;
  return s.replace(re, '');
}

export function summarizeBubble(args: {
  bubbleTitle: string;
  workspace?: string;
  ptyBuffer?: string;
  messages?: SummaryMessage[];
}): SummaryResult {
  const { bubbleTitle, workspace, ptyBuffer, messages } = args;

  const hasPty = !!(ptyBuffer && ptyBuffer.trim());
  const hasMessages = !!(messages && messages.length > 0);
  if (!hasPty && !hasMessages) {
    return { ok: false, error: 'Sin actividad para resumir' };
  }

  // Slimming.
  const ptyClean = hasPty
    ? stripAnsi(ptyBuffer!).slice(-MAX_PTY_BUFFER)
    : '';

  const chatSlim = hasMessages
    ? messages!
        .slice(-MAX_MESSAGES)
        .map((m) => `[${m.role}] ${(m.text ?? '').slice(0, MAX_TEXT_PER_MSG)}`)
        .join('\n\n')
    : '';

  const prompt = [
    `Estoy trabajando en un agente llamado "${bubbleTitle}"${workspace ? ` en el workspace ${workspace}` : ''}.`,
    'La fuente PRINCIPAL del trabajo es la sesión del terminal (Claude CLI corriendo).',
    'El historial del chat es opcional/secundario (puede estar vacío).',
    '',
    hasPty ? '=== terminal (output más reciente, sin ANSI) ===' : '',
    hasPty ? ptyClean : '',
    hasPty ? '=== fin del terminal ===' : '',
    '',
    hasMessages ? '=== chat (opcional) ===' : '',
    hasMessages ? chatSlim : '',
    hasMessages ? '=== fin del chat ===' : '',
    '',
    'Resumí el estado actual del trabajo en markdown ESPAÑOL con tres secciones:',
    '',
    '## Qué se estaba haciendo',
    '## En qué quedamos',
    '## Próximos pasos',
    '',
    'Reglas:',
    '- Basate principalmente en lo que ves en el terminal (qué archivos se editaron, qué comandos se corrieron, qué errores aparecieron, qué decidió el agente).',
    '- Los "Próximos pasos" deben ser concretos y accionables — preferí tareas específicas a generalidades.',
    '- Devolveme SOLO el markdown — sin preamble, sin code fences alrededor del documento, sin comillas externas.',
    '- Cada sección puede tener viñetas o párrafos cortos — lo que sea más claro.',
    '- Si una sección no aplica, escribí "—" o "Nada pendiente".',
    '- No inventes detalles que no estén en las fuentes.',
  ].filter(Boolean).join('\n');

  const r = spawnSync(config.claudeCliPath, ['-p', prompt], {
    cwd: workspace || process.cwd(),
    timeout: CLAUDE_TIMEOUT_MS,
    encoding: 'utf-8',
    env: buildSafeEnv(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
  });

  if (r.status !== 0) {
    const err = ((r.stderr ?? '').toString() || (r.stdout ?? '').toString()).trim();
    return { ok: false, error: err.slice(0, 600) || 'claude -p falló' };
  }

  const raw = ((r.stdout ?? '').toString()).trim();
  // Limpiamos code fences accidentales que el modelo a veces agrega aunque
  // se lo pedimos explícito.
  const cleaned = raw
    .replace(/^```(?:markdown|md)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  if (!cleaned) {
    return { ok: false, error: 'Respuesta vacía' };
  }

  return { ok: true, markdown: cleaned };
}
