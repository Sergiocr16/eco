import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bubble, Message } from '@/lib/types';
import { translate, loadLang } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';

const STORAGE_KEY = 'eco.bubbles.v1';
const ACTIVE_KEY = 'eco.bubbles.active';

// Cap de mensajes que mantenemos EN MEMORIA por bubble. Los más viejos se
// drop silenciosamente — los muy largos tienden a quedar fuera de pantalla
// igual, y el costo de renderizar 1000+ mensajes con tool outputs grandes
// supera el valor de tenerlos accesibles.
const MAX_MESSAGES_IN_MEMORY = 300;

// Cap más agresivo de mensajes que serializamos a localStorage. Solo se
// usa en `persist()`. Suficiente para que al recargar la app, el user tenga
// contexto reciente sin saturar el quota de localStorage (~5-10 MB).
const MAX_MESSAGES_IN_STORAGE = 100;

// Outputs de tool calls (ej. Read tool con un archivo entero) pueden pesar
// MBs cada uno. Los truncamos al serializar para que la persistencia
// localStorage no explote — la sesión viva los tiene completos.
const MAX_TOOL_OUTPUT_IN_STORAGE = 10_000;

const ACCENT_PALETTE = [
  'oklch(0.74 0.16 80)',   // dorado (default)
  'oklch(0.7 0.16 200)',   // cyan
  'oklch(0.68 0.18 320)',  // magenta
  'oklch(0.74 0.16 160)',  // verde mar
  'oklch(0.72 0.18 30)',   // coral
  'oklch(0.7 0.14 260)',   // violeta
  'oklch(0.74 0.13 100)',  // verde lima
];

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function nextAccent(existing: Bubble[]): string {
  const used = new Set(existing.map((b) => b.accent));
  const free = ACCENT_PALETTE.find((c) => !used.has(c));
  return free ?? ACCENT_PALETTE[existing.length % ACCENT_PALETTE.length]!;
}

function loadStored(): { bubbles: Bubble[]; activeId: string | null } {
  if (typeof window === 'undefined') return { bubbles: [], activeId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const active = window.localStorage.getItem(ACTIVE_KEY);
    if (!raw) return { bubbles: [], activeId: null };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { bubbles: [], activeId: null };
    const bubbles: Bubble[] = parsed.map((b) => ({
      ...b,
      messages: Array.isArray(b.messages) ? b.messages : [],
      status: 'idle',
      unread: 0,
    }));
    return { bubbles, activeId: active };
  } catch {
    return { bubbles: [], activeId: null };
  }
}

// Adelgaza un mensaje para persistencia: trunca tool outputs grandes y deja
// un marker para que el user sepa que hubo contenido. El mensaje en memoria
// queda intacto — solo se transforma al escribir a disco.
function thinMessageForStorage(m: Message): Message {
  if (!m.toolCalls || m.toolCalls.length === 0) return m;
  const thinnedToolCalls = m.toolCalls.map((tc) => {
    if (!tc.output || tc.output.length <= MAX_TOOL_OUTPUT_IN_STORAGE) return tc;
    return {
      ...tc,
      output: `${tc.output.slice(0, MAX_TOOL_OUTPUT_IN_STORAGE)}\n\n[…truncado para persistencia, ${tc.output.length} bytes originales]`,
    };
  });
  return { ...m, toolCalls: thinnedToolCalls };
}

function serializeBubbles(bubbles: Bubble[]): string {
  const serializable = bubbles.map((b) => ({
    ...b,
    status: 'idle' as const,
    unread: 0,
    // Solo los últimos N mensajes + sus tool outputs truncados.
    messages: b.messages.slice(-MAX_MESSAGES_IN_STORAGE).map(thinMessageForStorage),
  }));
  return JSON.stringify(serializable);
}

function persist(bubbles: Bubble[], activeId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const json = serializeBubbles(bubbles);
    // Deduplicamos contra lo que ya hay en disco. Esto evita el ping-pong
    // entre ventanas (principal + ventana "solo bubble"): cuando una ventana
    // adopta el estado escrito por la otra vía el evento `storage`, re-serializa
    // contenido idéntico — si no comparamos, lo re-escribiríamos y dispararíamos
    // otro `storage` event en bucle.
    if (json !== window.localStorage.getItem(STORAGE_KEY)) {
      window.localStorage.setItem(STORAGE_KEY, json);
    }
    if (activeId) window.localStorage.setItem(ACTIVE_KEY, activeId);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch { /* quota or disabled */ }
}

