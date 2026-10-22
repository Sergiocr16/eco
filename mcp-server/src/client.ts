// HTTP client al backend de Eco. Maneja auth (Bearer del ~/.eco/token) y
// resolución de la URL del backend (variable env > prod :7100 > dev :7050).
//
// Usamos node:http en vez de fetch global porque el MCP server lo invoca
// claude CLI con el `node` del PATH del user — en Node 16 no hay fetch y
// el ping fallaba silenciosamente catch-eando la ReferenceError, dando
// "no pude contactar el backend" aunque estuviera arriba.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import type { AgentCli } from './host-agent.js';

const TOKEN_PATH = join(homedir(), '.eco', 'token');
const DEFAULT_TIMEOUT_MS = 8000;

function loadToken(): string {
  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      `No se encontró el token de Eco en ${TOKEN_PATH}. ` +
        'Abrí Eco al menos una vez para que se genere.',
    );
  }
  const raw = readFileSync(TOKEN_PATH, 'utf-8').trim();
  if (raw.length < 32) {
    throw new Error(`Token de Eco inválido en ${TOKEN_PATH}.`);
  }
  return raw;
}

// Wrapper minimal sobre http.request para reemplazar `fetch`. Devuelve
// { status, body, ok }. ok = status >= 200 && status < 300. timeout en ms.
type HttpResp = { status: number; body: string; ok: boolean };

function httpRequest(
  urlStr: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(urlStr); } catch (e) { return reject(e); }
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: `${u.pathname}${u.search}`,
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Length': Buffer.byteLength(opts.body).toString() } : {}),
        ...(opts.headers ?? {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        const status = res.statusCode ?? 0;
        resolve({ status, body, ok: status >= 200 && status < 300 });
      });
    });
    req.on('error', reject);
    if (opts.timeoutMs) {
      req.setTimeout(opts.timeoutMs, () => {
        req.destroy(new Error(`timeout ${opts.timeoutMs}ms`));
      });
    }
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

