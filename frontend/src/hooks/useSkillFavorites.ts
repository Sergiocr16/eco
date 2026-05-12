// Favoritos de skills — global (no por agente). Persistido en localStorage.
// Cada favorito se identifica por su SkillId: "<source>:<plugin>:<name>".

import { useCallback, useEffect, useState } from 'react';
import type { SkillInfo } from './useSkills';

const KEY = 'eco.skills.favorites';
const EVENT = 'eco:skill-favorites-change';

export function skillIdOf(s: SkillInfo): string {
  return `${s.source}:${s.plugin ?? ''}:${s.name}`;
}

function read(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}

function write(s: Set<string>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...s]));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* noop */ }
}

export function useSkillFavorites() {
  const [favs, setFavs] = useState<Set<string>>(read);

  useEffect(() => {
    const sync = () => setFavs(read());
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const n = new Set(read());
    if (n.has(id)) n.delete(id); else n.add(id);
    write(n);
  }, []);

  const isFav = useCallback((id: string) => favs.has(id), [favs]);

  return { favs, isFav, toggle };
}
