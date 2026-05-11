import type { Bubble } from './types';

export type MetaAction =
  | { kind: 'goto_dashboard' }
  | { kind: 'goto_settings' }
  | { kind: 'goto_files' }
  | { kind: 'goto_history' }
  | { kind: 'create_bubble'; title?: string }
  | { kind: 'open_or_create'; title: string }
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

// Tokens que decoran pero no aportan información: "una", "burbuja", "conversación", etc.
// Se filtran para que «abrir burbuja Aditum» = «abrir Aditum».
const FILLERS = new Set([
  'una', 'un', 'la', 'el', 'los', 'las',
  'burbuja', 'burbujas', 'conversacion', 'conversaciones',
  'chat', 'chats', 'agente', 'agentes', 'ventana', 'ventanas',
  'terminal', 'terminales',
  'a', 'al', 'a la', 'de', 'sobre', 'para', 'con', 'llamada', 'llamado',
  'nueva', 'nuevo',
]);

// Alias → comando canónico
const ALIASES: Record<string, string> = {
  // Navegación
  'dashboard': 'dashboard', 'inicio': 'dashboard', 'home': 'dashboard',
  'principal': 'dashboard', 'tablero': 'dashboard', 'menu': 'dashboard',
  'volver': 'dashboard', 'volve': 'dashboard', 'regresa': 'dashboard',
  'regresar': 'dashboard', 'salir': 'dashboard',

  'ajustes': 'settings', 'configuracion': 'settings', 'config': 'settings',
  'settings': 'settings', 'preferencias': 'settings',

  'archivos': 'files', 'files': 'files', 'carpetas': 'files',

  'historial': 'history', 'history': 'history',

  // Burbujas
  'abrir': 'create', 'abre': 'create', 'crear': 'create', 'crea': 'create',
  'nueva': 'create', 'nuevo': 'create', 'iniciar': 'create', 'empezar': 'create',
  'create': 'create',

  'renombrar': 'rename', 'renombra': 'rename', 'rename': 'rename',
  'rebautizar': 'rename', 'rebautiza': 'rename',

  'cerrar': 'close', 'cierra': 'close', 'borrar': 'close', 'borra': 'close',
  'eliminar': 'close', 'elimina': 'close', 'close': 'close', 'sacar': 'close',
  'destruir': 'close',

  'ir': 'goto', 've': 'goto', 'anda': 'goto', 'andate': 'goto',
  'cambiar': 'goto', 'cambia': 'goto', 'focus': 'goto', 'enfocar': 'goto',
  'enfoca': 'goto', 'mostrar': 'goto', 'mostrame': 'goto', 'muestrame': 'goto',
  'llevame': 'goto', 'llevar': 'goto',

  'siguiente': 'next', 'next': 'next', 'proxima': 'next', 'proximo': 'next',
  'despues': 'next', 'avanzar': 'next', 'avanza': 'next',

  'anterior': 'prev', 'prev': 'prev', 'previa': 'prev', 'previo': 'prev',
  'antes': 'prev', 'atras': 'prev',

  // Estado
  'estado': 'status', 'status': 'status', 'resumen': 'status',
  'lista': 'status', 'listar': 'status', 'listame': 'status',

  'pausar': 'pause', 'pausa': 'pause', 'pause': 'pause', 'detener': 'pause',
  'detene': 'pause', 'parar': 'pause', 'para': 'pause', 'frenar': 'pause',
  'stop': 'pause',

  'continuar': 'resume', 'continua': 'resume', 'reanudar': 'resume',
  'reanuda': 'resume', 'resume': 'resume', 'sigue': 'resume',

  // Voz
  'silencio': 'mute', 'mute': 'mute', 'callate': 'mute',
  'apaga': 'mute', 'apagar': 'mute',

  'hablar': 'unmute', 'habla': 'unmute', 'unmute': 'unmute',
  'leeme': 'unmute', 'prende': 'unmute', 'prender': 'unmute',

  // Tema
  'claro': 'theme_light', 'light': 'theme_light', 'dia': 'theme_light',
  'oscuro': 'theme_dark', 'dark': 'theme_dark', 'noche': 'theme_dark',
  'sistema': 'theme_system', 'system': 'theme_system', 'automatico': 'theme_system',

  // Ayuda
  'ayuda': 'help', 'help': 'help', 'comandos': 'help',
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove accents
    .replace(/[¿?¡!.,;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripQuotes(s: string): string {
  return s.replace(/^["'`]+|["'`]+$/g, '').trim();
}

function dropFillers(tokens: string[]): string[] {
  return tokens.filter((t) => !FILLERS.has(t));
}

export function parseMetaCommand(rest: string, bubbles: Bubble[], activeBubbleId: string | null): MetaAction {
  const text = rest.trim();
  if (!text) return { kind: 'unknown' };

  // Tomamos la primera palabra como keyword
  const norm = normalize(text);
  const tokens = norm.split(' ');
  const firstToken = tokens[0] ?? '';
  const commandKey = ALIASES[firstToken];

  if (!commandKey) return { kind: 'unknown' };

  // Argumento = resto del texto, con fillers removidos
  const restTokens = tokens.slice(1);
  const argRaw = stripQuotes(restTokens.join(' '));
  const argClean = dropFillers(restTokens).join(' ').trim();
  // Conservamos el texto original con casing/acentos para el título (más bonito)
  const titleFromOriginal = preserveCasing(rest, argRaw);

  switch (commandKey) {
    case 'dashboard': return { kind: 'goto_dashboard' };
    case 'settings':  return { kind: 'goto_settings' };
    case 'files':     return { kind: 'goto_files' };
    case 'history':   return { kind: 'goto_history' };
    case 'create': {
      if (!titleFromOriginal) return { kind: 'create_bubble' };
      // Smart 'abrir': si existe burbuja con ese nombre, focusea; sino crea.
      const existing = findBubbleByQuery(argClean, bubbles, null);
      if (existing) return { kind: 'focus_bubble', bubbleId: existing.id };
      return { kind: 'open_or_create', title: titleFromOriginal };
    }
    case 'rename': {
      if (!titleFromOriginal) return { kind: 'unknown' };
      return { kind: 'rename_active', title: titleFromOriginal };
    }
    case 'close':     return { kind: 'close_active' };
    case 'goto': {
      if (!argClean) return { kind: 'unknown' };
      const target = findBubbleByQuery(argClean, bubbles, activeBubbleId);
      if (target) return { kind: 'focus_bubble', bubbleId: target.id };
      return { kind: 'unknown' };
    }
    case 'next':         return { kind: 'next_bubble' };
    case 'prev':         return { kind: 'prev_bubble' };
    case 'status':       return { kind: 'show_status' };
    case 'pause':        return { kind: 'pause_active' };
    case 'resume':       return { kind: 'resume_active' };
    case 'mute':         return { kind: 'toggle_voice', on: false };
    case 'unmute':       return { kind: 'toggle_voice', on: true };
    case 'theme_light':  return { kind: 'set_theme', mode: 'light' };
    case 'theme_dark':   return { kind: 'set_theme', mode: 'dark' };
    case 'theme_system': return { kind: 'set_theme', mode: 'system' };
    case 'help':         return { kind: 'help' };
    default:             return { kind: 'unknown' };
  }
}

// Conserva el casing del texto original al extraer el argumento.
// Si el user escribió "Eco abrir Aditum", queremos "Aditum" no "aditum".
function preserveCasing(originalText: string, normalizedArg: string): string {
  if (!normalizedArg) return '';
  // Tomamos el sufijo del original después del primer token (la keyword)
  const trimmed = originalText.trim();
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) return '';
  let argFromOriginal = trimmed.slice(firstSpace + 1).trim();
  argFromOriginal = stripQuotes(argFromOriginal);

  // Quitamos fillers manteniendo orden/casing del original
  const words = argFromOriginal.split(/\s+/);
  const filtered = words.filter((w) => !FILLERS.has(normalize(w)));
  return filtered.join(' ').trim();
}

function findBubbleByQuery(q: string, bubbles: Bubble[], activeBubbleId: string | null): Bubble | null {
  if (!q) return null;
  const qn = normalize(q);
  let best: { score: number; bubble: Bubble } | null = null;
  for (const b of bubbles) {
    if (b.id === activeBubbleId) continue;
    const title = normalize(b.title);
    let score = 0;
    if (title === qn) score = 100;
    else if (title.startsWith(qn)) score = 70;
    else if (title.includes(qn)) score = 40;
    else {
      const words = qn.split(' ').filter(Boolean);
      const matches = words.filter((w) => title.includes(w)).length;
      score = words.length ? Math.round((matches / words.length) * 30) : 0;
    }
    if (score > 0 && (!best || score > best.score)) best = { score, bubble: b };
  }
  return best && best.score >= 30 ? best.bubble : null;
}

export function describeAction(action: MetaAction, bubbles: Bubble[]): MetaActionFeedback {
  switch (action.kind) {
    case 'goto_dashboard': return { title: 'Dashboard' };
    case 'goto_settings':  return { title: 'Ajustes' };
    case 'goto_files':     return { title: 'Archivos' };
    case 'goto_history':   return { title: 'Historial' };
    case 'create_bubble':  return { title: 'Nueva burbuja', detail: action.title ?? 'Sin título' };
    case 'open_or_create': return { title: 'Burbuja creada', detail: action.title };
    case 'rename_active':  return { title: 'Renombrada', detail: action.title };
    case 'close_active':   return { title: 'Burbuja cerrada' };
    case 'focus_bubble': {
      const b = bubbles.find((x) => x.id === action.bubbleId);
      return { title: 'Yendo a', detail: b?.title ?? '' };
    }
    case 'next_bubble':    return { title: 'Siguiente' };
    case 'prev_bubble':    return { title: 'Anterior' };
    case 'show_status':    return { title: 'Estado' };
    case 'pause_active':   return { title: 'Pausada' };
    case 'resume_active':  return { title: 'Reanudada' };
    case 'toggle_voice':   return { title: action.on ? 'Voz prendida' : 'Silencio' };
    case 'set_theme':      return { title: `Tema ${action.mode}` };
    case 'help':           return { title: 'Comandos disponibles' };
    case 'unknown':        return { title: 'No entendí', detail: 'Decí «Eco ayuda»' };
  }
}

export const COMMAND_HELP: Array<{ example: string; desc: string }> = [
  { example: 'Eco abrir <nombre>', desc: 'Crea una nueva burbuja con ese nombre' },
  { example: 'Eco renombrar <nombre>', desc: 'Cambia el título de la burbuja activa' },
  { example: 'Eco cerrar', desc: 'Cierra la burbuja activa' },
  { example: 'Eco ir <nombre>', desc: 'Va a la burbuja con ese nombre (fuzzy)' },
  { example: 'Eco siguiente · Eco anterior', desc: 'Navega entre burbujas' },
  { example: 'Eco dashboard · inicio', desc: 'Vuelve al dashboard' },
  { example: 'Eco ajustes · archivos · historial', desc: 'Navega a esas secciones' },
  { example: 'Eco estado', desc: 'Lista todas las burbujas con su actividad' },
  { example: 'Eco pausar · continuar', desc: 'Pausa o reanuda la burbuja activa' },
  { example: 'Eco silencio · hablar', desc: 'Apaga o prende la voz' },
  { example: 'Eco claro · oscuro · sistema', desc: 'Cambia el tema' },
  { example: 'Eco ayuda', desc: 'Muestra este panel' },
];
