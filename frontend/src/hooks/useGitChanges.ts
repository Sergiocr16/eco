import { useEffect, useMemo, useState } from 'react';
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

function sameFiles(a: GitChange[], b: GitChange[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!; const y = b[i]!;
    if (x.path !== y.path || x.change !== y.change || x.unstaged !== y.unstaged) return false;
  }
  return true;
}

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
        // Skip setState si el resultado es idéntico al anterior — sin esto,
        // cada poll dispara re-render incluso cuando no cambió nada.
        setFiles((prev) => sameFiles(prev, normalized) ? prev : normalized);
        cache.set(cacheKey(workspace, bubbleId), { files: normalized, ts: Date.now() });
        notifyAll();
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

// ─── Aggregate: hasFiles por bubble para el Dashboard ─────────────────────
// El Dashboard quiere saber, para cada burbuja, si tiene archivos modificados
// reales (no heurística de "alguna vez se editó algo"). Compartimos el mismo
// `cache` que llena `useGitChanges`, y polleamos en paralelo cualquier burbuja
// que no tenga entry todavía. Visibilidad: si la pestaña está oculta no
// polleamos (la próxima `visibilitychange` refresca).

type BubbleRef = { id: string; workspace: string };

const subscribers = new Set<() => void>();
function notifyAll() { for (const fn of subscribers) { try { fn(); } catch { /* noop */ } } }

/** Lectura sincrónica del cache — sin disparar fetch. Devuelve `undefined`
 *  si no hay entry para esa (workspace, bubble). */
export function peekHasFiles(workspace: string, bubbleId: string): boolean | undefined {
  const entry = cache.get(cacheKey(workspace, bubbleId));
  if (!entry) return undefined;
  return entry.files.length > 0;
}

/** Subscribe a updates del cache global de file changes. Útil cuando un
 *  hook quiere re-renderizar al cambiar el state pero no es responsable
 *  de disparar el fetch. */
export function useFileChangesSubscription(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subscribers.add(fn);
    return () => { subscribers.delete(fn); };
  }, []);
  return tick;
}

// Dedup de requests in-flight: si dos consumers piden la misma key al
// mismo tiempo, solo disparamos UN fetch al backend. Los demás esperan.
const inFlight = new Map<string, Promise<void>>();

async function refreshOne(workspace: string, bubbleId: string): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const key = cacheKey(workspace, bubbleId);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      const r = await apiFetch(`/file/changes?${params}`);
      if (!r.ok) return;
      const data = await r.json() as { workspace: string; files: { path: string; change: string; unstaged?: boolean }[] };
      const base = (data.workspace || workspace).endsWith('/') ? (data.workspace || workspace) : (data.workspace || workspace) + '/';
      const normalized: GitChange[] = data.files.map((f) => ({
        path: f.path.startsWith('/') ? f.path : base + f.path,
        change: f.change,
        unstaged: f.unstaged !== false,
      }));
      const prev = cache.get(key)?.files;
      if (prev && sameFiles(prev, normalized)) {
        // Sin cambios — actualizamos solo el timestamp, no notificamos.
        cache.set(key, { files: prev, ts: Date.now() });
        return;
      }
      cache.set(key, { files: normalized, ts: Date.now() });
      notifyAll();
    } catch { /* noop */ }
    finally { inFlight.delete(key); }
  })();
  inFlight.set(key, promise);
  return promise;
}

/**
 * Polea `/file/changes` para todas las burbujas con workspace y devuelve un
 * Map<bubbleId, hasFiles>. Comparte cache con `useGitChanges` — si la
 * FilesPanel ya está montada para una burbuja, no se duplica el fetch (el
 * último que termina pisa al otro con el mismo resultado).
 */
export function useBubbleHasFilesMap(bubbles: BubbleRef[], intervalMs = 12_000): Map<string, boolean> {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subscribers.add(fn);
    return () => { subscribers.delete(fn); };
  }, []);

  const validBubbles = useMemo(
    () => bubbles.filter((b) => !!b.workspace),
    [bubbles],
  );

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      for (const b of validBubbles) {
        if (cancelled) return;
        void refreshOne(b.workspace, b.id);
      }
    };
    tick();
    const iv = setInterval(tick, intervalMs);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    const offBus = ecoOn('eco:git_refresh', (e) => {
      const target = validBubbles.find((b) => b.id === e.bubbleId);
      if (target) void refreshOne(target.workspace, target.id);
    });
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      offBus();
    };
  }, [validBubbles, intervalMs]);

  return useMemo(() => {
    const out = new Map<string, boolean>();
    for (const b of validBubbles) {
      const entry = cache.get(cacheKey(b.workspace, b.id));
      out.set(b.id, !!entry && entry.files.length > 0);
    }
    return out;
    // `tick` fuerza re-derivación cuando un fetch completa y notifica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validBubbles, tick]);
}
