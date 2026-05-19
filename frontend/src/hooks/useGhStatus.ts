import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

// El binario `gh` (GitHub CLI) es requerido para que funcione la sub-pestaña
// PRs del tab Git. Sin gh, todos los endpoints de PRs devuelven
// `pr.gh_missing`. El PAT NO lo reemplaza — solo se inyecta como GH_TOKEN.
export type GhStatus = {
  loading: boolean;
  installed: boolean | null;
  version?: string;
};

export function useGhStatus(): GhStatus {
  const [state, setState] = useState<GhStatus>({ loading: true, installed: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/config/gh-status');
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        setState({
          loading: false,
          installed: !!d.installed,
          version: typeof d.version === 'string' ? d.version : undefined,
        });
      } catch {
        if (!cancelled) setState({ loading: false, installed: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return state;
}