async function ping(url: string, timeoutMs = 800): Promise<boolean> {
  try {
    const res = await httpRequest(`${url}/health`, { timeoutMs });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveBackendUrl(): Promise<string> {
  const env = process.env.ECO_BACKEND_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  // Prod (.dmg) sirve en :7100, dev en :7050. Probamos ambos en orden;
  // se queda el primero que responda /health.
  for (const port of [7100, 7050, 7000]) {
    const url = `http://127.0.0.1:${port}`;
    if (await ping(url)) return url;
  }
  throw new Error(
    'No se pudo contactar al backend de Eco en 127.0.0.1:{7100,7050,7000}. ' +
      '¿Está Eco corriendo? Probá abrir Eco.app o `npm run dev`.',
  );
}

let baseUrlCache: string | null = null;
let tokenCache: string | null = null;

async function getBaseUrl(): Promise<string> {
  if (baseUrlCache) return baseUrlCache;
  baseUrlCache = await resolveBackendUrl();
  return baseUrlCache;
}

function getToken(): string {
  if (tokenCache) return tokenCache;
  tokenCache = loadToken();
  return tokenCache;
}

type FetchOpts = {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
};

export type EcoApiError = {
  status: number;
  code: string;
  message: string;
};

async function call(path: string, opts: FetchOpts = {}): Promise<unknown> {
  const base = await getBaseUrl();
  const token = getToken();
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const res = await httpRequest(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Eco-Client': '1',
      ...(bodyStr !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: bodyStr,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const text = res.body;
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* deja parsed null */ }
  if (!res.ok) {
    const err: EcoApiError = {
      status: res.status,
      code: (parsed as { error?: string })?.error ?? `http.${res.status}`,
      message: (parsed as { message?: string })?.message ?? text.slice(0, 200),
    };
    throw err;
  }
  return parsed;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

// ─── Tipos espejo de las respuestas del backend ──────────────────────────────

export type CreateBubbleInput = {
  title: string;
  workspace?: string;
  baseBranch?: string;
  initialPrompt?: string;
  agent?: AgentCli;
};

export type CreateBubbleResult = {
  ok: true;
  bubbleId: string;
  workspace: string | null;
  worktreePath: string | null;
};

export type SendToBubbleResult = {
  ok: true;
  bubbleId: string;
  workspace: string | null;
  ptyId: string;
  spawned: boolean;
  agentWasBusy: boolean;
  readyAfterMs: number;
  ready: boolean;
  /** true = el transcript registró el prompt; false = no apareció (ver `terminal`); null = no verificable (Codex / agente ocupado). */
  delivered: boolean | null;
  terminal?: string;
};

export type BubbleSummary = {
  id: string;
  title: string;
  workspace: string;
  status: string;
  archived: boolean;
  updatedAt: number;
  ownerId?: string;
  lastMsgPreview?: string;
  categoryIds?: string[];
  categories?: string[];
  baseBranch?: string;
  running?: boolean;
  busy?: boolean;
};

export type Category = { id: string; name: string; color: string };

export type BubbleState = 'archived' | 'offline' | 'working' | 'waiting_permission' | 'waiting_input' | 'idle';

export type BubbleStatus = {
  ok: true;
  bubble: {
    id: string;
    title: string;
    workspace: string | null;
    worktree: string | null;
    baseBranch: string | null;
    archived: boolean;
    updatedAt: number;
    categories: Category[];
  };
  state: BubbleState;
  reason: string;
  terminals: Array<{ ptyId: string; agent: string; busy: boolean; idleForMs: number; startedAt: number; cwd: string }>;
  devServers: Array<{ role: string; status: string; port: number; url: string; command: string; exitCode: number | null; startedAt: number | null; exitedAt: number | null }>;
  transcript: {
    turnState: string;
    lastAssistantText: string | null;
    lastAssistantAt: string | null;
    lastUserAt: string | null;
    pendingToolNames: string[];
    sessionId: string | null;
  } | null;
  lastOutput: string;
  git: {
    branch: string | null;
    expectedBranch: string;
    lastCommit: { sha: string; subject: string } | null;
    aheadBehind: { ahead: number; behind: number } | null;
    changedFiles: { count: number; sample: Array<{ path: string; change: string; unstaged: boolean }> };
    pr: { number: number; title: string; url: string; state: string; isDraft: boolean; mergeable: string; headRefName: string; baseRefName: string } | null;
  } | null;
};

export type WaitResult = BubbleStatus & { timedOut: boolean; waitedMs: number; sawOutput: boolean };

export type ConversationResult =
  | {
    ok: true; bubbleId: string; source: 'transcript'; sessionId: string | null; path: string; truncated: boolean;
    turns: Array<{
      userText: string; userAt: string | null; assistantTexts: string[]; endedAt: string | null;
      tools: Array<{ name: string; inputSummary: string; resultPreview: string | null; isError: boolean }>;
    }>;
  }
  | { ok: true; bubbleId: string; source: 'pty'; text: string; note: string };

export type DevResult = {
  ok: true;
  bubbleId: string;
  action: string;
  dual: boolean;
  results: Array<{ role: string; ok: boolean; error?: string }>;
  servers: Array<{ role: string; status: string; port: number; url: string; command: string; exitCode: number | null }>;
  logs: Record<string, string>;
};

export type DiffResult =
  | { ok: true; scope: 'file'; path: string; mode: string; hasChanges: boolean; diff: string; truncated: boolean; message: string | null }
  | { ok: true; scope: 'worktree'; dir: string; git: boolean; stat: string; untracked: string[]; diff: string; truncated: boolean; hasChanges: boolean };

// ─── Llamadas ───────────────────────────────────────────────────────────────

export async function createBubble(input: CreateBubbleInput): Promise<CreateBubbleResult> {
  const body: Record<string, unknown> = { title: input.title };
  if (input.workspace) body.workspace = input.workspace;
  if (input.baseBranch) body.baseBranch = input.baseBranch;
  if (input.initialPrompt) body.initialPrompt = input.initialPrompt;
  if (input.agent) body.agent = input.agent;
  return (await call('/bubble/create', { method: 'POST', body })) as CreateBubbleResult;
}

// El backend espera el cold start del CLI (hasta 15 s) antes de responder.
export async function sendToBubble(bubbleId: string, text: string, agent?: AgentCli): Promise<SendToBubbleResult> {
  const body: Record<string, unknown> = { bubbleId, text };
  if (agent) body.agent = agent;
  return (await call('/bubble/send', { method: 'POST', body, timeoutMs: 30_000 })) as SendToBubbleResult;
}

export type SyncError = { at: number; message: string; hint: string };
export type ListBubblesResult = { bubbles: BubbleSummary[]; lastSync: number; syncError?: SyncError | null };

export async function listBubbles(): Promise<ListBubblesResult> {
  return (await call('/bubbles')) as ListBubblesResult;
}

export async function listWorkspaces(): Promise<string[]> {
  const r = (await call('/workspaces')) as { workspaces?: string[] } | string[];
  if (Array.isArray(r)) return r;
  return r.workspaces ?? [];
}

export async function getBubbleStatus(
  bubbleId: string,
  opts: { lines?: number; transcript?: boolean; git?: boolean; agent?: AgentCli } = {},
): Promise<BubbleStatus> {
  const q = qs({
    bubbleId,
    lines: opts.lines,
    transcript: opts.transcript === false ? 0 : undefined,
    git: opts.git === false ? 0 : undefined,
    agent: opts.agent,
  });
  return (await call(`/bubble/status${q}`, { timeoutMs: 20_000 })) as BubbleStatus;
}

export async function waitForBubble(
  bubbleId: string,
  opts: { timeoutMs: number; agent?: AgentCli; requireActivity?: boolean; lines?: number },
): Promise<WaitResult> {
  const body: Record<string, unknown> = { bubbleId, timeoutMs: opts.timeoutMs };
  if (opts.agent) body.agent = opts.agent;
  if (opts.requireActivity) body.requireActivity = true;
  if (opts.lines) body.lines = opts.lines;
  return (await call('/bubble/wait', { method: 'POST', body, timeoutMs: opts.timeoutMs + 15_000 })) as WaitResult;
}

export async function sendKeys(bubbleId: string, keys: string[], agent?: AgentCli): Promise<{ ok: true; ptyId: string; sent: string[] }> {
  const body: Record<string, unknown> = { bubbleId, keys };
  if (agent) body.agent = agent;
  return (await call('/bubble/keys', { method: 'POST', body, timeoutMs: 15_000 })) as { ok: true; ptyId: string; sent: string[] };
}

export async function requestCloseBubble(bubbleId: string, permanent: boolean): Promise<{ ok: true; confirmed: boolean; archived: boolean; alreadyArchived?: boolean; permanent?: boolean }> {
  return (await call('/bubble/request-close', { method: 'POST', body: { bubbleId, permanent }, timeoutMs: 12_000 })) as { ok: true; confirmed: boolean; archived: boolean; alreadyArchived?: boolean; permanent?: boolean };
}

export async function renameBubble(bubbleId: string, title: string): Promise<{ ok: true; title: string; confirmed: boolean }> {
  return (await call('/bubble/rename', { method: 'POST', body: { bubbleId, title }, timeoutMs: 12_000 })) as { ok: true; title: string; confirmed: boolean };
}

export async function focusBubble(bubbleId: string): Promise<{ ok: true }> {
  return (await call('/bubble/focus', { method: 'POST', body: { bubbleId } })) as { ok: true };
}

export async function setBubbleCategories(
  bubbleId: string,
  mode: 'set' | 'add' | 'remove' | 'clear',
  category?: string,
): Promise<{ ok: true; confirmed: boolean; unchanged?: boolean; categoryIds: string[]; categories: string[] }> {
  const body: Record<string, unknown> = { bubbleId, mode };
  if (category) body.category = category;
  return (await call('/bubble/categories', { method: 'POST', body, timeoutMs: 12_000 })) as { ok: true; confirmed: boolean; unchanged?: boolean; categoryIds: string[]; categories: string[] };
}

export async function listCategories(): Promise<Category[]> {
  const r = (await call('/categories')) as { categories: Category[] };
  return r.categories ?? [];
}

export async function devServerAction(
  bubbleId: string,
  action: 'start' | 'stop' | 'restart' | 'status',
  role?: 'main' | 'frontend' | 'backend',
): Promise<DevResult> {
  const body: Record<string, unknown> = { bubbleId, action };
  if (role) body.role = role;
  return (await call('/bubble/dev', { method: 'POST', body, timeoutMs: 150_000 })) as DevResult;
}

export async function getBubbleDiff(bubbleId: string, path?: string, maxBytes?: number): Promise<DiffResult> {
  const body: Record<string, unknown> = { bubbleId };
  if (path) body.path = path;
  if (maxBytes) body.maxBytes = maxBytes;
  return (await call('/bubble/diff', { method: 'POST', body, timeoutMs: 30_000 })) as DiffResult;
}

export async function readBubbleConversation(
  bubbleId: string,
  opts: { lastTurns?: number; includeTools?: boolean; maxChars?: number; agent?: AgentCli } = {},
): Promise<ConversationResult> {
  const q = qs({
    bubbleId,
    lastTurns: opts.lastTurns,
    includeTools: opts.includeTools ? 1 : undefined,
    maxChars: opts.maxChars,
    agent: opts.agent,
  });
  return (await call(`/bubble/transcript${q}`, { timeoutMs: 20_000 })) as ConversationResult;
}
