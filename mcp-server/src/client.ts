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

const TOKEN_PATH = join(homedir(), '.eco', 'token');

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
    timeoutMs: 8000,
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

export type CreateBubbleInput = {
  title: string;
  workspace?: string;
  baseBranch?: string;
  initialPrompt?: string;
};

export type CreateBubbleResult = {
  ok: true;
  bubbleId: string;
  workspace: string | null;
  worktreePath: string | null;
};

export async function createBubble(input: CreateBubbleInput): Promise<CreateBubbleResult> {
  const body: Record<string, unknown> = { title: input.title };
  if (input.workspace) body.workspace = input.workspace;
  if (input.baseBranch) body.baseBranch = input.baseBranch;
  if (input.initialPrompt) body.initialPrompt = input.initialPrompt;
  return (await call('/bubble/create', { method: 'POST', body })) as CreateBubbleResult;
}

export type SendToBubbleResult = {
  ok: true;
  bubbleId: string;
  workspace: string | null;
};

export async function sendToBubble(bubbleId: string, text: string): Promise<SendToBubbleResult> {
  return (await call('/bubble/send', { method: 'POST', body: { bubbleId, text } })) as SendToBubbleResult;
}

export type BubbleSummary = {
  id: string;
  title: string;
  workspace: string;
  status: string;
  archived: boolean;
  updatedAt: number;
};

export async function listBubbles(): Promise<{ bubbles: BubbleSummary[]; lastSync: number }> {
  const r = (await call('/bubbles')) as { bubbles: BubbleSummary[]; lastSync: number };
  return r;
}

export async function listWorkspaces(): Promise<string[]> {
  const r = (await call('/workspaces')) as { workspaces?: string[] } | string[];
  if (Array.isArray(r)) return r;
  return r.workspaces ?? [];
}
