import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { on as ecoOn } from '@/lib/eco-bus';

export type GitChange = {
  path: string;
  change: string;
  /** true si hay cambios en el worktree sin stagear (modified pero no
   * aceptado vía `git add`). false = todo lo del archivo ya está staged. */
  unstaged: boolean;
};

export type UseGitChangesResult = {
  files: GitChange[];
  /** true antes del primer fetch — útil para distinguir loading de "vacío". */
  loading: boolean;
  /** Refetch manual on demand. */
  refresh: () => void;
};

// Cache global por (workspace, bubbleId). Sobrevive al unmount del hook —
// cuando entrás a otra burbuja y volvés, no tenés que esperar el spinner
// porque arrancamos con el último snapshot conocido y refresheamos en
// background. El cache se mantiene viva mientras la app esté abierta.
type CacheEntry = { files: GitChange[]; ts: number };
const cache = new Map<string, CacheEntry>();
const cacheKey = (workspace: string, bubbleId?: string) => `${workspace}|${bubbleId ?? ''}`;

export function useGitChanges(workspace: string, bubbleId?: string, intervalMs = 10_000): UseGitChangesResult {
  // Inicializamos con el cache si existe — la UI ve inmediatamente la última
  // lista conocida en lugar de "vacío + spinner".
  const initial = workspace ? cache.get(cacheKey(workspace, bubbleId)) : null;
  const [files, setFiles] = useState<GitChange[]>(initial?.files ?? []);
  // loading solo es true cuando NO había cache previo — primer encuentro
  // real con esta (workspace, bubble).
  const [loading, setLoading] = useState(!initial);
  // Bump local para forzar refetch externo.
  const [bust, setBust] = useState(0);

  useEffect(() => {
    if (!workspace) { setFiles([]); setLoading(false); return; }
    // Si el bubble/workspace cambió, releemos el cache del nuevo par.
    const cached = cache.get(cacheKey(workspace, bubbleId));
    if (cached) {
      setFiles(cached.files);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let cancelled = false;
    const fetchChanges = async () => {
      // No polleamos cuando la ventana está minimizada/oculta — la próxima
      // visibilidad dispara un refetch.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const params = new URLSearchParams({ workspace });
        if (bubbleId) params.set('bubbleId', bubbleId);
        const r = await apiFetch(`/file/changes?${params}`);
        if (!r.ok) return;
        const data = await r.json() as { workspace: string; files: { path: string; change: string; unstaged?: boolean }[]; git: boolean };
        if (cancelled) return;
        // El backend devuelve `workspace` con el path efectivo (worktree si aplica).
        const base = (data.workspace || workspace).endsWith('/') ? (data.workspace || workspace) : (data.workspace || workspace) + '/';
        const normalized: GitChange[] = data.files.map((f) => ({
          path: f.path.startsWith('/') ? f.path : base + f.path,
          change: f.change,
          // Default true para compat con backends viejos (mejor mostrar
          // pendiente que aceptado por error).
          unstaged: f.unstaged !== false,
        }));
        setFiles(normalized);
        cache.set(cacheKey(workspace, bubbleId), { files: normalized, ts: Date.now() });
      } catch { /* noop */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchChanges();
    const iv = setInterval(fetchChanges, intervalMs);
    const onVis = () => { if (document.visibilityState === 'visible') void fetchChanges(); };
    document.addEventListener('visibilitychange', onVis);
    // Refresh inmediato cuando algo modifica el git por fuera del polling
    // (ej. después de aceptar/rechazar un hunk, descartar archivo, etc.).
    const offBus = ecoOn('eco:git_refresh', (e) => {
      if (e.bubbleId !== bubbleId) return;
      void fetchChanges();
    });
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      offBus();
    };
  }, [workspace, bubbleId, intervalMs, bust]);

  return {
    files,
    loading,
    refresh: () => setBust((n) => n + 1),
  };
}
