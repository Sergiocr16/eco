// Defaults de comandos de dev server por workspace. AHORA server-authoritative:
// la config la define el admin (Settings → Folders) y vive en el servidor; el
// member solo la consume. Antes era localStorage por dispositivo. La API se
// mantiene (`defaults`, `save`, `clear`, `hasAny`) para no romper ServerPanel.

import { useCallback } from 'react';
import {
  useWorkspaceConfig, saveWorkspaceConfig,
  type WorkspaceServerConfig,
} from '@/lib/workspace-config';

export type WorkspaceDefaults = WorkspaceServerConfig;

export function useWorkspaceServerDefaults(workspace: string) {
  const config = useWorkspaceConfig(workspace);
  const defaults = config.server;

  // save/clear solo tienen efecto para admin (el backend rechaza al member).
  const save = useCallback((defs: WorkspaceDefaults) => {
    void saveWorkspaceConfig(workspace, { server: defs });
  }, [workspace]);

  const clear = useCallback(() => {
    void saveWorkspaceConfig(workspace, { server: { dual: false, main: '', frontend: '', backend: '', env: {} } });
  }, [workspace]);

  const hasAny = !!(defaults.main || defaults.frontend || defaults.backend);

  return { defaults, save, clear, hasAny };
}
