import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type TailnetStatus = {
  enabled: boolean;
  host?: string;
  url?: string;
  /** El mapeo de Tailscale está aplicado en esta corrida del backend. */
  active: boolean;
  /** Por qué no pudo activarse (Tailscale apagado, Serve sin habilitar…). */
  error?: string;
};

const EMPTY: TailnetStatus = { enabled: false, active: false };

export function useTailnet() {
  const [status, setStatus] = useState<TailnetStatus>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/config/tailnet');
      if (r.ok) setStatus(await r.json() as TailnetStatus);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    setSaving(true);
    try {
      const r = await apiFetch('/config/tailnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (r.ok) setStatus(await r.json() as TailnetStatus);
    } catch { /* noop */ } finally { setSaving(false); }
  }, []);

  return { status, loading, saving, refresh, setEnabled };
}