export type UseBubblesResult = {
  bubbles: Bubble[];
  activeBubble: Bubble | null;
  activeBubbleId: string | null;
  createBubble: (opts?: { id?: string; title?: string; workspace?: string; focus?: boolean; baseBranch?: string }) => Bubble;
  removeBubble: (id: string) => void;
  archiveBubble: (id: string) => void;
  unarchiveBubble: (id: string) => void;
  deletePermanently: (id: string) => void;
  focusBubble: (id: string) => void;
  renameBubble: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  appendMessage: (bubbleId: string, message: Message) => void;
  updateMessage: (bubbleId: string, messageId: string, updater: (m: Message) => Message) => void;
  setBubbleStatus: (id: string, status: Bubble['status']) => void;
  setBubbleSessionId: (id: string, sessionId: string) => void;
  setBubbleMessages: (id: string, updater: (messages: Message[]) => Message[]) => void;
  setBubbleWorkspace: (id: string, workspace: string) => void;
  setBubbleCategory: (id: string, categoryId: string | undefined) => void;
  setBubblePtyOpen: (id: string, open: boolean) => void;
};

export function useBubbles(defaultWorkspace = ''): UseBubblesResult {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => loadStored().bubbles);
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(() => loadStored().activeId);

  const initializedRef = useRef(false);

  // No crear "Conversación principal" automática. Si hay burbujas guardadas,
  // restauramos activeBubbleId si es necesario. Sin burbujas → dashboard vacío.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (bubbles.length > 0 && (!activeBubbleId || !bubbles.some((b) => b.id === activeBubbleId))) {
      const first = bubbles[0];
      if (first) setActiveBubbleId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Silenciamos defaultWorkspace para no romper sus consumidores en el render inicial
  void defaultWorkspace;

  // Persist on changes
  useEffect(() => {
    persist(bubbles, activeBubbleId);
  }, [bubbles, activeBubbleId]);

  // Sync entre ventanas de la misma origin (ventana principal + ventanas
  // "solo bubble" de Electron comparten localStorage). Cuando otra ventana
  // escribe el store, reconciliamos: adoptamos su versión salvo para los
  // bubbles que ESTA ventana está streameando ahora (su copia en memoria es
  // más fresca que el disco — no la pisamos para no cortar el stream).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const remote = loadStored().bubbles;
      setBubbles((local) => {
        const localById = new Map(local.map((b) => [b.id, b]));
        const merged = remote.map((r) => {
          const l = localById.get(r.id);
          if (l && l.status !== 'idle') return l;
          return r;
        });
        // Bubbles locales aún no reflejados en disco (creados acá y todavía
        // no persistidos por la otra ventana) — los conservamos.
        for (const l of local) {
          if (!merged.some((m) => m.id === l.id)) merged.push(l);
        }
        return merged;
      });
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Sync ligero hacia el backend para que clientes externos (MCP server stdio
  // del Claude Code, etc.) puedan listar las bubbles vía GET /bubbles sin
  // tener acceso al localStorage. Debouncea para no spamear el endpoint
  // durante streaming de mensajes (status flips de thinking → executing →
  // idle disparan varios re-renders por turn).
  useEffect(() => {
    const summary = bubbles.map((b) => ({
      id: b.id,
      title: b.title,
      workspace: b.workspace,
      status: b.status,
      archived: !!b.archived,
      updatedAt: b.updatedAt,
    }));
    const handle = setTimeout(() => {
      void apiFetch('/bubbles/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bubbles: summary }),
      }).catch(() => { /* sync best-effort */ });
    }, 800);
    return () => clearTimeout(handle);
  }, [bubbles]);

  const createBubble = useCallback((opts?: { id?: string; title?: string; workspace?: string; focus?: boolean; baseBranch?: string }): Bubble => {
    const accent = nextAccent(bubbles);
    const workspace = opts?.workspace ?? defaultWorkspace;
    const baseBranch = opts?.baseBranch?.trim() || undefined;
    // `opts.id` viene cuando el origen es el backend (MCP server externo) y
    // ya generó un bubbleId server-side. En el flujo normal (UI / voice /
    // tool interno) opts.id es undefined y autogeneramos.
    const presetId = opts?.id?.trim() || null;
    // Si el id ya existe en estado (raro: la bubble ya fue materializada
    // antes — ej. el frontend recibió el client_action dos veces), devolvemos
    // la existente sin duplicar.
    if (presetId) {
      const existing = bubbles.find((b) => b.id === presetId);
      if (existing) {
        if (opts?.focus !== false) setActiveBubbleId(existing.id);
        return existing;
      }
    }
    const bubble: Bubble = {
      id: presetId ?? newId('b'),
      title: opts?.title?.trim() || translate('agent.default_title', loadLang(), { n: bubbles.length + 1 }),
      workspace,
      sessionId: null,
      messages: [],
      status: 'idle',
      unread: 0,
      accent,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      baseBranch,
    };
    setBubbles((prev) => [...prev, bubble]);
    if (opts?.focus !== false) setActiveBubbleId(bubble.id);
    // Si hay workspace, pre-creamos el worktree con la baseBranch elegida.
    // Fire-and-forget — el worktree es idempotente y el backend cae al
    // fallback si workspace no es repo o si la rama no existe.
    if (workspace) {
      void apiFetch('/worktree/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bubbleId: bubble.id, workspace, baseBranch }),
      }).catch(() => { /* noop */ });
    }
    return bubble;
  }, [bubbles, defaultWorkspace]);

  // Prefijos de localStorage por-bubble. Separados en dos grupos:
  //  - RUNTIME: state efímero (URL del browser, comandos del dev server,
  //    config de panes, etc.). Se limpia al ARCHIVAR — no tienen sentido
  //    sin procesos vivos y se regenera al des-archivar.
  //  - PERSISTENT: state del trabajo (notas, files state, git subtab,
  //    detail tab). Se conserva al archivar para que al des-archivar
  //    todo vuelva como estaba. Solo se limpia al ELIMINAR DEFINITIVAMENTE.
  const RUNTIME_PREFIXES = [
    'eco.dev.cmd.', 'eco.dev.dual.', 'eco.dev.config_collapsed.',
    'eco.dev.min.frontend.', 'eco.dev.min.backend.', 'eco.dev.restartmode.',
    'eco.browser.url.', 'eco.browser.tabs.',
    'eco.remote.',
    'eco.terminals.', 'eco.terminals.active.',
  ];
  const PERSISTENT_PREFIXES = [
    'eco.browser.zoom.',
    'eco.detail.tab.',
    'eco.git.subtab.',
    'eco.git.splitter.changes.', 'eco.git.splitter.history.',
    'eco.git.pending_pr.', 'eco.git.selected_pr.',
    'eco.git.selected_commit.', 'eco.git.selected_file.',
    'eco.git.history.all_branches.',
    'eco.files.openTabs.', 'eco.files.activeFile.',
    'eco.files.expanded.', 'eco.files.splitter.',
    'eco.notes.', 'eco.notes.splitter.', 'eco.notes.preview.',
  ];

  function clearRuntimeKeys(id: string) {
    try {
      for (const p of RUNTIME_PREFIXES) window.localStorage.removeItem(`${p}${id}`);
      for (const role of ['frontend', 'backend']) {
        window.localStorage.removeItem(`eco.dev.cmd.${role}.${id}`);
      }
      for (const role of ['main', 'frontend', 'backend']) {
        window.localStorage.removeItem(`eco.dev.logheight.${id}.${role}`);
      }
      window.localStorage.removeItem(`eco.dev.dual.${id}.touched`);
    } catch { /* noop */ }
  }

  function clearPersistentKeys(id: string) {
    try {
      for (const p of PERSISTENT_PREFIXES) window.localStorage.removeItem(`${p}${id}`);
    } catch { /* noop */ }
  }

  // Archivar: soft delete. Mata PTY + dev servers en backend (keepWorktree),
  // marca archived=true + archivedAt. Limpia state runtime de localStorage
  // pero conserva chat, notas, files state, etc.
  const archiveBubble = useCallback((id: string) => {
    setBubbles((prev) => prev.map((b) => b.id === id
      ? { ...b, archived: true, archivedAt: Date.now(), pinned: false }
      : b,
    ));
    setActiveBubbleId((cur) => {
      if (cur !== id) return cur;
      const remaining = bubbles.filter((b) => b.id !== id && !b.archived);
      return remaining[0]?.id ?? null;
    });
    void apiFetch('/bubble/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bubbleId: id }),
    }).catch(() => { /* noop */ });
    clearRuntimeKeys(id);
  }, [bubbles]);

  // Des-archivar: solo cambia el flag. NO toca backend porque el worktree
  // sigue intacto; el PTY/dev servers se reactivan a demanda cuando el user
  // entra a las tabs.
  const unarchiveBubble = useCallback((id: string) => {
    setBubbles((prev) => prev.map((b) => b.id === id
      ? { ...b, archived: false, archivedAt: undefined }
      : b,
    ));
  }, []);

  // Eliminar definitivamente: borra worktree + branch + TODAS las keys de
  // localStorage + saca el bubble del array. Irreversible.
  const deletePermanently = useCallback((id: string) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id));
    setActiveBubbleId((cur) => {
      if (cur !== id) return cur;
      const remaining = bubbles.filter((b) => b.id !== id);
      return remaining[0]?.id ?? null;
    });
    void apiFetch('/bubble/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bubbleId: id }),
    }).catch(() => { /* noop */ });
    clearRuntimeKeys(id);
    clearPersistentKeys(id);
  }, [bubbles]);

  // Alias retro-compat: el comportamiento default del menú del agente y de
  // los comandos de voz cambió a ARCHIVAR. Los call sites que esperaban
  // "remove" ahora archivan automáticamente.
  const removeBubble = archiveBubble;

  const focusBubble = useCallback((id: string) => {
    setActiveBubbleId(id);
    setBubbles((prev) => prev.map((b) => b.id === id ? { ...b, unread: 0 } : b));
  }, []);

  const renameBubble = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setBubbles((prev) => prev.map((b) => b.id === id ? { ...b, title: trimmed, updatedAt: Date.now() } : b));
  }, []);

  const togglePin = useCallback((id: string) => {
    setBubbles((prev) => prev.map((b) => b.id === id ? { ...b, pinned: !b.pinned } : b));
  }, []);

  const setBubbleStatus = useCallback((id: string, status: Bubble['status']) => {
    setBubbles((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
  }, []);

  const setBubblePtyOpen = useCallback((id: string, open: boolean) => {
    setBubbles((prev) => prev.map((b) => b.id === id ? { ...b, ptyOpen: open } : b));
  }, []);

  const setBubbleSessionId = useCallback((id: string, sessionId: string) => {
    setBubbles((prev) => prev.map((b) => b.id === id ? { ...b, sessionId } : b));
  }, []);

  const appendMessage = useCallback((bubbleId: string, message: Message) => {
    setBubbles((prev) => prev.map((b) => {
      if (b.id !== bubbleId) return b;
      const isActive = bubbleId === activeBubbleId;
      const next = [...b.messages, message];
      // Cap en memoria: drop silencioso de los más viejos cuando crecemos.
      const trimmed = next.length > MAX_MESSAGES_IN_MEMORY
        ? next.slice(-MAX_MESSAGES_IN_MEMORY)
        : next;
      return {
        ...b,
        messages: trimmed,
        unread: isActive ? 0 : (message.role === 'assistant' ? b.unread + 1 : b.unread),
        updatedAt: Date.now(),
      };
    }));
  }, [activeBubbleId]);

  const updateMessage = useCallback((bubbleId: string, messageId: string, updater: (m: Message) => Message) => {
    setBubbles((prev) => prev.map((b) => {
      if (b.id !== bubbleId) return b;
      return {
        ...b,
        messages: b.messages.map((m) => m.id === messageId ? updater(m) : m),
        updatedAt: Date.now(),
      };
    }));
  }, []);

  const setBubbleMessages = useCallback((id: string, updater: (messages: Message[]) => Message[]) => {
    setBubbles((prev) => prev.map((b) => b.id === id ? { ...b, messages: updater(b.messages), updatedAt: Date.now() } : b));
  }, []);

  const setBubbleWorkspace = useCallback((id: string, workspace: string) => {
    setBubbles((prev) => prev.map((b) =>
      b.id === id ? { ...b, workspace, sessionId: null, updatedAt: Date.now() } : b,
    ));
  }, []);

  const setBubbleCategory = useCallback((id: string, categoryId: string | undefined) => {
    setBubbles((prev) => prev.map((b) =>
      b.id === id ? { ...b, categoryId, updatedAt: Date.now() } : b,
    ));
  }, []);

  const activeBubble = bubbles.find((b) => b.id === activeBubbleId) ?? null;

  return {
    bubbles,
    activeBubble,
    activeBubbleId,
    createBubble,
    removeBubble,
    archiveBubble,
    unarchiveBubble,
    deletePermanently,
    focusBubble,
    renameBubble,
    togglePin,
    appendMessage,
    updateMessage,
    setBubbleStatus,
    setBubbleSessionId,
    setBubbleMessages,
    setBubbleWorkspace,
    setBubbleCategory,
    setBubblePtyOpen,
  };
}
