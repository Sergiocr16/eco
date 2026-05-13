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

function persist(bubbles: Bubble[], activeId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const serializable = bubbles.map((b) => ({
      ...b,
      status: 'idle' as const,
      unread: 0,
      // Solo los últimos N mensajes + sus tool outputs truncados.
      messages: b.messages.slice(-MAX_MESSAGES_IN_STORAGE).map(thinMessageForStorage),
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    if (activeId) window.localStorage.setItem(ACTIVE_KEY, activeId);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch { /* quota or disabled */ }
}

export type UseBubblesResult = {
  bubbles: Bubble[];
  activeBubble: Bubble | null;
  activeBubbleId: string | null;
  createBubble: (opts?: { title?: string; workspace?: string; focus?: boolean }) => Bubble;
  removeBubble: (id: string) => void;
  focusBubble: (id: string) => void;
  renameBubble: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  appendMessage: (bubbleId: string, message: Message) => void;
  updateMessage: (bubbleId: string, messageId: string, updater: (m: Message) => Message) => void;
  setBubbleStatus: (id: string, status: Bubble['status']) => void;
  setBubbleSessionId: (id: string, sessionId: string) => void;
  setBubbleMessages: (id: string, updater: (messages: Message[]) => Message[]) => void;
  setBubbleWorkspace: (id: string, workspace: string) => void;
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

  const createBubble = useCallback((opts?: { title?: string; workspace?: string; focus?: boolean }): Bubble => {
    const accent = nextAccent(bubbles);
    const bubble: Bubble = {
      id: newId('b'),
      title: opts?.title?.trim() || translate('agent.default_title', loadLang(), { n: bubbles.length + 1 }),
      workspace: opts?.workspace ?? defaultWorkspace,
      sessionId: null,
      messages: [],
      status: 'idle',
      unread: 0,
      accent,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setBubbles((prev) => [...prev, bubble]);
    if (opts?.focus !== false) setActiveBubbleId(bubble.id);
    return bubble;
  }, [bubbles, defaultWorkspace]);

  const removeBubble = useCallback((id: string) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id));
    setActiveBubbleId((cur) => {
      if (cur !== id) return cur;
      const remaining = bubbles.filter((b) => b.id !== id);
      return remaining[0]?.id ?? null;
    });
    // Best-effort: cleanup completo en backend (PTY + dev servers + worktree
    // + sessions Map). El endpoint /bubble/close engloba todo.
    void apiFetch('/bubble/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bubbleId: id }),
    }).catch(() => { /* noop */ });
    // Cleanup de localStorage: las keys "eco.*.<bubbleId>" sobrevivirían a la
    // bubble cerrada y crecen con cada nueva burbuja histórica. Las borramos
    // todas — el suffix por id es consistente y predecible.
    try {
      const prefixes = [
        'eco.dev.cmd.', 'eco.dev.dual.', 'eco.dev.config_collapsed.',
        'eco.dev.min.frontend.', 'eco.dev.min.backend.',
        'eco.browser.url.', 'eco.browser.zoom.',
        'eco.detail.tab.', 'eco.remote.',
      ];
      for (const p of prefixes) window.localStorage.removeItem(`${p}${id}`);
      // También las dual-mode meta y per-role command keys (`eco.dev.cmd.<role>.<id>`).
      for (const role of ['frontend', 'backend']) {
        window.localStorage.removeItem(`eco.dev.cmd.${role}.${id}`);
      }
      window.localStorage.removeItem(`eco.dev.dual.${id}.touched`);
    } catch { /* noop */ }
  }, [bubbles]);

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

  const activeBubble = bubbles.find((b) => b.id === activeBubbleId) ?? null;

  return {
    bubbles,
    activeBubble,
    activeBubbleId,
    createBubble,
    removeBubble,
    focusBubble,
    renameBubble,
    togglePin,
    appendMessage,
    updateMessage,
    setBubbleStatus,
    setBubbleSessionId,
    setBubbleMessages,
    setBubbleWorkspace,
    setBubblePtyOpen,
  };
}
