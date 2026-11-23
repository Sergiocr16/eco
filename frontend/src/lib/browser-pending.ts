// Pedidos del MCP (`open_browser`) para el navegador de una bubble que todavía
// no está montado: el AgentDetail o el BrowserPanel los toman al montar. Sin
// esto, un `eco:switch_tab`/`eco:browser_navigate` emitido antes del montaje se
// pierde y la tool espera un webview que nunca aparece.

import { emit as ecoEmit } from './eco-bus';

const pendingShow = new Set<string>();
const pendingUrl = new Map<string, string>();

export function queueBrowserOpen(bubbleId: string, url?: string): void {
  pendingShow.add(bubbleId);
  if (url) pendingUrl.set(bubbleId, url);
}

export function takeBrowserShow(bubbleId: string): boolean {
  return pendingShow.delete(bubbleId);
}

export function takeBrowserUrl(bubbleId: string): string | undefined {
  const url = pendingUrl.get(bubbleId);
  pendingUrl.delete(bubbleId);
  return url;
}

// Última vez que un agente usó el navegador de cada bubble. Los clientes sin
// <webview> (web / iPad) lo usan para pasar al espejo del escritorio, también
// si el BrowserPanel se monta después del aviso.
const ACTIVITY_FRESH_MS = 90_000;
const activityAt = new Map<string, number>();

export function noteBrowserActivity(bubbleId: string): void {
  activityAt.set(bubbleId, Date.now());
  ecoEmit('eco:browser_activity', { bubbleId });
}

export function hasRecentBrowserActivity(bubbleId: string): boolean {
  return Date.now() - (activityAt.get(bubbleId) ?? 0) < ACTIVITY_FRESH_MS;
}
