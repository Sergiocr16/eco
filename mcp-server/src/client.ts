// HTTP client al backend de Eco. Maneja auth (Bearer del ~/.eco/token) y
// resolución de la URL del backend (variable env > prod :7100 > dev :7050).

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

async function ping(url: string, timeoutMs = 800): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`${url}/health`, { signal: ac.signal });
    clearTimeout(t);
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
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Eco-Client': '1',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
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
