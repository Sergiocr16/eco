import type { Bubble } from './types';
import { translate, type Lang } from './i18n';

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
  | { kind: 'scroll'; dir: 'up' | 'down' | 'top' | 'bottom' }
  | { kind: 'switch_tab'; tab: 'chat' | 'terminal' | 'files' | 'plan' }
  | { kind: 'confirm'; answer: 'yes' | 'no' }
  | { kind: 'repeat_last' }
  | { kind: 'tts_rate'; dir: 'faster' | 'slower' | 'normal' }
  | { kind: 'tts_volume'; dir: 'up' | 'down' }
  | { kind: 'help' }
  | { kind: 'unknown' };

export type Screen = 'dashboard' | 'detail' | 'files' | 'history' | 'settings' | 'login' | 'onboarding';

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
  'regresar': 'dashboard', 'salir': 'dashboard', 'atras': 'dashboard',
  'back': 'dashboard',

  'ajustes': 'settings', 'configuracion': 'settings', 'config': 'settings',
  'settings': 'settings', 'preferencias': 'settings',

  // 'archivos' depende del contexto: pantalla en dashboard / tab en detail.
  // El resolver final usa `currentScreen` para decidir.
  'archivos': 'archivos_ctx', 'files': 'archivos_ctx', 'carpetas': 'archivos_ctx',

  'historial': 'history', 'history': 'history',

  // Scroll (con o sin keyword "scroll")
  'scroll': 'scroll',
  'baja': 'scroll_down', 'bajar': 'scroll_down',
  'sube': 'scroll_up', 'subir': 'scroll_up',
  'abajo': 'scroll_down', 'arriba': 'scroll_up',

  // Tabs en detail (requieren ver "ver"/"abrí" o palabra directa cuando se está en detail)
  'terminal': 'tab_terminal',
  'plan': 'tab_plan',
  'chat': 'tab_chat',
  'conversacion': 'tab_chat',

  // Sí / No / Confirm
  'si': 'confirm_yes', 'yes': 'confirm_yes', 'ok': 'confirm_yes',
  'dale': 'confirm_yes', 'vale': 'confirm_yes',
  'confirma': 'confirm_yes', 'confirmar': 'confirm_yes',
  'acepta': 'confirm_yes', 'aceptar': 'confirm_yes',

  'no': 'confirm_no', 'rechaza': 'confirm_no', 'rechazar': 'confirm_no',
  'cancela': 'confirm_no', 'cancelar': 'confirm_no', 'descarta': 'confirm_no',

  // Repetir último
  'repetir': 'repeat', 'repeti': 'repeat',
  'leeme': 'repeat', 'lee': 'repeat',
  'releer': 'repeat',

  // TTS adjustments
  'rapido': 'tts_faster', 'rápido': 'tts_faster', 'acelera': 'tts_faster',
  'lento': 'tts_slower', 'lenta': 'tts_slower', 'despacio': 'tts_slower',
  'normal': 'tts_normal',
  'fuerte': 'tts_louder', 'alto': 'tts_louder',
  'bajito': 'tts_quieter', 'bajo': 'tts_quieter',

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
  'antes': 'prev',

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
  'prende': 'unmute', 'prender': 'unmute',

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

