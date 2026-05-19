import type { Bubble } from './types';
import { translate, type Lang } from './i18n';

export type MetaAction =
  | { kind: 'goto_dashboard' }
  | { kind: 'goto_settings' }
  | { kind: 'goto_files' }
  | { kind: 'goto_history' }
  | { kind: 'goto_archived' }
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
  | { kind: 'switch_tab'; tab: 'chat' | 'terminal' | 'git' | 'plan' | 'browser' | 'server' | 'files' | 'notes' }
  | { kind: 'switch_git_subtab'; sub: 'history' | 'changes' | 'prs' }
  | { kind: 'confirm'; answer: 'yes' | 'no' }
  | { kind: 'repeat_last' }
  | { kind: 'tts_rate'; dir: 'faster' | 'slower' | 'normal' }
  | { kind: 'tts_volume'; dir: 'up' | 'down' }
  // Acciones server / remote / obsidian — solo aplican en una conversación.
  | { kind: 'server_action'; action: 'start' | 'stop' | 'restart' }
  | { kind: 'toggle_remote_control'; on: boolean }
  | { kind: 'save_to_obsidian' }
  // Multi-tabs del BrowserPanel.
  | { kind: 'browser_new_tab'; mode: 'shared' | 'isolated' }
  | { kind: 'browser_close_tab' }
  | { kind: 'help' }
  | { kind: 'unknown' };

export type Screen = 'dashboard' | 'detail' | 'files' | 'history' | 'archived' | 'settings' | 'login' | 'onboarding';

export type MetaActionFeedback = {
  title: string;
  detail?: string;
};

// "Eco" solo es muy corto y aparece naturalmente en español ("el eco del
// valle", "eco-amigable", etc.) — genera falsos positivos. Forzamos una
// palabra de invocación antes del nombre para que despertarlo sea siempre
// intencional. Aceptados: hey/oye/oi/hola/ok/che/epa + eco|ekko|jarvis.
const WAKE_PREFIX = /^\s*(?:hey|oye|oi|hola|ok|okey|okay|che|epa)\s+(?:eco+|ech+o+|jarvis|ekko|h[eé]ctor)[\s,:¡!.?-]*/i;

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
  'a', 'al', 'a la', 'de', 'del', 'sobre', 'para', 'con', 'llamada', 'llamado',
  'nueva', 'nuevo', 'nuevamente',
  'que', 'es', 'sea', 'aqui', 'aca', 'alla', 'alli',
]);

// Palabras de relleno discursivo / cortesía / clíticos al INICIO de un comando.
// Se saltan para que «por favor abrime una conversación» = «abrime conversación»,
// «necesito entrar a Aditum» = «entrar a Aditum», etc.
// Importante: estas palabras NO deben coincidir con alias (no metas verbos acá).
const LEADING_FILLERS = new Set([
  'me', 'te', 'se',
  'por', 'favor', 'porfa', 'porfis', 'plis', 'please',
  'ahora', 'ya', 'tambien', 'tan', 'pues', 'bueno',
  'eh', 'em', 'mmm', 'mm', 'che', 'oye', 'oi',
  'a ver', 'ver', // "a ver entrá" → "entrá"
  'necesito', 'necesitas', 'necesita',
  'quiero', 'queres', 'queria', 'querria',
  'podes', 'podras', 'podria', 'podrias', 'puedes', 'puede', 'pueden',
  'hay', 'hace', 'falta',
]);

