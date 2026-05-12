import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type GitChange = { path: string; change: string };

export function useGitChanges(workspace: string, bubbleId?: string, intervalMs = 4000): GitChange[] {
  const [files, setFiles] = useState<GitChange[]>([]);

  useEffect(() => {
    if (!workspace) { setFiles([]); return; }
    let cancelled = false;
    const fetchChanges = async () => {
      try {
        const params = new URLSearchParams({ workspace });
        if (bubbleId) params.set('bubbleId', bubbleId);
        const r = await apiFetch(`/file/changes?${params}`);
        if (!r.ok) return;
        const data = await r.json() as { workspace: string; files: { path: string; change: string }[]; git: boolean };
        if (cancelled) return;
        // El backend devuelve `workspace` con el path efectivo (worktree si aplica).
        const base = (data.workspace || workspace).endsWith('/') ? (data.workspace || workspace) : (data.workspace || workspace) + '/';
        setFiles(data.files.map((f) => ({
          path: f.path.startsWith('/') ? f.path : base + f.path,
          change: f.change,
        })));
      } catch { /* noop */ }
    };
    void fetchChanges();
    const iv = setInterval(fetchChanges, intervalMs);
    return () => { cancelled = true; clearInterval(iv); };
  }, [workspace, bubbleId, intervalMs]);

  return files;
}
