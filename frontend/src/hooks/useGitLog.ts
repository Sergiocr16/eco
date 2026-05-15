import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { on as ecoOn } from '@/lib/eco-bus';

export type LogEntry = {
  sha: string;
  abbrev: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  body: string;
  refs: string[];
  parents: string[];
};

export type UseGitLogOpts = {
  branch?: string;
  path?: string;
  all?: boolean;
  pageSize?: number;
};

export type UseGitLogResult = {
  commits: LogEntry[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
};

const DEFAULT_PAGE_SIZE = 80;

// Cache global por (workspace, bubbleId, branch ?? '', path ?? '', all).
// Sobrevive al unmount para que volver a la sub-pestaña Historial muestre
// los commits viejos al instante mientras refresca en background.
type CacheEntry = { commits: LogEntry[]; hasMore: boolean; ts: number };
const cache = new Map<string, CacheEntry>();
const cacheKey = (workspace: string, bubbleId: string, branch: string, pathF: string, all: boolean) =>
  `${workspace}|${bubbleId}|${branch}|${pathF}|${all ? '1' : '0'}`;

export function useGitLog(workspace: string, bubbleId: string, opts: UseGitLogOpts = {}): UseGitLogResult {
  const { branch = '', path: pathF = '', all = false, pageSize = DEFAULT_PAGE_SIZE } = opts;
  const key = workspace && bubbleId ? cacheKey(workspace, bubbleId, branch, pathF, all) : '';
  const initial = key ? cache.get(key) : null;

  const [commits, setCommits] = useState<LogEntry[]>(initial?.commits ?? []);
  const [hasMore, setHasMore] = useState<boolean>(initial?.hasMore ?? false);
  const [loading, setLoading] = useState<boolean>(!initial);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState(0);
  const cancelledRef = useRef(false);

  const fetchPage = useCallback(async (skip: number, replace: boolean) => {
    if (!workspace || !bubbleId) {
      setCommits([]); setHasMore(false); setLoading(false); return;
    }
    cancelledRef.current = false;
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      if (branch) params.set('branch', branch);
      if (pathF) params.set('path', pathF);
      if (all) params.set('all', '1');
      params.set('limit', String(pageSize));
      params.set('skip', String(skip));
      const r = await apiFetch(`/git/log?${params}`);
      if (!r.ok) {
        if (!cancelledRef.current) setError(`HTTP ${r.status}`);
        return;
      }
      const data = await r.json() as { ok: boolean; commits?: LogEntry[]; hasMore?: boolean; error?: string };
      if (cancelledRef.current) return;
      if (!data.ok) {
        setError(data.error ?? 'Error');
        return;
      }
      const fresh = data.commits ?? [];
      setError(null);
      setCommits((prev) => {
        const next = replace ? fresh : [...prev, ...fresh];
        if (key) cache.set(key, { commits: next, hasMore: !!data.hasMore, ts: Date.now() });
        return next;
      });
      setHasMore(!!data.hasMore);
    } catch (e) {
      if (!cancelledRef.current) setError(e instanceof Error ? e.message : 'Error');
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [workspace, bubbleId, branch, pathF, all, pageSize, key]);

  useEffect(() => {
    if (!workspace || !bubbleId) { setCommits([]); setHasMore(false); setLoading(false); return; }
    const cached = cache.get(key);
    if (cached) { setCommits(cached.commits); setHasMore(cached.hasMore); setLoading(false); }
    else { setCommits([]); setHasMore(false); setLoading(true); }
    void fetchPage(0, true);
    const offBus = ecoOn('eco:git_refresh', (e) => {
      if (e.bubbleId !== bubbleId) return;
      void fetchPage(0, true);
    });
    return () => {
      cancelledRef.current = true;
      offBus();
    };
  }, [workspace, bubbleId, key, fetchPage, bust]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void fetchPage(commits.length, false);
  }, [loading, hasMore, fetchPage, commits.length]);

  const refresh = useCallback(() => setBust((n) => n + 1), []);

  return { commits, loading, hasMore, error, loadMore, refresh };
}

// Helper para fetchear el detalle de un commit (gitShow). No es un hook
// completo porque la UI lo llama on-demand al seleccionar un commit.
export type CommitDetail = {
  ok: true;
  meta: LogEntry;
  diff: string;
  truncated: boolean;
  stat: string;
} | { ok: false; error: string };

export async function fetchCommit(workspace: string, bubbleId: string, sha: string): Promise<CommitDetail> {
  try {
    const params = new URLSearchParams({ workspace, bubbleId, sha });
    const r = await apiFetch(`/git/show?${params}`);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}
