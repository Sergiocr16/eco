import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'eco.suggestions.v1';
const DEFAULTS = [
  'Resumime los cambios',
  'Generá tests',
  'Explicame este código',
  'Pasá a producción',
];

export type UseQuickSuggestionsResult = {
  suggestions: string[];
  setAll: (next: string[]) => void;
  add: (text: string) => void;
  remove: (index: number) => void;
  reset: () => void;
};

function load(): string[] {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULTS;
    return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 12);
  } catch {
    return DEFAULTS;
  }
}

function persist(arr: string[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch { /* noop */ }
}

export function useQuickSuggestions(): UseQuickSuggestionsResult {
  const [suggestions, setSuggestions] = useState<string[]>(load);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setSuggestions(load());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setAll = useCallback((next: string[]) => {
    const clean = next.map((s) => s.trim()).filter(Boolean).slice(0, 12);
    setSuggestions(clean);
    persist(clean);
  }, []);

  const add = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setSuggestions((prev) => {
      if (prev.includes(t)) return prev;
      const next = [...prev, t].slice(0, 12);
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((index: number) => {
    setSuggestions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSuggestions(DEFAULTS);
    persist(DEFAULTS);
  }, []);

  return { suggestions, setAll, add, remove, reset };
}