export function parseMetaCommand(
  rest: string,
  bubbles: Bubble[],
  activeBubbleId: string | null,
  currentScreen: Screen = 'dashboard',
): MetaAction {
  const text = rest.trim();
  if (!text) return { kind: 'unknown' };

  // Tomamos la primera palabra como keyword
  const norm = normalize(text);
  const tokens = norm.split(' ');
  const firstToken = tokens[0] ?? '';
  let commandKey = ALIASES[firstToken];

  if (!commandKey) return { kind: 'unknown' };

  // "archivos" es ambiguo: en detail = tab Archivos; en cualquier otra pantalla = ir a screen Archivos.
  if (commandKey === 'archivos_ctx') {
    commandKey = currentScreen === 'detail' ? 'tab_files' : 'files';
  }

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
    case 'scroll': {
      // "scroll abajo" / "scroll al final" / "scroll arriba" / "scroll todo arriba"
      const a = argClean;
      if (/\b(fin|final|abajo|bottom|end)\b/.test(a)) return { kind: 'scroll', dir: 'bottom' };
      if (/\b(inicio|tope|arriba|top|start)\b/.test(a)) return { kind: 'scroll', dir: 'top' };
      if (/\bsube\b|\barriba\b/.test(a)) return { kind: 'scroll', dir: 'up' };
      // 'scroll' solo, sin arg → down (lo más común)
      return { kind: 'scroll', dir: 'down' };
    }
    case 'scroll_down': return { kind: 'scroll', dir: argClean === 'todo' ? 'bottom' : 'down' };
    case 'scroll_up':   return { kind: 'scroll', dir: argClean === 'todo' ? 'top'    : 'up'   };
    case 'tab_terminal': return { kind: 'switch_tab', tab: 'terminal' };
    case 'tab_files':    return { kind: 'switch_tab', tab: 'files' };
    case 'tab_plan':     return { kind: 'switch_tab', tab: 'plan' };
    case 'tab_chat':     return { kind: 'switch_tab', tab: 'chat' };
    case 'confirm_yes':  return { kind: 'confirm', answer: 'yes' };
    case 'confirm_no':   return { kind: 'confirm', answer: 'no' };
    case 'repeat':       return { kind: 'repeat_last' };
    case 'tts_faster':   return { kind: 'tts_rate', dir: 'faster' };
    case 'tts_slower':   return { kind: 'tts_rate', dir: 'slower' };
    case 'tts_normal':   return { kind: 'tts_rate', dir: 'normal' };
    case 'tts_louder':   return { kind: 'tts_volume', dir: 'up' };
    case 'tts_quieter':  return { kind: 'tts_volume', dir: 'down' };
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

export function describeAction(action: MetaAction, bubbles: Bubble[], lang: Lang = 'es'): MetaActionFeedback {
  const tr = (k: string, v?: Record<string, string | number>) => translate(k, lang, v);
  switch (action.kind) {
    case 'goto_dashboard': return { title: tr('cmd.dashboard') };
    case 'goto_settings':  return { title: tr('cmd.settings') };
    case 'goto_files':     return { title: tr('cmd.files') };
    case 'goto_history':   return { title: tr('cmd.history') };
    case 'create_bubble':  return { title: tr('cmd.new_bubble'), detail: action.title ?? tr('cmd.no_title') };
    case 'open_or_create': return { title: tr('cmd.bubble_created'), detail: action.title };
    case 'rename_active':  return { title: tr('cmd.renamed'), detail: action.title };
    case 'close_active':   return { title: tr('cmd.closed') };
    case 'focus_bubble': {
      const b = bubbles.find((x) => x.id === action.bubbleId);
      return { title: tr('cmd.going_to'), detail: b?.title ?? '' };
    }
    case 'next_bubble':    return { title: tr('cmd.next') };
    case 'prev_bubble':    return { title: tr('cmd.prev') };
    case 'show_status':    return { title: tr('cmd.status') };
    case 'pause_active':   return { title: tr('cmd.paused') };
    case 'resume_active':  return { title: tr('cmd.resumed') };
    case 'toggle_voice':   return { title: action.on ? tr('cmd.voice_on') : tr('cmd.voice_off') };
    case 'set_theme':      return { title: tr('cmd.theme', { mode: action.mode }) };
    case 'scroll':         return { title: tr('cmd.scroll'), detail: tr(`cmd.scroll.${action.dir}`) };
    case 'switch_tab':     return { title: tr('cmd.switch_tab'), detail: tr(`cmd.tab.${action.tab}`) };
    case 'confirm':        return { title: action.answer === 'yes' ? tr('cmd.confirm_yes') : tr('cmd.confirm_no') };
    case 'repeat_last':    return { title: tr('cmd.repeat') };
    case 'tts_rate':       return { title: tr(`cmd.tts.${action.dir}`) };
    case 'tts_volume':     return { title: tr(action.dir === 'up' ? 'cmd.tts.louder' : 'cmd.tts.quieter') };
    case 'help':           return { title: tr('cmd.help.title') };
    case 'unknown':        return { title: tr('cmd.unknown.title'), detail: tr('cmd.unknown.detail') };
  }
}

export const COMMAND_HELP: Array<{ example?: string; desc?: string; exampleKey?: string; descKey?: string }> = [
  { exampleKey: 'cmdhelp.open.example', descKey: 'cmdhelp.open.desc' },
  { exampleKey: 'cmdhelp.rename.example', descKey: 'cmdhelp.rename.desc' },
  { exampleKey: 'cmdhelp.close.example', descKey: 'cmdhelp.close.desc' },
  { exampleKey: 'cmdhelp.goto.example', descKey: 'cmdhelp.goto.desc' },
  { exampleKey: 'cmdhelp.nav.example', descKey: 'cmdhelp.nav.desc' },
  { exampleKey: 'cmdhelp.dash.example', descKey: 'cmdhelp.dash.desc' },
  { exampleKey: 'cmdhelp.sections.example', descKey: 'cmdhelp.sections.desc' },
  { exampleKey: 'cmdhelp.status.example', descKey: 'cmdhelp.status.desc' },
  { exampleKey: 'cmdhelp.pause.example', descKey: 'cmdhelp.pause.desc' },
  { exampleKey: 'cmdhelp.voice.example', descKey: 'cmdhelp.voice.desc' },
  { exampleKey: 'cmdhelp.theme.example', descKey: 'cmdhelp.theme.desc' },
  { exampleKey: 'cmdhelp.help.example', descKey: 'cmdhelp.help.desc' },
  { exampleKey: 'cmdhelp.scroll.example', descKey: 'cmdhelp.scroll.desc' },
  { exampleKey: 'cmdhelp.tab.example', descKey: 'cmdhelp.tab.desc' },
  { exampleKey: 'cmdhelp.confirm.example', descKey: 'cmdhelp.confirm.desc' },
  { exampleKey: 'cmdhelp.repeat.example', descKey: 'cmdhelp.repeat.desc' },
  { exampleKey: 'cmdhelp.tts.example', descKey: 'cmdhelp.tts.desc' },
];
