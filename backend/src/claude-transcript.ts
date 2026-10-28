// Lector del transcript JSONL que Claude Code escribe por cwd en
// `$CLAUDE_CONFIG_DIR/projects/<cwd-codificado>/<sessionId>.jsonl`. Es la fuente
// más precisa del estado del agente de una burbuja: dice si terminó su turno,
// si tiene una tool pendiente (= ejecutando o bloqueado en un prompt de
// permiso) y cuál fue su último mensaje. El PTY solo sabe si hubo output.
//
// Formato interno de Claude Code — puede cambiar entre versiones. Todo acá es
// best-effort: ante cualquier fallo se devuelve null y el caller cae al PTY.

import { existsSync, readdirSync, statSync, openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type ContentBlock =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; id?: string; name?: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id?: string; content?: unknown; is_error?: boolean }
  | { type: string };

type TranscriptEntry = {
  type: 'user' | 'assistant' | 'system';
  subtype?: string;
  timestamp?: string;
  sessionId?: string;
  gitBranch?: string;
  cwd?: string;
  isSidechain?: boolean;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    stop_reason?: string | null;
  };
};

export type TurnState = 'end_turn' | 'tool_pending' | 'in_progress' | 'user_prompted' | 'unknown';

export type TranscriptState = {
  sessionId: string | null;
  path: string;
  mtimeMs: number;
  turnState: TurnState;
  lastAssistantText: string | null;
  lastAssistantAt: string | null;
  lastUserAt: string | null;
  pendingToolNames: string[];
  gitBranch: string | null;
};

export type ConversationTool = { name: string; inputSummary: string; resultPreview: string | null; isError: boolean };
export type ConversationTurn = {
  userText: string;
  userAt: string | null;
  assistantTexts: string[];
  tools: ConversationTool[];
  endedAt: string | null;
};
export type Conversation = {
  sessionId: string | null;
  path: string;
  turns: ConversationTurn[];
  truncated: boolean;
};

const LAST_TEXT_MAX = 2000;
const TOOL_INPUT_MAX = 120;
const TOOL_RESULT_MAX = 200;
const CONVERSATION_TAIL_STEPS = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024];

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude');
}

// Claude Code reemplaza cada caracter no alfanumérico del cwd absoluto por "-"
// (verificado contra los directorios reales: `/`, `.` y `_` dan `-`, sin
// colapsar repetidos).
export function projectDirFor(cwd: string): string {
  return join(configDir(), 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
}

// Solo los .jsonl de primer nivel (los subdirectorios son subagentes). Si se
// pasa `notBefore`, se exige mtime >= notBefore: una burbuja puede tener varias
// sesiones viejas en el mismo cwd y no queremos reportar una ajena al PTY vivo.
export function findLatestTranscript(cwd: string, notBefore?: number): { path: string; mtimeMs: number } | null {
  const dir = projectDirFor(cwd);
  if (!existsSync(dir)) return null;
  let best: { path: string; mtimeMs: number } | null = null;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (!st.isFile()) continue;
      if (notBefore !== undefined && st.mtimeMs < notBefore) continue;
      if (!best || st.mtimeMs > best.mtimeMs) best = { path: p, mtimeMs: st.mtimeMs };
    }
  } catch {
    return null;
  }
  return best;
}

// Lee los últimos `maxBytes` del archivo. Si no arranca en el byte 0, descarta
// la primera línea (parcial). Los transcripts llegan a decenas de MB por las
// líneas `api-request-blob`; nunca se leen enteros.
function readTail(path: string, maxBytes: number): { text: string; reachedStart: boolean } | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    let off = 0;
    while (off < len) {
      const n = readSync(fd, buf, off, len - off, start + off);
      if (n <= 0) break;
      off += n;
    }
    let text = buf.subarray(0, off).toString('utf-8');
    const reachedStart = start === 0;
    if (!reachedStart) {
      const nl = text.indexOf('\n');
      text = nl >= 0 ? text.slice(nl + 1) : '';
    }
    return { text, reachedStart };
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { closeSync(fd); } catch { /* noop */ } }
  }
}

function parseEntries(text: string): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    let o: unknown;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || typeof o !== 'object') continue;
    const e = o as TranscriptEntry;
    if (e.type !== 'user' && e.type !== 'assistant' && e.type !== 'system') continue;
    if (e.isSidechain) continue;
    out.push(e);
  }
  return out;
}

function blocksOf(e: TranscriptEntry): ContentBlock[] {
  const c = e.message?.content;
  if (typeof c === 'string') return c ? [{ type: 'text', text: c }] : [];
  return Array.isArray(c) ? c : [];
}

