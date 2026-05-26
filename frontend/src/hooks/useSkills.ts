import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type SkillKind = 'skill' | 'command' | 'agent';

export type SkillInfo = {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  kind: SkillKind;
  plugin?: string;
  path: string;
};

export type UseSkillsResult = {
  skills: SkillInfo[];
  byName: Map<string, SkillInfo>;
  loading: boolean;
};

// Cache global por workspace. `useSkills` se monta una vez por SkillsCard +
// SkillsPicker + cada bubble en multi-detail, y antes cada montaje hacía un
// fetch limpio. Con cache, los re-mounts (cambio de tab, abrir un bubble,
// colapsar/expandir el sidebar) se ven instantáneos y el refetch ocurre
// silencioso en background.
type CacheEntry = { skills: SkillInfo[]; ts: number };
const skillsCache = new Map<string, CacheEntry>();
const cacheKey = (workspace?: string) => workspace ?? '__no_ws__';

export function useSkills(workspace?: string): UseSkillsResult {
  const key = cacheKey(workspace);
  const cached = skillsCache.get(key);
  const [skills, setSkills] = useState<SkillInfo[]>(cached?.skills ?? []);
  // Spinner solo en el primer fetch sin cache. Refetches subsecuentes son
  // silenciosos — el viejo se ve mientras carga el nuevo.
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    const hit = skillsCache.get(key);
    if (hit) {
      setSkills(hit.skills);
      setLoading(false);
    } else {
      setLoading(true);
    }
    const params = workspace ? `?workspace=${encodeURIComponent(workspace)}` : '';
    apiFetch(`/skills${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (cancelled) return;
        const fresh: SkillInfo[] = Array.isArray(d?.skills) ? d.skills : [];
        skillsCache.set(key, { skills: fresh, ts: Date.now() });
        setSkills(fresh);
      })
      .catch(() => { if (!cancelled && !hit) setSkills([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspace, key]);

  // Sin memo, `new Map(skills.map(...))` se reconstruía en cada render y
  // forzaba useMemo downstream a invalidarse. Con memo, sólo cambia cuando
  // `skills` realmente cambia.
  const byName = useMemo(() => new Map(skills.map((s) => [s.name, s])), [skills]);
  return { skills, byName, loading };
}

export function filterSkills(skills: SkillInfo[], query: string, limit = 8): SkillInfo[] {
  if (!query) return skills.slice(0, limit);
  const q = query.toLowerCase();
  const scored = skills
    .map((s) => {
      const name = s.name.toLowerCase();
      let score = 0;
      if (name === q) score += 1000;
      else if (name.startsWith(q)) score += 500;
      else if (name.includes(q)) score += 200;
      else if (s.description.toLowerCase().includes(q)) score += 50;
      else return null;
      if (s.source === 'project') score += 30;
      if (s.kind === 'skill') score += 5;
      return { skill: s, score };
    })
    .filter((x): x is { skill: SkillInfo; score: number } => x !== null);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.skill);
}
