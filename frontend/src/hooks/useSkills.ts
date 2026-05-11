import { useEffect, useState } from 'react';
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

export function useSkills(workspace?: string): UseSkillsResult {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = workspace ? `?workspace=${encodeURIComponent(workspace)}` : '';
    apiFetch(`/skills${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (cancelled) return;
        setSkills(Array.isArray(d?.skills) ? d.skills : []);
      })
      .catch(() => { if (!cancelled) setSkills([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspace]);

  const byName = new Map(skills.map((s) => [s.name, s]));
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
