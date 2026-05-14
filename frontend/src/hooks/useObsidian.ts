import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type ObsidianMode = 'builtin' | 'custom';

export type ObsidianStatus = {
  configured: boolean;
  enabled: boolean;
  vaultPath: string;
  vaultExists: boolean;
  hasParaStructure: boolean;
  noteCount: number;
  mode: ObsidianMode;
  customCommand: string;
};

const EMPTY: ObsidianStatus = {
  configured: false,
  enabled: false,
  vaultPath: '',
  vaultExists: false,
  hasParaStructure: false,
  noteCount: 0,
  mode: 'builtin',
  customCommand: '',
};

export type DetectedVault = {
  id: string;
  path: string;
  name: string;
  lastOpened: number;
  open: boolean;
};

export function useObsidian() {
  const [status, setStatus] = useState<ObsidianStatus>(EMPTY);
  const [vaults, setVaults] = useState<DetectedVault[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, v] = await Promise.all([
        apiFetch('/integrations/obsidian/status'),
        apiFetch('/integrations/obsidian/vaults'),
      ]);
      if (s.ok) {
        setStatus(await s.json() as ObsidianStatus);
      } else {
        console.warn('[useObsidian] /status no OK:', s.status);
      }
      if (v.ok) {
        const data = await v.json() as { vaults: DetectedVault[] };
        setVaults(data.vaults ?? []);
      } else {
        console.warn('[useObsidian] /vaults no OK:', v.status);
      }
    } catch (e) {
      console.warn('[useObsidian] refresh failed:', e);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Si la primera llamada vino vacía (race con session/backend warmup),
  // reintentamos una vez a los 1.5s. Sin esto, si el backend respondió
  // 401 por session inválida al mount inicial, el user veía vaults=[]
  // para siempre hasta navegar fuera y volver.
  useEffect(() => {
    if (loading) return;
    if (vaults.length > 0) return;
    if (status.configured) return;
    const id = window.setTimeout(() => { void refresh(); }, 1500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Re-fetch cuando la ventana vuelve a estar visible — útil si el user
  // configuró un vault nuevo en Obsidian afuera de Eco mientras la app
  // estaba minimizada.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible') void refresh();
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const save = useCallback(async (
    enabled: boolean,
    vaultPath: string,
    mode: ObsidianMode = 'builtin',
    customCommand: string = '',
  ) => {
    const r = await apiFetch('/integrations/obsidian/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, vaultPath, mode, customCommand }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.status) setStatus(data.status as ObsidianStatus);
    return r.ok;
  }, []);

  return { status, vaults, loading, refresh, save };
}

// Wrapper para el folder picker nativo de Electron — devuelve null si el
// usuario canceló o si estamos en web sin acceso al picker.
export async function pickVaultFolder(): Promise<string | null> {
  const api = (window as unknown as { electronAPI?: { pickFolder?: (opts: { title: string }) => Promise<{ canceled: boolean; path: string }> } }).electronAPI;
  if (!api?.pickFolder) return null;
  try {
    const r = await api.pickFolder({ title: 'Elegir vault Obsidian' });
    if (r.canceled || !r.path) return null;
    return r.path;
  } catch { return null; }
}

export type SaveSessionPayload = {
  bubbleId: string;
  title: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; text: string; createdAt: number }>;
};

export async function saveSessionToObsidian(payload: SaveSessionPayload): Promise<
  { ok: true; path: string } | { ok: false; error: string }
> {
  try {
    const r = await apiFetch('/integrations/obsidian/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (data?.message as string) ?? `HTTP ${r.status}` };
    return { ok: true, path: (data?.path as string) ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