function skipLeadingFillers(tokens: string[]): { tokens: string[]; skipped: number } {
  let i = 0;
  while (i < tokens.length && LEADING_FILLERS.has(tokens[i]!)) i++;
  return { tokens: tokens.slice(i), skipped: i };
}

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

  // 'archivos' depende del contexto: en detail abre el tab Archivos (explorador
  // + editor); en cualquier otra pantalla va a la screen Archivos del dashboard.
  // El resolver final usa `currentScreen` para decidir. Aliases adicionales:
  // 'explorador', 'arbol', 'árbol', 'files', 'carpetas'.
  'archivos': 'archivos_ctx', 'files': 'archivos_ctx', 'carpetas': 'archivos_ctx',
  'explorador': 'archivos_ctx', 'arbol': 'archivos_ctx', 'árbol': 'archivos_ctx',
  // 'cambios' apunta a la sub-pestaña Cambios del tab Git en detail.
  'cambios': 'cambios_ctx', 'pendientes': 'cambios_ctx',

  // 'historial' depende del contexto: pantalla History en dashboard / sub-pestaña
  // Historial del tab Git en detail.
  'historial': 'history_ctx', 'history': 'history_ctx',

  // Pantalla Archivados (lista de agentes archivados con opciones de
  // des-archivar o eliminar definitivamente).
  'archivados': 'archived', 'archivado': 'archived', 'archive': 'archived',
  'archived': 'archived', 'archivo_screen': 'archived',

  // Tab Git en detail.
  'git': 'tab_git',

  // Sub-pestañas del tab Git. "ramas" abre el dropdown del top bar — no es
  // una sub-pestaña, así que se mapea a tab_git (que abre Git con el último
  // subtab usado, normalmente Cambios).
  'ramas': 'tab_git', 'rama': 'tab_git', 'branches': 'tab_git',
  'prs': 'gsub_prs', 'pull': 'gsub_prs',

  // Scroll (con o sin keyword "scroll")
  'scroll': 'scroll',
  'baja': 'scroll_down', 'bajar': 'scroll_down',
  'sube': 'scroll_up', 'subir': 'scroll_up',
  'abajo': 'scroll_down', 'arriba': 'scroll_up',

  // Tabs en detail (requieren ver "ver"/"abrí" o palabra directa cuando se está en detail)
  'terminal': 'tab_terminal', 'terminales': 'tab_terminal',
  'consola': 'tab_terminal', 'shell': 'tab_terminal',
  'plan': 'tab_plan', 'planes': 'tab_plan',
  'tarea': 'tab_plan', 'tareas': 'tab_plan', 'pasos': 'tab_plan',
  'chat': 'tab_chat', 'chats': 'tab_chat',
  'conversacion': 'tab_chat', 'conversaciones': 'tab_chat',
  'mensajes': 'tab_chat',
  'navegador': 'tab_browser', 'browser': 'tab_browser', 'web': 'tab_browser',
  'pagina': 'tab_browser', 'sitio': 'tab_browser', 'internet': 'tab_browser',
  'notas': 'tab_notes', 'nota': 'tab_notes', 'notes': 'tab_notes',
  'apuntes': 'tab_notes', 'anotacion': 'tab_notes', 'anotaciones': 'tab_notes',

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

  // Burbujas — apertura / creación (smart: si existe con ese título, focusea; sino crea)
  'abrir': 'create', 'abre': 'create', 'abrime': 'create', 'abreme': 'create',
  'crear': 'create', 'crea': 'create', 'creame': 'create', 'creeme': 'create',
  'nueva': 'create', 'nuevo': 'create',
  'iniciar': 'create', 'inicia': 'create', 'empezar': 'create', 'empieza': 'create',
  'arrancar': 'create', 'arranca': 'create', 'arrancame': 'create',
  'lanzar': 'create', 'lanza': 'create', 'lanzame': 'create',
  'levantar': 'create', 'levanta': 'create', 'levantame': 'create',
  'agregar': 'create', 'agrega': 'create', 'agregame': 'create',
  'sumar': 'create', 'suma': 'create',
  // 'entrar' a una conversación = abrirla (si existe focusea, sino crea)
  'entrar': 'create', 'entra': 'create', 'entrame': 'create', 'entrame en': 'create',
  'ingresar': 'create', 'ingresa': 'create', 'ingresame': 'create',
  'meterme': 'create', 'meteme': 'create', 'meter': 'create',
  'create': 'create', 'open': 'create', 'start': 'create', 'new': 'create',

  'renombrar': 'rename', 'renombra': 'rename', 'rename': 'rename',
  'rebautizar': 'rename', 'rebautiza': 'rename',
  'titular': 'rename', 'titula': 'rename',
  'ponele': 'rename', 'llamala': 'rename', 'llamalo': 'rename',

  'cerrar': 'close', 'cierra': 'close', 'cerrame': 'close', 'cierrame': 'close',
  'borrar': 'close', 'borra': 'close', 'borrame': 'close',
  'eliminar': 'close', 'elimina': 'close', 'eliminame': 'close',
  'close': 'close', 'sacar': 'close', 'sacame': 'close', 'saca': 'close',
  'destruir': 'close', 'destruye': 'close',
  'matar': 'close', 'mata': 'close', 'matala': 'close', 'matalo': 'close',
  'tirar': 'close', 'tira': 'close',

  // 'ir/llevar/mostrar' a una burbuja existente
  'ir': 'goto', 've': 'goto', 'vete': 'goto', 'anda': 'goto', 'andate': 'goto',
  'cambiar': 'goto', 'cambia': 'goto', 'cambiame': 'goto',
  'focus': 'goto', 'enfocar': 'goto', 'enfoca': 'goto', 'enfocame': 'goto',
  'mostrar': 'goto', 'mostrame': 'goto', 'muestra': 'goto', 'muestrame': 'goto',
  'llevame': 'goto', 'llevar': 'goto', 'lleva': 'goto',
  'pasar': 'goto', 'pasa': 'goto', 'pasame': 'goto',
  'volar': 'goto', 'vuela': 'goto', 'volame': 'goto',
  'go': 'goto', 'goto': 'goto',

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

  // Server (ctx: requiere "servidor" como arg de un verbo, o "reiniciar" solo)
  'servidor': 'server_ctx', 'server': 'server_ctx',
  'reiniciar': 'restart_v', 'reinicia': 'restart_v',
  'reinicar': 'restart_v', 'restart': 'restart_v',
  'rebootear': 'restart_v', 'rebootea': 'restart_v',

  // Remote control (ctx: keyword "remote" / "remoto" / "control")
  'remoto': 'remote_ctx', 'remote': 'remote_ctx',
  'activar': 'enable_v', 'activa': 'enable_v', 'enable': 'enable_v',
  'desactivar': 'disable_v', 'desactiva': 'disable_v', 'disable': 'disable_v',

  // Obsidian save
  'obsidian': 'obsidian_ctx', 'kb': 'obsidian_ctx', 'vault': 'obsidian_ctx',
  'guardar': 'save_v', 'guarda': 'save_v', 'save': 'save_v',
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

