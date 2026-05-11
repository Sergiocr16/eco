import type { Bubble } from './types';

export type MetaAction =
  | { kind: 'goto_dashboard' }
  | { kind: 'goto_settings' }
  | { kind: 'goto_files' }
  | { kind: 'goto_history' }
  | { kind: 'create_bubble'; title?: string; followUp?: string }
  | { kind: 'rename_active'; title: string }
  | { kind: 'close_active' }
  | { kind: 'focus_bubble'; bubbleId: string }
  | { kind: 'list_bubbles' }
  | { kind: 'help' }
  | { kind: 'noop' };

const WAKE_PREFIX = /^\s*(?:hey\s+)?(?:eco+|ech+o+|h[eé]ctor|ekko|hey\s+jarvis|jarvis)[\s,:¡!.?-]*/i;

export function stripWakePrefix(text: string): { isMeta: boolean; rest: string } {
  const m = WAKE_PREFIX.exec(text);
  if (!m) return { isMeta: false, rest: text };
  return { isMeta: true, rest: text.slice(m[0].length).trim() };
}

export function parseMetaCommand(rest: string, bubbles: Bubble[]): MetaAction {
  const norm = rest.toLowerCase().trim();
  if (!norm) return { kind: 'noop' };

  // Help
  if (/^(ayuda|help|qu[eé] pod[ée]s hacer)/.test(norm)) return { kind: 'help' };

  // Listar / mostrar conversaciones / volver al inicio
  if (/^(listame|mostrame|muestrame|ense[nñ]ame|dame|qu[eé] hay)\s+(?:el|los|las)?\s*(?:burbujas?|conversaci[oó]n(es)?|chats?|agentes?|activas?|activos?)/.test(norm)
      || /^(volv[eé]r?|regres[aá]r?|ir)\s+(?:al?|a la|a)?\s*(inicio|dashboard|principal|home)/.test(norm)) {
    return { kind: 'list_bubbles' };
  }

  // Ir a ajustes / archivos / historial
  if (/(?:abr[íi]r?|ir a|mostr[áa]r?|llev[áa]r?)\s+(?:los?|las?)?\s*(ajustes|configuraci[oó]n|settings)/.test(norm)) {
    return { kind: 'goto_settings' };
  }
  if (/(?:abr[íi]r?|ir a|mostr[áa]r?|llev[áa]r?)\s+(?:los?|las?)?\s*(archivos?|files?|carpetas?)/.test(norm)) {
    return { kind: 'goto_files' };
  }
  if (/(?:abr[íi]r?|ir a|mostr[áa]r?)\s+(?:el|la)?\s*(historial|history)/.test(norm)) {
    return { kind: 'goto_history' };
  }

  // Cerrar la conversación activa
  if (/^(cerr[áa]r?|elimin[áa]r?|borr[áa]r?|destru[íi]r?|saca[r]?)\s+(?:esta|la|el)?\s*(burbuja|conversaci[oó]n|chat|agente)?/.test(norm)) {
    return { kind: 'close_active' };
  }

  // Renombrar la activa
  const renameMatch = /^(?:renombr[áa]r?|renombr[ar]|cambi[áa]r? el? nombre|llam[áa]r?(?:la)?|ponel[ea]?\s+(?:de )?nombre)\s+(?:esta|la|el)?\s*(?:burbuja|conversaci[oó]n|chat)?\s*(?:a|como|por)?\s*["']?(.{2,80}?)["']?\s*$/i.exec(rest);
  if (renameMatch) return { kind: 'rename_active', title: renameMatch[1]!.trim() };

  // Crear nueva burbuja
  const createMatch = /^(?:abr[íi]r?|cre[áa]r?|nuev[ao]|inici[áa]r?|empez[áa]r?)\s+(?:una?\s+)?(?:nueva\s+)?(?:burbuja|conversaci[oó]n|chat|agente|ventana|terminal)\s*(?:nueva)?\s*(?:para|sobre|de|con|llamada?)?\s*["']?(.{2,80}?)["']?\s*$/i.exec(rest);
  if (createMatch) {
    const title = createMatch[1]?.trim();
    return { kind: 'create_bubble', title: title || undefined };
  }
  if (/^(?:abr[íi]r?|cre[áa]r?|nuev[ao]|inici[áa]r?)\s+(?:una?\s+)?(?:nueva\s+)?(?:burbuja|conversaci[oó]n|chat|agente|ventana|terminal)/.test(norm)) {
    return { kind: 'create_bubble' };
  }

  // Ir a una burbuja por título (fuzzy)
  const gotoMatch = /^(?:and[áa]r?|v[áa]r?|ir|llev[áa]r?(?:me)?|mostr[áa]r?(?:me)?|abr[íi]r?)\s+(?:a la?|al?|hacia|hasta)?\s*(?:burbuja|conversaci[oó]n|chat|agente)?\s*(?:de|sobre|llamada?)?\s*["']?(.{2,80}?)["']?\s*$/i.exec(rest);
  if (gotoMatch) {
    const q = gotoMatch[1]!.trim().toLowerCase();
    const target = findBubbleByQuery(q, bubbles);
    if (target) return { kind: 'focus_bubble', bubbleId: target.id };
  }

  return { kind: 'noop' };
}

function findBubbleByQuery(q: string, bubbles: Bubble[]): Bubble | null {
  if (!q) return null;
  // exact match
  let best: { score: number; bubble: Bubble } | null = null;
  for (const b of bubbles) {
    const title = b.title.toLowerCase();
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 70;
    else if (title.includes(q)) score = 40;
    else {
      const words = q.split(/\s+/).filter(Boolean);
      const matches = words.filter((w) => title.includes(w)).length;
      score = words.length ? Math.round((matches / words.length) * 30) : 0;
    }
    if (score > 0 && (!best || score > best.score)) best = { score, bubble: b };
  }
  return best && best.score >= 30 ? best.bubble : null;
}
