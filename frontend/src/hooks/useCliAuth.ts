import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type CliProvider = 'claude' | 'codex';

export type CliAuthStatus = {
  cliInstalled: boolean;
  cliPath: string;
  cliVersion: string | null;
  cliLoggedIn: boolean;
  cliLoginHint: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  effectiveMethod: 'cli' | 'apikey' | 'none';
};

export type UseCliAuthResult = {
  status: CliAuthStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ENDPOINTS: Record<CliProvider, string> = {
  claude: '/config/claude-auth',
  codex: '/config/codex-auth',
};

// Store a nivel módulo + subscribers (mismo patrón que useWorkspaces): la barra
// de terminales y Settings consultan el mismo estado en vez de mantener dos
// pollers contra un endpoint que hace spawnSync.
type Entry = { status: CliAuthStatus | null; loading: boolean; fetchedOk: boolean };
const shared: Record<CliProvider, Entry> = {
  claude: { status: null, loading: false, fetchedOk: false },
  codex: { status: null, loading: false, fetchedOk: false },
};

const subs = new Set<() => void>();
function notify() { for (const fn of subs) { try { fn(); } catch { /* noop */ } } }

async function refreshShared(provider: CliProvider): Promise<void> {
  const entry = shared[provider];
  entry.loading = true;
  notify();
  try {
    const r = await apiFetch(ENDPOINTS[provider]);
    if (r.ok) {
      entry.status = (await r.json()) as CliAuthStatus;
      entry.fetchedOk = true;
    }
  } catch { /* red caída: conservamos el último status conocido */ }
  finally {
    entry.loading = false;
    notify();
  }
}

export function useCliAuth(provider: CliProvider): UseCliAuthResult {
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subs.add(fn);
    const entry = shared[provider];
    // Igual que useWorkspaces: mientras no haya un fetch exitoso, cada consumer
    // nuevo reintenta (cubre el primer fetch 401 pre-login).
    if (!entry.fetchedOk && !entry.loading) void refreshShared(provider);
    return () => { subs.delete(fn); };
  }, [provider]);

  const refresh = useCallback(() => refreshShared(provider), [provider]);
  const entry = shared[provider];

  return { status: entry.status, loading: entry.loading, refresh };
}