// Detecta comandos del BrowserPanel referidos a "pestaña/pestana/tab":
//  - "nueva pestaña" / "pestaña nueva" / "abrir pestaña"   → new shared
//  - "pestaña aislada" / "pestaña incógnito" / "pestaña separada" → new isolated
//  - "cerrar pestaña" / "cerrá pestaña" / "cierra pestaña" → close
// Devuelve null si no matchea — el parser sigue con su lógica normal.
function detectBrowserTabCommand(text: string): MetaAction | null {
  const t = normalize(text);
  // Acepta "pestaña" (con o sin tilde), "pestana", "tab".
  if (!/\b(pestana|pestaña|tab|tabs)\b/.test(t) && !/\bnavegador\b.*\bventana\b/.test(t)) {
    return null;
  }
  // Cerrar.
  if (/\b(cerrar|cierra|cerra|cerrad|cerrá|close|cierr)\b/.test(t)) {
    return { kind: 'browser_close_tab' };
  }
  // Aislada / incógnito.
  if (/\b(aislad|incognit|separad|nueva\s+sesion|nueva\s+sesión|sesion\s+nueva|sesión\s+nueva|privad|incognito)\b/.test(t)) {
    return { kind: 'browser_new_tab', mode: 'isolated' };
  }
  // Nueva / abrir / crear pestaña (default shared).
  if (/\b(nueva|nuevo|abrir|abri|abre|crear|crea|abrime|abrila|abrilo|abríme)\b/.test(t)
      || /\bpestana\b|\bpestaña\b|\btab\b/.test(t)) {
    return { kind: 'browser_new_tab', mode: 'shared' };
  }
  return null;
}

