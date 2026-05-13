// Defaults de comandos de dev server por workspace. Permite que cuando
// abrís una conversación nueva en un proyecto que ya configuraste antes,
// los slots de ServerPanel se autocompleten con los comandos correctos
// (no hay que re-tipearlos en cada bubble nuevo).

import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'eco.dev.workspace_defaults.';
const CHANGE_EVENT = 'eco:workspace-defaults-change';

export type WorkspaceDefaults = {
  dual: boolean;
  main: string;
  frontend: string;
  backend: string;
};

const EMPTY: WorkspaceDefaults = { dual: false, main: '', frontend: '', backend: '' };

function key(workspace: string): string {
  return STORAGE_PREFIX + workspace;
}

function read(workspace: string): WorkspaceDefaults {
  try {
    const raw = window.localStorage.getItem(key(workspace));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      dual: !!parsed.dual,
      main: typeof parsed.main === 'string' ? parsed.main : '',
      frontend: typeof parsed.frontend === 'string' ? parsed.frontend : '',
      backend: typeof parsed.backend === 'string' ? parsed.backend : '',
    };
  } catch { return EMPTY; }
}

function write(workspace: string, defs: WorkspaceDefaults) {
  try {
    const k = key(workspace);
    // Si todo está vacío, borramos la entrada en vez de guardar EMPTY.
    if (!defs.dual && !defs.main && !defs.frontend && !defs.backend) {
      window.localStorage.removeItem(k);
    } else {
      window.localStorage.setItem(k, JSON.stringify(defs));
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: workspace }));
  } catch { /* noop */ }
}

export function useWorkspaceServerDefaults(workspace: string) {
  const [defaults, setDefaults] = useState<WorkspaceDefaults>(() => read(workspace));

  useEffect(() => { setDefaults(read(workspace)); }, [workspace]);

  useEffect(() => {
    const sync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail !== workspace) return;
      setDefaults(read(workspace));
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [workspace]);

  const save = useCallback((defs: WorkspaceDefaults) => {
    write(workspace, defs);
    setDefaults(defs);
  }, [workspace]);

  const clear = useCallback(() => {
    write(workspace, EMPTY);
    setDefaults(EMPTY);
  }, [workspace]);

  const hasAny = !!(defaults.main || defaults.frontend || defaults.backend);

  return { defaults, save, clear, hasAny };
}
