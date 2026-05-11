import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'eco.workspace.default';

export function useDefaultWorkspace(): { value: string; set: (path: string) => void; clear: () => void } {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try { return window.localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setValue(e.newValue ?? '');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const set = useCallback((path: string) => {
    setValue(path);
    try {
      if (path) window.localStorage.setItem(STORAGE_KEY, path);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* noop */ }
  }, []);

  const clear = useCallback(() => set(''), [set]);

  return { value, set, clear };
}