export function parseMetaCommand(
  rest: string,
  bubbles: Bubble[],
  activeBubbleId: string | null,
  currentScreen: Screen = 'dashboard',
): MetaAction {
  const text = rest.trim();
  if (!text) return { kind: 'unknown' };

  // Pre-check de comandos de pestaña del BrowserPanel ("Eco nueva pestaña",
  // "Eco pestaña aislada", "Eco cerrar pestaña"). Lo hacemos antes del
  // matching de alias para que "cerrar" no se interprete como cerrar agente.
  if (currentScreen === 'detail') {
    const tabAction = detectBrowserTabCommand(text);
    if (tabAction) return tabAction;
  }

  // 1) Normalizamos y partimos en tokens.
  // 2) Saltamos rellenos de cortesía/clíticos al inicio ("por favor", "necesito", "me", etc.).
  // 3) Buscamos el primer token que matchee un alias — así toleramos cosas como
  //    "abrime una conversación", "necesito entrar a Aditum", "che ayudame y abrí X".
  const norm = normalize(text);
  const allTokens = norm.split(' ');
  const { tokens: afterLeading, skipped: leadingSkipped } = skipLeadingFillers(allTokens);

  let keywordIdx = -1;
  let commandKey: string | undefined;
  for (let i = 0; i < afterLeading.length; i++) {
    const t = afterLeading[i]!;
    if (ALIASES[t]) {
      commandKey = ALIASES[t];
      keywordIdx = i;
      break;
    }
  }

  if (!commandKey) return { kind: 'unknown' };

  // "archivos" es ambiguo: en detail = tab Archivos (explorador); en cualquier
  // otra pantalla = ir a screen Archivos del dashboard.
  if (commandKey === 'archivos_ctx') {
    commandKey = currentScreen === 'detail' ? 'tab_files' : 'files';
  }
  // "cambios" solo tiene sentido en detail (cambios pendientes del worktree).
  if (commandKey === 'cambios_ctx') {
    if (currentScreen !== 'detail') return { kind: 'unknown' };
    commandKey = 'gsub_changes';
  }
  // "historial": en detail → sub-pestaña Historial del tab Git; sino → pantalla History.
  if (commandKey === 'history_ctx') {
    commandKey = currentScreen === 'detail' ? 'gsub_history' : 'history';
  }

  // Argumento = resto del texto después del keyword, con fillers removidos.
  // Los tokens previos al keyword (después de los leading fillers) los descartamos:
  // ya fueron "soft fillers" que no eran palabras de cortesía pero tampoco verbos canónicos.
  const restTokens = afterLeading.slice(keywordIdx + 1);
  const argRaw = stripQuotes(restTokens.join(' '));
  const argClean = dropFillers(restTokens).join(' ').trim();

  // Si el verbo es de apertura/navegación (`create`/`goto`) Y el primer token del
  // argumento matchea un alias de tab, lo interpretamos como switch de pestaña
  // (cuando estamos en una conversación). Esto soporta:
  //   "Eco abre terminal" / "abrí el navegador" / "ir al plan" / "mostrame archivos"
  if ((commandKey === 'create' || commandKey === 'goto') && currentScreen === 'detail') {
    const firstArg = dropFillers(restTokens)[0] ?? '';
    const aliased = ALIASES[firstArg];
    if (aliased === 'tab_terminal') return { kind: 'switch_tab', tab: 'terminal' };
    if (aliased === 'tab_browser')  return { kind: 'switch_tab', tab: 'browser' };
    if (aliased === 'tab_plan')     return { kind: 'switch_tab', tab: 'plan' };
    if (aliased === 'tab_chat')     return { kind: 'switch_tab', tab: 'chat' };
    if (aliased === 'tab_git')      return { kind: 'switch_tab', tab: 'git' };
    if (aliased === 'archivos_ctx') return { kind: 'switch_tab', tab: 'files' };
    if (aliased === 'cambios_ctx')  return { kind: 'switch_git_subtab', sub: 'changes' };
    if (aliased === 'history_ctx')  return { kind: 'switch_git_subtab', sub: 'history' };
    if (aliased === 'gsub_prs')     return { kind: 'switch_git_subtab', sub: 'prs' };
  }

  // Acciones que aplican al agente activo (server, remote control, obsidian).
  // Requieren estar en una conversación.
  if (currentScreen === 'detail') {
    const argTokens = dropFillers(restTokens);
    const firstArg = argTokens[0] ?? '';
    const argAliased = ALIASES[firstArg] ?? '';
    const argHas = (word: string) => argTokens.includes(word);

    // Server: "iniciar/levantar/arrancar servidor", "detener/parar/apagar servidor",
    // "reiniciar servidor" o "reiniciar" solo (default: el server del agente).
    const wantsServer = argAliased === 'server_ctx' || argHas('servidor') || argHas('server');
    if (commandKey === 'restart_v') {
      // "reiniciar" / "reinicia" solo, o con "servidor" → reiniciar el server.
      return { kind: 'server_action', action: 'restart' };
    }
    if (wantsServer) {
      if (commandKey === 'create') return { kind: 'server_action', action: 'start' };
      if (commandKey === 'pause' || commandKey === 'close') return { kind: 'server_action', action: 'stop' };
    }

    // Remote control: "activar remote control", "abrir remote", "desactivar remote".
    const wantsRemote = argAliased === 'remote_ctx' || argHas('remoto') || argHas('remote') || argHas('control');
    if (wantsRemote) {
      if (commandKey === 'enable_v' || commandKey === 'create') return { kind: 'toggle_remote_control', on: true };
      if (commandKey === 'disable_v' || commandKey === 'close' || commandKey === 'pause') return { kind: 'toggle_remote_control', on: false };
    }
    // Verbo "activar"/"desactivar" solo → asumimos remote (es el toggle más común).
    if (commandKey === 'enable_v') return { kind: 'toggle_remote_control', on: true };
    if (commandKey === 'disable_v') return { kind: 'toggle_remote_control', on: false };

    // Obsidian: "guardar en obsidian", "guardar nota", "guarda esto en obsidian".
    const wantsObsidian = argAliased === 'obsidian_ctx' || argHas('obsidian') || argHas('kb') || argHas('vault') || argHas('nota');
    if (commandKey === 'save_v' && (wantsObsidian || argTokens.length === 0)) {
      return { kind: 'save_to_obsidian' };
    }
  }
  // Conservamos el texto original con casing/acentos para el título (más bonito).
  // Calculamos el índice absoluto del keyword en allTokens para que preserveCasing arranque ahí.
  const absoluteKeywordIdx = leadingSkipped + keywordIdx;
  const titleFromOriginal = preserveCasingFromIndex(rest, absoluteKeywordIdx, argRaw);

  switch (commandKey) {
    case 'dashboard': return { kind: 'goto_dashboard' };
    case 'settings':  return { kind: 'goto_settings' };
    case 'files':     return { kind: 'goto_files' };
    case 'archived':  return { kind: 'goto_archived' };
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
    case 'tab_git':      return { kind: 'switch_tab', tab: 'git' };
    case 'tab_plan':     return { kind: 'switch_tab', tab: 'plan' };
    case 'tab_chat':     return { kind: 'switch_tab', tab: 'chat' };
    case 'tab_browser':  return { kind: 'switch_tab', tab: 'browser' };
    case 'tab_files':    return { kind: 'switch_tab', tab: 'files' };
    case 'tab_notes':    return { kind: 'switch_tab', tab: 'notes' };
    case 'gsub_history':  return { kind: 'switch_git_subtab', sub: 'history' };
    case 'gsub_changes':  return { kind: 'switch_git_subtab', sub: 'changes' };
    case 'gsub_prs':      return { kind: 'switch_git_subtab', sub: 'prs' };
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

// Conserva el casing del texto original al extraer el argumento, sabiendo que
// el keyword puede no ser el primer token (puede haber leading fillers antes).
// `keywordIdx` = índice del token-keyword en el split por espacios del original
// normalizado (alineado tras saltar leading fillers).
function preserveCasingFromIndex(originalText: string, keywordIdx: number, normalizedArg: string): string {
  if (!normalizedArg) return '';
  const trimmed = originalText.trim();
  // Spliteamos preservando el casing original.
  const words = trimmed.split(/\s+/);
  if (keywordIdx + 1 >= words.length) return '';
  const argWords = words.slice(keywordIdx + 1);
  const joined = stripQuotes(argWords.join(' '));
  // Quitamos fillers manteniendo orden/casing del original.
  const filtered = joined.split(/\s+/).filter((w) => !FILLERS.has(normalize(w)));
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
    case 'goto_archived':  return { title: tr('cmd.archived_screen') };
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
    case 'switch_git_subtab': return { title: 'Git', detail: action.sub };
    case 'confirm':        return { title: action.answer === 'yes' ? tr('cmd.confirm_yes') : tr('cmd.confirm_no') };
    case 'repeat_last':    return { title: tr('cmd.repeat') };
    case 'tts_rate':       return { title: tr(`cmd.tts.${action.dir}`) };
    case 'tts_volume':     return { title: tr(action.dir === 'up' ? 'cmd.tts.louder' : 'cmd.tts.quieter') };
    case 'server_action': {
      const map = {
        start: 'cmd.server.start',
        stop: 'cmd.server.stop',
        restart: 'cmd.server.restart',
      } as const;
      return { title: tr(map[action.action]) };
    }
    case 'toggle_remote_control':
      return { title: tr(action.on ? 'cmd.remote.on' : 'cmd.remote.off') };
    case 'save_to_obsidian':
      return { title: tr('cmd.obsidian.save') };
    case 'browser_new_tab':
      return {
        title: tr('cmd.browser.new_tab'),
        detail: action.mode === 'isolated' ? tr('browser.tab.new_isolated') : tr('browser.tab.new_shared'),
      };
    case 'browser_close_tab':
      return { title: tr('cmd.browser.close_tab') };
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
