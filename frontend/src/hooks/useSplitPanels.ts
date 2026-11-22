import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

// Vista dividida del detalle de una bubble: hasta DOS paneles abiertos a la
// vez. El primero de `open` va a la izquierda (o arriba); `ratio` es su parte
// del espacio. El panel fijado se queda cuando se elige un tercero.
export type SplitState<T extends string> = { open: T[]; ratio: number; pinned: T | null };
export type SplitDir = 'row' | 'column';

export const SPLIT_MIN_RATIO = 0.2;
export const SPLIT_MAX_RATIO = 0.8;
const MAX_OPEN = 2;
const DIR_KEY = 'eco.detail.splitdir';

function clampRatio(v: number): number {
  return Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, v));
}

function splitKey(bubbleId: string): string { return `eco.detail.split.${bubbleId}`; }

function loadSplit<T extends string>(bubbleId: string, valid: ReadonlyArray<T>, fallback: T): SplitState<T> {
  const isValid = (x: unknown): x is T => typeof x === 'string' && (valid as ReadonlyArray<string>).includes(x);
  try {
    const raw = window.localStorage.getItem(splitKey(bubbleId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SplitState<string>>;
      const open = Array.isArray(parsed.open)
        ? [...new Set(parsed.open.filter(isValid))].slice(0, MAX_OPEN)
        : [];
      if (open.length > 0) {
        return {
          open,
          ratio: typeof parsed.ratio === 'number' && Number.isFinite(parsed.ratio) ? clampRatio(parsed.ratio) : 0.5,
          pinned: isValid(parsed.pinned) && open.includes(parsed.pinned) ? parsed.pinned : null,
        };
      }
    }
    // Clave anterior a la vista dividida: un solo tab por bubble.
    const legacy = window.localStorage.getItem(`eco.detail.tab.${bubbleId}`);
    if (isValid(legacy)) return { open: [legacy], ratio: 0.5, pinned: null };
  } catch { /* noop */ }
  return { open: [fallback], ratio: 0.5, pinned: null };
}

// Abre `id`. Con lugar libre se suma; con los dos ocupados reemplaza al que
// NO está fijado (el segundo si no hay ninguno fijado).
function withPanelShown<T extends string>(s: SplitState<T>, id: T, maxOpen: number): SplitState<T> {
  if (s.open.includes(id)) return s;
  if (maxOpen <= 1) return { ...s, open: [id], pinned: null };
  if (s.open.length < maxOpen) return { ...s, open: [...s.open, id] };
  const out = s.open[0] === s.pinned ? 1 : s.open[1] === s.pinned ? 0 : 1;
  return { ...s, open: s.open.map((x, i) => (i === out ? id : x)) };
}

export function useSplitPanels<T extends string>(
  bubbleId: string, valid: ReadonlyArray<T>, fallback: T, allowSplit: boolean,
) {
  const [state, setState] = useState<SplitState<T>>(() => loadSplit(bubbleId, valid, fallback));
  const maxOpen = allowSplit ? MAX_OPEN : 1;

  useEffect(() => {
    try { window.localStorage.setItem(splitKey(bubbleId), JSON.stringify(state)); } catch { /* noop */ }
  }, [bubbleId, state]);

  const show = useCallback((id: T) => {
    setState((s) => withPanelShown(s, id, maxOpen));
  }, [maxOpen]);

  // Clic en un tab: abre el panel, o lo cierra si ya estaba (nunca el último).
  const toggle = useCallback((id: T) => {
    setState((s) => {
      if (!s.open.includes(id)) return withPanelShown(s, id, maxOpen);
      if (maxOpen <= 1 || s.open.length <= 1) return s;
      return { ...s, open: s.open.filter((x) => x !== id), pinned: s.pinned === id ? null : s.pinned };
    });
  }, [maxOpen]);

  const togglePin = useCallback((id: T) => {
    setState((s) => ({ ...s, pinned: s.pinned === id ? null : id }));
  }, []);

  const swap = useCallback(() => {
    setState((s) => (s.open.length < 2 ? s : { ...s, open: [...s.open].reverse(), ratio: 1 - s.ratio }));
  }, []);

  const setRatio = useCallback((v: number) => {
    setState((s) => ({ ...s, ratio: clampRatio(v) }));
  }, []);

  // Sin lugar para dos (teléfono) solo se muestra el primero; el estado
  // guardado se conserva para cuando vuelva a haber espacio.
  const open = allowSplit ? state.open : state.open.slice(0, 1);
  return { open, ratio: state.ratio, pinned: allowSplit ? state.pinned : null, show, toggle, togglePin, swap, setRatio };
}

// Orientación del split, global para todas las bubbles. Store de módulo: hay
// varias AgentDetail montadas a la vez (keep-alive) y todas deben seguirla.
const dirListeners = new Set<() => void>();
let currentDir: SplitDir = (() => {
  try { return window.localStorage.getItem(DIR_KEY) === 'column' ? 'column' : 'row'; } catch { return 'row'; }
})();

function subscribeDir(fn: () => void): () => void {
  dirListeners.add(fn);
  return () => { dirListeners.delete(fn); };
}

export function setSplitDir(next: SplitDir): void {
  currentDir = next;
  try { window.localStorage.setItem(DIR_KEY, next); } catch { /* noop */ }
  dirListeners.forEach((fn) => fn());
}

export function useSplitDir(): SplitDir {
  return useSyncExternalStore(subscribeDir, () => currentDir);
}
