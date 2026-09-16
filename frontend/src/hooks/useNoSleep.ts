import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type NoSleepStatus = {
  /** false fuera de macOS: la fila entera se esconde. */
  supported: boolean;
  enabled: boolean;
  /** 'cancelled' si el usuario cerró el diálogo de autorización. */
  error?: string;
};

const EMPTY: NoSleepStatus = { supported: false, enabled: false };

export function useNoSleep() {
  const [status, setStatus] = useState<NoSleepStatus>(EMPTY);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await apiFetch('/config/nosleep');
      if (r.ok) setStatus(await r.json() as NoSleepStatus);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    setSaving(true);
    try {
      const r = await apiFetch('/config/nosleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (r.ok) setStatus(await r.json() as NoSleepStatus);
    } catch { /* noop */ } finally { setSaving(false); }
  }, []);

  return { status, saving, setEnabled, refresh };
}
