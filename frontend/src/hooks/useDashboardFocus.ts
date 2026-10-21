// Modo focus del Dashboard: categorías elegidas para mostrar solo sus agentes.
// Store de módulo + subscribers (mismo patrón que useCategories) porque lo
// comparten el Dashboard (grilla, kanban, grafo) y el dock, que vive fuera.

import { useEffect, useState } from 'react';
import { useCategories } from '@/hooks/useCategories';

const STORAGE_KEY = 'eco.dashboard.focus';

function load(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

let focusIds: string[] = load();
const subs = new Set<() => void>();

function setFocusIds(next: string[]): void {
  focusIds = next;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  for (const fn of subs) { try { fn(); } catch { /* noop */ } }
}

export type DashboardFocus = {
  /** Ids elegidos que todavía existen (los de categorías borradas se ignoran). */
  activeFocus: string[];
  setFocus: (ids: string[]) => void;
  /** Sin focus devuelve la lista tal cual; con focus, solo los agentes con alguna categoría elegida. */
  applyFocus: <T extends { categoryIds?: string[] }>(list: T[]) => T[];
};

export function useDashboardFocus(): DashboardFocus {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);
  const { categories } = useCategories();
  const activeFocus = focusIds.filter((id) => categories.some((c) => c.id === id));
  const applyFocus = <T extends { categoryIds?: string[] }>(list: T[]): T[] => {
    if (activeFocus.length === 0) return list;
    const want = new Set(activeFocus);
    return list.filter((b) => (b.categoryIds ?? []).some((id) => want.has(id)));
  };
  return { activeFocus, setFocus: setFocusIds, applyFocus };
}
