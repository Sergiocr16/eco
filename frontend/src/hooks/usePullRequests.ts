import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { on as ecoOn } from '@/lib/eco-bus';

export type PullRequest = {
  number: number;
  title: string;
  author: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  url: string;
  isFork: boolean;
  additions?: number;
  deletions?: number;
};

export type PullRequestsState =
  | { ok: true; prs: PullRequest[] }
  | { ok: false; error: string; code?: string };

// Cache global por (workspace, bubbleId) — mismo patrón que useGitChanges y
// useGitLog. Al volver al tab Git → PRs no se ve el spinner; la lista
// guardada se muestra al instante y se revalida en background.
type CacheEntry = { state: PullRequestsState; ts: number };
const cache = new Map<string, CacheEntry>();
const cacheKey = (workspace: string, bubbleId: string) => `${workspace}|${bubbleId}`;

export type UsePullRequestsResult = {
  data: PullRequestsState | null;
  // true SOLO en el primer fetch sin cache previo. Los refresh subsecuentes
  // son silenciosos (el list viejo se sigue mostrando mientras carga el nuevo).
  loading: boolean;
  refresh: () => void;
};

export function usePullRequests(workspace: string, bubbleId: string): UsePullRequestsResult {
  const key = workspace && bubbleId ? cacheKey(workspace, bubbleId) : '';
  const initial = key ? cache.get(key) : null;
  const [data, setData] = useState<PullRequestsState | null>(initial?.state ?? null);
  const [loading, setLoading] = useState(!initial);
  const [bust, setBust] = useState(0);

  const fetchPrs = useCallback(async (silent: boolean) => {
    if (!workspace || !bubbleId) { setData(null); setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      const r = await apiFetch(`/git/prs?${params}`);
      const fresh = await r.json() as PullRequestsState;
      setData(fresh);
      if (key) cache.set(key, { state: fresh, ts: Date.now() });
    } catch (e) {
      const fail: PullRequestsState = { ok: false, error: e instanceof Error ? e.message : 'Error' };
      setData(fail);
    } finally {
      setLoading(false);
    }
  }, [workspace, bubbleId, key]);

  useEffect(() => {
    // Si hay cache, refresh es silencioso — la lista vieja queda visible.
    const cached = key ? cache.get(key) : null;
    if (cached) {
      setData(cached.state);
      setLoading(false);
      void fetchPrs(true);
    } else {
      void fetchPrs(false);
    }
    // Refresh externo cuando algo cambia el estado git (checkout PR, merge, etc.).
    const offBus = ecoOn('eco:git_refresh', (e) => {
      if (e.bubbleId !== bubbleId) return;
      void fetchPrs(true);
    });
    return () => { offBus(); };
  }, [fetchPrs, bubbleId, key, bust]);

  return {
    data,
    loading,
    refresh: () => setBust((n) => n + 1),
  };
}
