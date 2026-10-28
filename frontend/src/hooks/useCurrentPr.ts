import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { on as ecoOn } from '@/lib/eco-bus';

export type CurrentPr = {
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED' | string;
  isDraft: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | string;
  headRefName: string;
  baseRefName: string;
  author: string;
};

type CurrentPrResult =
  | { ok: true; pr: CurrentPr | null }
  | { ok: false; error: string };

// El PR de la rama actual cambia casi siempre por fuera de la UI: el agente
// corre `gh pr create` / `gh pr merge` en su terminal. Nada de eso emite
// `eco:git_refresh`, así que antes el bloque Git del sidebar solo se enteraba
// al remontarse (colapsar y abrir). Este store comparte un solo fetch por
// (workspace, bubble) entre GitMiniDock y CurrentPrBanner y lo refresca
// cuando el PTY se aquieta, al volver a la ventana y con un poll lento.
const POLL_MS = 60_000;
// `pty_busy_change` cae a false en cada pausa de 1.5 s del output (pensando,
// esperando una tool), varias veces por turno: sin el gap, cada pausa
// spawnearía un `gh pr view` contra GitHub.
const IDLE_MIN_GAP_MS = 10_000;
const IDLE_DELAY_MS = 800;
// Tras `gh pr merge`, GitHub a veces tarda en propagar y la primera consulta
// todavía devuelve OPEN; el follow-up captura el estado ya propagado.
const FOLLOW_UP_MS = 1500;
const STALE_MS = 15_000;

type Entry = {
  pr: CurrentPr | null;
  loaded: boolean;
  lastFetchAt: number;
  inflight: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  timerAt: number;
  subs: Set<() => void>;
  stop: (() => void) | null;
};

const entries = new Map<string, Entry>();
const keyOf = (workspace: string, bubbleId: string) => `${workspace}|${bubbleId}`;

function entryFor(workspace: string, bubbleId: string): Entry {
  const key = keyOf(workspace, bubbleId);
  let e = entries.get(key);
  if (!e) {
    e = { pr: null, loaded: false, lastFetchAt: 0, inflight: null, timer: null, timerAt: 0, subs: new Set(), stop: null };
    entries.set(key, e);
  }
  return e;
}

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function samePr(a: CurrentPr | null, b: CurrentPr | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.number === b.number && a.title === b.title && a.url === b.url
    && a.state === b.state && a.isDraft === b.isDraft && a.mergeable === b.mergeable
    && a.headRefName === b.headRefName && a.baseRefName === b.baseRefName && a.author === b.author;
}

function fetchNow(e: Entry, workspace: string, bubbleId: string): Promise<void> {
  if (e.inflight) return e.inflight;
  e.inflight = (async () => {
    let changed = false;
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      const r = await apiFetch(`/git/pr/current?${params}`);
      if (r.ok) {
        const d = await r.json() as CurrentPrResult;
        const next = d.ok ? d.pr : null;
        changed = !samePr(e.pr, next);
        e.pr = next;
      }
    } catch {
      // gh ausente o sin red: conservamos el último valor conocido.
    } finally {
      const first = !e.loaded;
      e.loaded = true;
      e.lastFetchAt = Date.now();
      e.inflight = null;
      if (first || changed) e.subs.forEach((fn) => fn());
    }
  })();
  return e.inflight;
}

// Un solo timer por entry; si ya hay uno más próximo, gana ese (cualquier
// fetch satisface a todos los pedidos pendientes).
function schedule(e: Entry, workspace: string, bubbleId: string, delayMs: number) {
  const at = Date.now() + delayMs;
  if (e.timer && e.timerAt <= at) return;
  if (e.timer) clearTimeout(e.timer);
  e.timerAt = at;
  e.timer = setTimeout(() => {
    e.timer = null;
    if (visible()) void fetchNow(e, workspace, bubbleId);
  }, delayMs);
}

function startWatch(e: Entry, workspace: string, bubbleId: string) {
  const offRefresh = ecoOn('eco:git_refresh', (ev) => {
    if (ev.bubbleId !== bubbleId) return;
    void fetchNow(e, workspace, bubbleId);
    schedule(e, workspace, bubbleId, FOLLOW_UP_MS);
  });
  const offIdle = ecoOn('eco:pty_busy_change', (ev) => {
    if (ev.bubbleId !== bubbleId || ev.busy) return;
    schedule(e, workspace, bubbleId, Math.max(IDLE_DELAY_MS, e.lastFetchAt + IDLE_MIN_GAP_MS - Date.now()));
  });
  const onVisibility = () => {
    if (visible() && Date.now() - e.lastFetchAt > STALE_MS) void fetchNow(e, workspace, bubbleId);
  };
  document.addEventListener('visibilitychange', onVisibility);
  const poll = setInterval(() => {
    if (visible()) void fetchNow(e, workspace, bubbleId);
  }, POLL_MS);
  e.stop = () => {
    offRefresh();
    offIdle();
    document.removeEventListener('visibilitychange', onVisibility);
    clearInterval(poll);
    if (e.timer) { clearTimeout(e.timer); e.timer = null; }
  };
}

export function useCurrentPr(workspace: string, bubbleId: string): {
  pr: CurrentPr | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [, bump] = useState(0);
  const active = !!workspace && !!bubbleId;

  useEffect(() => {
    if (!active) return;
    const e = entryFor(workspace, bubbleId);
    const sub = () => bump((n) => n + 1);
    e.subs.add(sub);
    if (e.subs.size === 1) startWatch(e, workspace, bubbleId);
    void fetchNow(e, workspace, bubbleId);
    return () => {
      e.subs.delete(sub);
      if (e.subs.size === 0 && e.stop) { e.stop(); e.stop = null; }
    };
  }, [active, workspace, bubbleId]);

  const refresh = useCallback(() => {
    if (!active) return Promise.resolve();
    return fetchNow(entryFor(workspace, bubbleId), workspace, bubbleId);
  }, [active, workspace, bubbleId]);

  const e = active ? entries.get(keyOf(workspace, bubbleId)) : undefined;
  return { pr: e?.pr ?? null, loading: active ? !(e?.loaded ?? false) : false, refresh };
}
