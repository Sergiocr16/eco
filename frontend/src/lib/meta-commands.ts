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
  | { kind: 'next_bubble' }
  | { kind: 'prev_bubble' }
  | { kind: 'show_status' }
  | { kind: 'pause_active' }
  | { kind: 'resume_active' }
  | { kind: 'toggle_voice'; on: boolean }
  | { kind: 'set_theme'; mode: 'dark' | 'light' | 'system' }
  | { kind: 'help' }
  | { kind: 'unknown' };

export type MetaActionFeedback = {
  title: string;
  detail?: string;
};

const WAKE_PREFIX = /^\s*(?:hey\s+)?(?:eco+|ech+o+|h[eé]ctor|ekko|hey\s+jarvis|jarvis)[\s,:¡!.?-]*/i;

export function stripWakePrefix(text: string): { isMeta: boolean; rest: string } {
  const m = WAKE_PREFIX.exec(text);
  if (!m) return { isMeta: false, rest: text };
  return { isMeta: true, rest: text.slice(m[0].length).trim() };
}

const RX = {
  help:        /^(ayuda|help|qu[eé] pod[ée]s hacer|qu[eé] comandos|comandos?)\b/i,
  status:      /^(estado|status|qu[eé] hay (?:activo|pasando)|resumen|dame (?:un|el) (?:estado|resumen)|c[oó]mo (?:va|vamos|est[áa]n)|qu[eé] est[áa] (?:activo|pasando))/i,
  goto_dashboard: /^(volv[eé]r?|regres[aá]r?|ir|sal[ií]r?|salir)\s+(?:al?|a la|a|del)?\s*(?:inicio|dashboard|principal|home|men[uú]|tablero)\b|^(?:inicio|dashboard|principal|home)\b/i,
  goto_settings:  /(?:abr[íi]r?|ir a|mostr[áa]r?|llev[áa]r?(?:me)?|configurar?)\s+(?:los?|las?)?\s*(?:ajustes|configuraci[oó]n|settings|preferencias)\b|^(?:ajustes|configuraci[oó]n|settings)\b/i,
  goto_files:     /(?:abr[íi]r?|ir a|mostr[áa]r?|llev[áa]r?(?:me)?)\s+(?:los?|las?)?\s*(?:archivos?|files?|carpetas?)\b|^(?:archivos|files|carpetas)\b/i,
  goto_history:   /(?:abr[íi]r?|ir a|mostr[áa]r?(?:me)?)\s+(?:el|la)?\s*(?:historial|history)\b|^historial\b/i,
  next_bubble:    /^(siguiente|pr[oó]xim[ao]|despu[eé]s|avanz[áa]r?)(?:\s+(?:burbuja|conversaci[oó]n|chat))?\b/i,
  prev_bubble:    /^(anterior|previ[ao]|antes|atr[áa]s|regres[aá]r? una)(?:\s+(?:burbuja|conversaci[oó]n|chat))?\b/i,
  close_active:   /^(cerr[áa]r?|elimin[áa]r?|borr[áa]r?|saca|destru[íi]r?|matar?)\s+(?:esta|la|el)?\s*(?:burbuja|conversaci[oó]n|chat|agente)?\b/i,
  pause_active:   /^(pausa[r]?|paus[áa]|deten[eé]r?|frena[r]?|alto|stop)\s*(?:esta|la|el)?\s*(?:burbuja|conversaci[oó]n|chat|agente)?\b/i,
  resume_active:  /^(reanud[áa]r?|continu[áa]r?|sigue|sig[áa]|despausa[r]?|reanudar)/i,
  voice_on:       /^(habl[áa]|prend[ée] (?:la )?voz|activ[áa] (?:la )?voz|deci|leeme)/i,
  voice_off:      /^(silencio|c[áa]llate|callate|apag[áa] (?:la )?voz|deja de hablar|no hables|mute)/i,
  theme_dark:     /^(modo )?(?:oscuro|dark|noche)\b/i,
  theme_light:    /^(modo )?(?:claro|light|d[íi]a|brillante)\b/i,
  theme_system:   /^(modo )?(?:sistema|system|autom[áa]tico)\b/i,
  rename_active:  /^(?:renombr[áa]r?|renombr[ar]|cambi[áa]r? el? nombre|llam[áa]r?(?:la)?|ponel[ea]?\s+(?:de )?nombre|p[oó]nel[ea]?)\s+(?:esta|la|el)?\s*(?:burbuja|conversaci[oó]n|chat)?\s*(?:a|como|por)?\s*["']?(.{2,80}?)["']?\s*$/i,
  create_with:    /^(?:abr[íi]r?|cre[áa]r?|nuev[ao]|inici[áa]r?|empez[áa]r?)\s+(?:una?\s+)?(?:nueva\s+)?(?:burbuja|conversaci[oó]n|chat|agente|ventana|terminal)\s*(?:nueva)?\s*(?:para|sobre|de|con|llamada?)?\s*["']?(.{2,80}?)["']?\s*$/i,
  create_bare:    /^(?:abr[íi]r?|cre[áa]r?|nuev[ao]|inici[áa]r?)\s+(?:una?\s+)?(?:nueva\s+)?(?:burbuja|conversaci[oó]n|chat|agente|ventana|terminal)/i,
  goto_bubble:    /^(?:and[áa]r?|v[áa]r?|ir|llev[áa]r?(?:me)?|mostr[áa]r?(?:me)?|abr[íi]r?|cambi[áa]r? a)\s+(?:a la?|al?|hacia|hasta)?\s*(?:burbuja|conversaci[oó]n|chat|agente)?\s*(?:de|sobre|llamada?|llamado)?\s*["']?(.{2,80}?)["']?\s*$/i,
};

export function parseMetaCommand(rest: string, bubbles: Bubble[], activeBubbleId: string | null): MetaAction {
  const text = rest.trim();
  if (!text) return { kind: 'unknown' };

  if (RX.help.test(text)) return { kind: 'help' };
  if (RX.status.test(text)) return { kind: 'show_status' };
  if (RX.goto_dashboard.test(text)) return { kind: 'goto_dashboard' };
  if (RX.goto_settings.test(text)) return { kind: 'goto_settings' };
  if (RX.goto_files.test(text)) return { kind: 'goto_files' };
  if (RX.goto_history.test(text)) return { kind: 'goto_history' };
  if (RX.next_bubble.test(text)) return { kind: 'next_bubble' };
  if (RX.prev_bubble.test(text)) return { kind: 'prev_bubble' };
  if (RX.close_active.test(text)) return { kind: 'close_active' };
  if (RX.pause_active.test(text)) return { kind: 'pause_active' };
  if (RX.resume_active.test(text)) return { kind: 'resume_active' };
  if (RX.voice_off.test(text)) return { kind: 'toggle_voice', on: false };
  if (RX.voice_on.test(text)) return { kind: 'toggle_voice', on: true };
  if (RX.theme_dark.test(text)) return { kind: 'set_theme', mode: 'dark' };
  if (RX.theme_light.test(text)) return { kind: 'set_theme', mode: 'light' };
  if (RX.theme_system.test(text)) return { kind: 'set_theme', mode: 'system' };

  const rename = RX.rename_active.exec(text);
  if (rename && rename[1]) return { kind: 'rename_active', title: rename[1].trim() };

  const create = RX.create_with.exec(text);
  if (create && create[1]) {
    const title = create[1].trim();
    return { kind: 'create_bubble', title };
  }
  if (RX.create_bare.test(text)) return { kind: 'create_bubble' };

  const goto = RX.goto_bubble.exec(text);
  if (goto && goto[1]) {
    const q = goto[1].trim().toLowerCase();
    const target = findBubbleByQuery(q, bubbles, activeBubbleId);
    if (target) return { kind: 'focus_bubble', bubbleId: target.id };
  }

  return { kind: 'unknown' };
}

function findBubbleByQuery(q: string, bubbles: Bubble[], activeBubbleId: string | null): Bubble | null {
  if (!q) return null;
  let best: { score: number; bubble: Bubble } | null = null;
  for (const b of bubbles) {
    if (b.id === activeBubbleId) continue;
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

// Feedback humano para mostrar al user qué se ejecutó
export function describeAction(action: MetaAction, bubbles: Bubble[]): MetaActionFeedback {
  switch (action.kind) {
    case 'goto_dashboard': return { title: 'Volviendo al inicio' };
    case 'goto_settings':  return { title: 'Ajustes' };
    case 'goto_files':     return { title: 'Archivos' };
    case 'goto_history':   return { title: 'Historial' };
    case 'create_bubble':  return { title: 'Nueva burbuja', detail: action.title ?? 'Sin título' };
    case 'rename_active':  return { title: 'Renombrada', detail: action.title };
    case 'close_active':   return { title: 'Burbuja cerrada' };
    case 'focus_bubble': {
      const b = bubbles.find((x) => x.id === action.bubbleId);
      return { title: 'Yendo a', detail: b?.title ?? '' };
    }
    case 'next_bubble':    return { title: 'Siguiente burbuja' };
    case 'prev_bubble':    return { title: 'Burbuja anterior' };
    case 'show_status':    return { title: 'Estado de Eco' };
    case 'pause_active':   return { title: 'Pausada' };
    case 'resume_active':  return { title: 'Reanudada' };
    case 'toggle_voice':   return { title: action.on ? 'Voz activada' : 'Silencio' };
    case 'set_theme':      return { title: `Tema ${action.mode}` };
    case 'help':           return { title: 'Ayuda', detail: 'Comandos disponibles' };
    case 'unknown':        return { title: 'No entendí', detail: 'Probá «Eco ayuda»' };
  }
}

// Listado para el panel de ayuda
export const COMMAND_HELP: Array<{ example: string; desc: string }> = [
  { example: 'Eco abrí una burbuja para Aditum', desc: 'Crea una nueva conversación con título' },
  { example: 'Eco renombrá esta a Refactor pagos', desc: 'Cambia el título de la activa' },
  { example: 'Eco cerrá esta', desc: 'Cierra la burbuja activa' },
  { example: 'Eco andá a la de auth', desc: 'Va a la burbuja con ese nombre (fuzzy)' },
  { example: 'Eco siguiente / Eco anterior', desc: 'Navega entre burbujas' },
  { example: 'Eco mostrame las burbujas', desc: 'Vuelve al dashboard' },
  { example: 'Eco estado', desc: 'Resumen de todas las burbujas activas' },
  { example: 'Eco silencio / Eco hablá', desc: 'Apaga o prende la voz' },
  { example: 'Eco modo claro / oscuro', desc: 'Cambia el tema' },
  { example: 'Eco ajustes / archivos / historial', desc: 'Navega a esas secciones' },
];