// Un slash command local (`/theme`, `/clear`, …) queda en el transcript como
// un `user` con solo `<command-name>` (+ caveat y stdout en entradas hermanas).
// No es un prompt: el modelo nunca lo ve y no abre turno.
const COMMAND_NAME_RE = /<command-name>[\s\S]*?<\/command-name>/g;
function isLocalCommandEntry(e: TranscriptEntry): boolean {
  const raw = blocksOf(e).filter((b): b is { type: 'text'; text?: string } => b.type === 'text').map((b) => b.text ?? '').join('\n');
  if (!/<command-name>/.test(raw)) return false;
  return raw.replace(COMMAND_NAME_RE, '').replace(INJECTED_BLOCK_RE, '').trim() === '';
}

// Un mensaje `user` cuyo contenido son solo tool_result es la respuesta de una
// tool, no un prompt del usuario.
function userPromptText(e: TranscriptEntry): string | null {
  if (e.type !== 'user') return null;
  const blocks = blocksOf(e);
  const texts = blocks.filter((b): b is { type: 'text'; text?: string } => b.type === 'text').map((b) => b.text ?? '');
  if (texts.length === 0) return null;
  return cleanUserText(texts.join('\n'));
}

// Claude Code mete contexto de sistema dentro del texto del usuario; se quita
// para que la conversación se lea como la vio la persona.
// Bloques que Claude Code inyecta en los mensajes "user" y que no escribió la
// persona: recordatorios del sistema, metadata de slash commands y las
// notificaciones de tareas en background (subagentes). Estas últimas se
// resumen en una línea para que el turno no quede vacío.
const INJECTED_BLOCK_RE = /<(system-reminder|command-message|command-args|local-command-stdout|local-command-caveat)>[\s\S]*?<\/\1>/g;
const TASK_NOTIFICATION_RE = /<task-notification>[\s\S]*?<\/task-notification>/g;

function cleanUserText(s: string): string {
  const notifications = (s.match(TASK_NOTIFICATION_RE) ?? []).length;
  const cleaned = s
    .replace(INJECTED_BLOCK_RE, '')
    .replace(TASK_NOTIFICATION_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!notifications) return cleaned;
  const note = notifications === 1
    ? '[notificación de tarea en background]'
    : `[${notifications} notificaciones de tareas en background]`;
  return cleaned ? `${cleaned}\n${note}` : note;
}

function textOf(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is { type: 'text'; text?: string } => b.type === 'text')
    .map((b) => (b.text ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

function summarizeToolInput(input: unknown): string {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    for (const k of ['file_path', 'command', 'pattern', 'path', 'query', 'url', 'description', 'prompt']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, TOOL_INPUT_MAX);
    }
  }
  try { return JSON.stringify(input ?? {}).slice(0, TOOL_INPUT_MAX); } catch { return ''; }
}

function previewToolResult(content: unknown): string {
  if (typeof content === 'string') return content.replace(/\s+/g, ' ').trim().slice(0, TOOL_RESULT_MAX);
  if (Array.isArray(content)) return previewToolResult(textOf(content as ContentBlock[]));
  return '';
}

export function summarizeTranscript(entries: TranscriptEntry[]): Omit<TranscriptState, 'path' | 'mtimeMs'> {
  const pending = new Map<string, string>();
  let lastAssistantText: string | null = null;
  let lastAssistantAt: string | null = null;
  let lastUserAt: string | null = null;
  let last: 'user' | 'assistant' | null = null;
  let lastStop: string | null = null;
  let sessionId: string | null = null;
  let gitBranch: string | null = null;

  for (const e of entries) {
    if (e.sessionId) sessionId = e.sessionId;
    if (e.gitBranch) gitBranch = e.gitBranch;
    if (e.type === 'assistant') {
      const blocks = blocksOf(e);
      for (const b of blocks) {
        if (b.type === 'tool_use') {
          const t = b as { id?: string; name?: string };
          if (t.id) pending.set(t.id, t.name ?? 'tool');
        }
      }
      const text = textOf(blocks);
      if (text) { lastAssistantText = text.slice(-LAST_TEXT_MAX); lastAssistantAt = e.timestamp ?? null; }
      last = 'assistant';
      lastStop = e.message?.stop_reason ?? null;
    } else if (e.type === 'user') {
      const blocks = blocksOf(e);
      let onlyResults = blocks.length > 0;
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const r = b as { tool_use_id?: string };
          if (r.tool_use_id) pending.delete(r.tool_use_id);
        } else {
          onlyResults = false;
        }
      }
      if (!onlyResults && userPromptText(e) && !isLocalCommandEntry(e)) {
        lastUserAt = e.timestamp ?? null;
        last = 'user';
        lastStop = null;
      }
    }
  }

  let turnState: TurnState = 'unknown';
  if (last === 'user') turnState = 'user_prompted';
  else if (last === 'assistant') {
    if (pending.size > 0) turnState = 'tool_pending';
    else if (lastStop === 'end_turn') turnState = 'end_turn';
    else turnState = 'in_progress';
  }

  return {
    sessionId, turnState, lastAssistantText, lastAssistantAt, lastUserAt,
    pendingToolNames: [...pending.values()], gitBranch,
  };
}

