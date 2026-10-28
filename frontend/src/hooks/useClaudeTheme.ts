import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

// Tema activo del CLI de Claude (`/theme`). Lo alimenta el backend: snapshot
// al conectar el WS + push `claude_theme` cuando cambia `~/.claude/settings.json`
// (ver backend/src/claude-theme.ts). Store de módulo compartido por todas las
// terminales, con un fetch inicial por si el WS tarda en conectar.
export type ClaudeThemeInfo = { id: string; base: 'dark' | 'light'; background: string | null };

const DEFAULT: ClaudeThemeInfo = { id: 'dark', base: 'dark', background: null };
let current: ClaudeThemeInfo = DEFAULT;
let fetched = false;
const subs = new Set<() => void>();

export function setClaudeTheme(next: ClaudeThemeInfo): void {
  fetched = true;
  if (next.id === current.id && next.base === current.base && next.background === current.background) return;
  current = next;
  for (const fn of subs) { try { fn(); } catch { /* noop */ } }
}

export function getClaudeTheme(): ClaudeThemeInfo { return current; }

async function fetchOnce(): Promise<void> {
  if (fetched) return;
  fetched = true;
  try {
    const r = await apiFetch('/config/claude-theme');
    if (!r.ok) return;
    const j = (await r.json()) as Partial<ClaudeThemeInfo>;
    if (j && (j.base === 'dark' || j.base === 'light')) {
      setClaudeTheme({ id: String(j.id ?? j.base), base: j.base, background: typeof j.background === 'string' ? j.background : null });
    }
  } catch { fetched = false; }
}

export function useClaudeTheme(): ClaudeThemeInfo {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    subs.add(fn);
    void fetchOnce();
    return () => { subs.delete(fn); };
  }, []);
  return current;
}
