import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { on as ecoOn } from '@/lib/eco-bus';

export type BranchInfo = {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommit?: { sha: string; subject: string; author: string; relTime: string };
};

export type BranchListResult = {
  current: string | null;
  detached: boolean;
  branches: BranchInfo[];
  worktree: string;
};

type CacheEntry = { data: BranchListResult; ts: number };
const cache = new Map<string, CacheEntry>();
const cacheKey = (workspace: string, bubbleId: string) => `${workspace}|${bubbleId}`;

export type UseBranchesResult = {
  data: BranchListResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useBranches(workspace: string, bubbleId: string): UseBranchesResult {
  const key = workspace && bubbleId ? cacheKey(workspace, bubbleId) : '';
  const initial = key ? cache.get(key) : null;
  const [data, setData] = useState<BranchListResult | null>(initial?.data ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState(0);

  const fetchBranches = useCallback(async () => {
    if (!workspace || !bubbleId) { setData(null); setLoading(false); return; }
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      const r = await apiFetch(`/git/branches?${params}`);
      if (!r.ok) { setError(`HTTP ${r.status}`); return; }
      const fresh = await r.json() as BranchListResult;
      setError(null);
      setData(fresh);
      if (key) cache.set(key, { data: fresh, ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [workspace, bubbleId, key]);

  useEffect(() => {
    void fetchBranches();
    const offBus = ecoOn('eco:git_refresh', (e) => {
      if (e.bubbleId !== bubbleId) return;
      void fetchBranches();
    });
    return () => { offBus(); };
  }, [fetchBranches, bubbleId, bust]);

  return {
    data,
    loading,
    error,
    refresh: () => setBust((n) => n + 1),
  };
}
