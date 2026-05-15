import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { on as ecoOn } from '@/lib/eco-bus';

export type GitConflictOp = 'cherry-pick' | 'merge' | 'revert';

export type OpStatus = {
  inProgress: GitConflictOp | null;
  conflictedFiles: string[];
};

const EMPTY: OpStatus = { inProgress: null, conflictedFiles: [] };
const POLL_MS = 5_000;

// Cache global por (workspace, bubbleId) para que el Dashboard pueda leer
// sincrónico vía peekOpStatus y mostrar un dot rojo en bubbles con conflicto.
type CacheEntry = { status: OpStatus; ts: number };
const cache = new Map<string, CacheEntry>();
const cacheKey = (workspace: string, bubbleId: string) => `${workspace}|${bubbleId}`;

const subscribers = new Set<() => void>();
function notifyAll() { for (const fn of subscribers) { try { fn(); } catch { /* noop */ } } }

export function peekOpStatus(workspace: string, bubbleId: string): OpStatus | undefined {
  return cache.get(cacheKey(workspace, bubbleId))?.status;
}

export function useGitOpStatus(workspace: string, bubbleId: string): OpStatus {
  const key = workspace && bubbleId ? cacheKey(workspace, bubbleId) : '';
  const initial = key ? cache.get(key) : null;
  const [status, setStatus] = useState<OpStatus>(initial?.status ?? EMPTY);

  useEffect(() => {
    if (!workspace || !bubbleId) { setStatus(EMPTY); return; }
    let cancelled = false;

    const fetchStatus = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const params = new URLSearchParams({ workspace, bubbleId });
        const r = await apiFetch(`/git/op-status?${params}`);
        if (!r.ok) return;
        const data = await r.json() as OpStatus;
        if (cancelled) return;
        // Skip setState si no cambió.
        setStatus((prev) => {
          if (
            prev.inProgress === data.inProgress
            && prev.conflictedFiles.length === data.conflictedFiles.length
            && prev.conflictedFiles.every((f, i) => f === data.conflictedFiles[i])
          ) return prev;
          return data;
        });
        cache.set(key, { status: data, ts: Date.now() });
        notifyAll();
      } catch { /* noop */ }
    };

    void fetchStatus();
    const iv = setInterval(fetchStatus, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void fetchStatus(); };
    document.addEventListener('visibilitychange', onVis);
    const offBus = ecoOn('eco:git_refresh', (e) => {
      if (e.bubbleId !== bubbleId) return;
      void fetchStatus();
    });
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      offBus();
    };
  }, [workspace, bubbleId, key]);

  return status;
}