export function getClaudeTranscriptState(cwd: string, notBefore?: number): TranscriptState | null {
  try {
    const found = findLatestTranscript(cwd, notBefore);
    if (!found) return null;
    // Cada prompt arrastra cientos de KB de `attachment` (contexto, hooks),
    // así que la entrada "user" puede quedar fuera de una cola fija aunque sea
    // el último prompt. Se agranda la ventana hasta verla o llegar al inicio.
    for (const bytes of CONVERSATION_TAIL_STEPS) {
      const tail = readTail(found.path, bytes);
      if (!tail) return null;
      const entries = parseEntries(tail.text);
      if (entries.length === 0 && !tail.reachedStart) continue;
      if (entries.length === 0) return null;
      const summary = summarizeTranscript(entries);
      if (summary.lastUserAt !== null || tail.reachedStart) {
        return { ...summary, path: found.path, mtimeMs: found.mtimeMs };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildTurns(entries: TranscriptEntry[], includeTools: boolean): { turns: ConversationTurn[]; leadingPartial: boolean } {
  const turns: ConversationTurn[] = [];
  const toolIndex = new Map<string, ConversationTool>();
  let current: ConversationTurn | null = null;
  let leadingPartial = false;

  for (const e of entries) {
    if (e.type === 'user') {
      const prompt = userPromptText(e);
      if (prompt !== null) {
        current = { userText: prompt, userAt: e.timestamp ?? null, assistantTexts: [], tools: [], endedAt: null };
        turns.push(current);
        continue;
      }
      if (includeTools) {
        for (const b of blocksOf(e)) {
          if (b.type !== 'tool_result') continue;
          const r = b as { tool_use_id?: string; content?: unknown; is_error?: boolean };
          const t = r.tool_use_id ? toolIndex.get(r.tool_use_id) : undefined;
          if (t) { t.resultPreview = previewToolResult(r.content); t.isError = !!r.is_error; }
        }
      }
      continue;
    }
    if (e.type !== 'assistant') continue;
    if (!current) {
      // Output de un turno cuyo prompt quedó fuera del tail leído.
      leadingPartial = true;
      current = { userText: '', userAt: null, assistantTexts: [], tools: [], endedAt: null };
      turns.push(current);
    }
    const blocks = blocksOf(e);
    const text = textOf(blocks);
    if (text) current.assistantTexts.push(text);
    if (includeTools) {
      for (const b of blocks) {
        if (b.type !== 'tool_use') continue;
        const t = b as { id?: string; name?: string; input?: unknown };
        const tool: ConversationTool = { name: t.name ?? 'tool', inputSummary: summarizeToolInput(t.input), resultPreview: null, isError: false };
        current.tools.push(tool);
        if (t.id) toolIndex.set(t.id, tool);
      }
    }
    if (e.message?.stop_reason === 'end_turn') current.endedAt = e.timestamp ?? null;
  }
  return { turns, leadingPartial };
}

function conversationChars(turns: ConversationTurn[]): number {
  let n = 0;
  for (const t of turns) {
    n += t.userText.length;
    for (const a of t.assistantTexts) n += a.length;
    for (const tool of t.tools) n += tool.inputSummary.length + (tool.resultPreview?.length ?? 0) + 16;
  }
  return n;
}

export function readConversation(
  cwd: string,
  opts: { lastTurns: number; includeTools: boolean; maxChars: number; notBefore?: number },
): Conversation | null {
  try {
    const found = findLatestTranscript(cwd, opts.notBefore);
    if (!found) return null;
    let sessionId: string | null = null;
    let turns: ConversationTurn[] = [];
    let truncated = false;

    for (const bytes of CONVERSATION_TAIL_STEPS) {
      const tail = readTail(found.path, bytes);
      if (!tail) return null;
      const entries = parseEntries(tail.text);
      sessionId = entries.find((e) => e.sessionId)?.sessionId ?? sessionId;
      const built = buildTurns(entries, opts.includeTools);
      let all = built.turns;
      if (built.leadingPartial && !tail.reachedStart) all = all.slice(1);
      if (all.length >= opts.lastTurns || tail.reachedStart) {
        truncated = all.length > opts.lastTurns || (!tail.reachedStart && all.length < opts.lastTurns);
        turns = all.slice(-opts.lastTurns);
        break;
      }
      turns = all;
      truncated = true;
    }

    // Cap total de caracteres: se descartan los turnos más viejos primero y,
    // si aun así no entra, se recorta el texto del agente del turno más viejo.
    while (turns.length > 1 && conversationChars(turns) > opts.maxChars) { turns.shift(); truncated = true; }
    if (turns.length === 1 && conversationChars(turns) > opts.maxChars) {
      const t = turns[0]!;
      const budget = Math.max(200, opts.maxChars - t.userText.length);
      const joined = t.assistantTexts.join('\n\n');
      t.assistantTexts = [joined.slice(-budget)];
      truncated = true;
    }

    return { sessionId, path: found.path, turns, truncated };
  } catch {
    return null;
  }
}
