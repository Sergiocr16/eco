export type Lang = 'es' | 'en';

export const DEFAULT_LANG: Lang = 'es';

// Diccionario centralizado. Si una key no existe en el idioma activo,
// cae al español. Variables: usar {{name}} en el template.
const DICT = {
  // ─────────────────────────── Auth
  'auth.welcome.title': {
    es: 'Bienvenido a Eco',
    en: 'Welcome to Eco',
  },
  'auth.welcome.sub': {
    es: 'Creá tu cuenta local. El PIN se queda en este Mac.',
    en: 'Create your local account. Your PIN stays on this Mac.',
  },
  'auth.field.username': { es: 'Tu nombre', en: 'Your name' },
  'auth.field.pin': { es: 'PIN (4-8 dígitos)', en: 'PIN (4-8 digits)' },
  'auth.field.pin_repeat': { es: 'Repetí el PIN', en: 'Repeat your PIN' },
  'auth.field.pin_simple': { es: 'PIN', en: 'PIN' },
  'auth.field.pin_new': { es: 'Nuevo PIN (4-8 dígitos)', en: 'New PIN (4-8 digits)' },
  'auth.btn.create': { es: 'Crear cuenta', en: 'Create account' },
  'auth.btn.create_loading': { es: 'Creando…', en: 'Creating…' },
  'auth.btn.enter': { es: 'Entrar', en: 'Enter' },
  'auth.btn.enter_loading': { es: 'Verificando…', en: 'Verifying…' },
  'auth.btn.recover': { es: 'Recuperar', en: 'Recover' },
  'auth.btn.recover_loading': { es: 'Validando…', en: 'Validating…' },
  'auth.btn.enter_eco': { es: 'Entrar a Eco', en: 'Enter Eco' },
  'auth.greeting': { es: 'Hola, {{name}}', en: 'Hello, {{name}}' },
  'auth.login.sub': {
    es: 'Ingresá tu PIN para abrir Eco',
    en: 'Enter your PIN to open Eco',
  },
  'auth.forgot_pin': {
    es: '¿Olvidaste el PIN? Recuperar con tu frase',
    en: 'Forgot your PIN? Recover with your phrase',
  },
  'auth.recover.title': { es: 'Recuperar acceso', en: 'Recover access' },
  'auth.recover.sub': {
    es: 'Pegá tu frase de 12 palabras y elegí un nuevo PIN. Se te dará una frase nueva.',
    en: 'Paste your 12-word phrase and choose a new PIN. You will receive a new phrase.',
  },
  'auth.recovery.title.new': { es: 'Guardá tu frase de recuperación', en: 'Save your recovery phrase' },
  'auth.recovery.title.reset': { es: 'Nueva frase de recuperación', en: 'New recovery phrase' },
  'auth.recovery.warning': {
    es: 'Si olvidás el PIN, esta frase es la única forma de recuperar acceso. Anotala en papel o guardala en un gestor seguro.',
    en: 'If you forget your PIN, this phrase is the only way to recover access. Write it down on paper or save it in a password manager.',
  },
  'auth.recovery.no_again': {
    es: 'No se mostrará de nuevo.',
    en: 'It will not be shown again.',
  },
  'auth.recovery.copy': { es: 'Copiar al portapapeles', en: 'Copy to clipboard' },
  'auth.recovery.copied': { es: '✓ Copiado', en: '✓ Copied' },
  'auth.recovery.confirmed': {
    es: 'Guardé la frase en un lugar seguro',
    en: 'I saved the phrase in a safe place',
  },
  'auth.footer.recovery_hint': {
    es: 'Vas a recibir una frase de 12 palabras para recuperar el PIN si lo olvidás.',
    en: 'You will receive a 12-word phrase to recover your PIN if you forget it.',
  },
  'auth.err.name_empty': { es: 'Poné un nombre', en: 'Enter a name' },
  'auth.err.pin_format': { es: 'PIN: 4 a 8 dígitos', en: 'PIN: 4 to 8 digits' },
  'auth.err.pin_mismatch': { es: 'Los PIN no coinciden', en: "PINs don't match" },
  'auth.err.phrase_length': {
    es: 'La frase tiene que ser de 12 palabras',
    en: 'The phrase must be 12 words',
  },

  // ─────────────────────────── Sidebar / nav
  'nav.dashboard': { es: 'Inicio', en: 'Home' },
  'nav.files': { es: 'Archivos', en: 'Files' },
  'nav.history': { es: 'Historial', en: 'History' },
  'nav.settings': { es: 'Ajustes', en: 'Settings' },
  'nav.account': { es: 'Cuenta', en: 'Account' },

  // ─────────────────────────── Dashboard
  'dash.greeting.morning': { es: 'Buenos días', en: 'Good morning' },
  'dash.greeting.afternoon': { es: 'Buenas tardes', en: 'Good afternoon' },
  'dash.greeting.evening': { es: 'Buenas noches', en: 'Good evening' },
  'dash.active_summary_one': {
    es: '{{n}} agente activo',
    en: '{{n}} active agent',
  },
  'dash.active_summary_many': {
    es: '{{n}} agentes activos',
    en: '{{n}} active agents',
  },
  'dash.in_projects': { es: 'en {{n}} proyecto', en: 'in {{n}} project' },
  'dash.in_projects_many': { es: 'en {{n}} proyectos', en: 'in {{n}} projects' },
  'dash.stat.running': { es: '{{n}} ejecutando', en: '{{n}} running' },
  'dash.stat.waiting': { es: '{{n}} esperando', en: '{{n}} waiting' },
  'dash.stat.errors': { es: '{{n}} con error', en: '{{n}} with error' },
  'dash.stat.idle': { es: 'Todo en orden', en: 'All idle' },
  'dash.stat.messages': { es: 'Mensajes', en: 'Messages' },
  'dash.stat.sessions': { es: 'Sesiones', en: 'Sessions' },
  'dash.stat.workspaces': { es: 'Workspaces', en: 'Workspaces' },
  'dash.section.agents': { es: 'Agentes', en: 'Agents' },
  'dash.new_bubble': { es: 'Nueva burbuja', en: 'New bubble' },
  'dash.new_bubble_hint': {
    es: 'Click para nombrarla o decí "Eco abrir [nombre]"',
    en: 'Click to name it or say "Eco open [name]"',
  },
  'dash.no_agents': { es: 'Sin agentes', en: 'No agents' },
  'dash.rail.recent': { es: 'Burbujas recientes', en: 'Recent bubbles' },
  'dash.rail.no_activity': { es: 'Sin actividad reciente.', en: 'No recent activity.' },
  'dash.rail.active_folders': { es: 'Carpetas activas', en: 'Active folders' },
  'dash.rail.no_folders': { es: 'Sin carpetas seleccionadas.', en: 'No folders selected.' },
  'dash.cmd_placeholder': {
    es: 'Eco, decile al agente que…',
    en: 'Eco, tell the agent to…',
  },
  'dash.cmd_placeholder_listening': {
    es: 'Escuchando · decí "Eco" seguido del comando…',
    en: 'Listening · say "Eco" followed by the command…',
  },
  'dash.bubble.agent': { es: 'Agente', en: 'Agent' },
  'dash.bubble.no_msg': { es: 'Sin mensajes aún', en: 'No messages yet' },

  // ─────────────────────────── Agent detail
  'detail.btn.listen': { es: 'Hablar', en: 'Speak' },
  'detail.btn.listening': { es: 'Escuchando', en: 'Listening' },
  'detail.tab.chat': { es: 'Conversación', en: 'Conversation' },
  'detail.tab.terminal': { es: 'Terminal', en: 'Terminal' },
  'detail.tab.files': { es: 'Archivos', en: 'Files' },
  'detail.tab.plan': { es: 'Plan', en: 'Plan' },
  'detail.menu.rename': { es: 'Renombrar burbuja', en: 'Rename bubble' },
  'detail.menu.change_workspace': { es: 'Cambiar workspace', en: 'Change workspace' },
  'detail.menu.copy_chat': { es: 'Copiar conversación', en: 'Copy conversation' },
  'detail.menu.close': { es: 'Cerrar burbuja', en: 'Close bubble' },
  'detail.chat.you': { es: 'Tú', en: 'You' },
  'detail.chat.placeholder': {
    es: 'Escríbele a {{name}}…',
    en: 'Write to {{name}}…',
  },
  'detail.chat.placeholder_listening': {
    es: 'Escuchando · habla normal o decí "Eco" para comandos',
    en: 'Listening · speak normally or say "Eco" for commands',
  },
  'detail.chat.thinking': { es: 'Pensando…', en: 'Thinking…' },
  'detail.chat.executing': { es: 'Ejecutando…', en: 'Executing…' },
  'detail.chat.empty_title': { es: 'Iniciá conversación con {{name}}', en: 'Start chatting with {{name}}' },
  'detail.chat.empty_sub': {
    es: 'Escribí algo abajo o decí "Eco" seguido del comando.',
    en: 'Type something below or say "Eco" followed by the command.',
  },
  'detail.term.command_placeholder': {
    es: 'escribí un comando',
    en: 'type a command',
  },
  'detail.term.executing': { es: 'ejecutando…', en: 'executing…' },
  'detail.files.empty': {
    es: 'Esta burbuja todavía no modificó archivos.',
    en: 'This bubble has not modified any files yet.',
  },
  'detail.files.modified': { es: 'Archivos modificados', en: 'Modified files' },
  'detail.plan.empty': {
    es: 'Aún no hay plan generado. Cuando el agente trabaje, los pasos aparecerán aquí.',
    en: 'No plan generated yet. When the agent works, the steps will appear here.',
  },
  'detail.plan.title': { es: 'Plan de ejecución', en: 'Execution plan' },
  'detail.plan.summary': {
    es: '{{n}} pasos · {{done}} completados',
    en: '{{n}} steps · {{done}} completed',
  },
  'detail.sidebar.stats': { es: 'Estadísticas', en: 'Stats' },
  'detail.sidebar.next': { es: 'Próxima acción', en: 'Next action' },
  'detail.sidebar.suggestion': { es: 'Sugerencia', en: 'Suggestion' },
  'detail.sidebar.safe_mode': { es: 'Modo seguro activo', en: 'Safe mode enabled' },
  'detail.stat.time_active': { es: 'Tiempo activo', en: 'Time active' },
  'detail.stat.messages': { es: 'Mensajes', en: 'Messages' },
  'detail.stat.tool_calls': { es: 'Tool calls', en: 'Tool calls' },
  'detail.stat.state': { es: 'Estado', en: 'State' },
  'detail.suggestion.idle': {
    es: 'Continuá la conversación o decile algo más.',
    en: 'Continue the conversation or say something else.',
  },
  'detail.suggestion.thinking': {
    es: 'Eco está procesando tu última instrucción.',
    en: 'Eco is processing your last instruction.',
  },
  'detail.suggestion.executing': {
    es: 'Esperá a que termine la ejecución.',
    en: 'Wait for execution to finish.',
  },
  'detail.suggestion.review': {
    es: 'Revisá los archivos modificados.',
    en: 'Review the modified files.',
  },

  // ─────────────────────────── Settings
  'settings.title': { es: 'Ajustes', en: 'Settings' },
  'settings.section.general': { es: 'General', en: 'General' },
  'settings.section.claude': { es: 'Claude & API', en: 'Claude & API' },
  'settings.section.voice': { es: 'Voz', en: 'Voice' },
  'settings.section.folders': { es: 'Carpetas', en: 'Folders' },
  'settings.section.security': { es: 'Seguridad', en: 'Security' },
  'settings.section.appearance': { es: 'Apariencia', en: 'Appearance' },
  'settings.section.about': { es: 'Acerca de', en: 'About' },
  'settings.general.title': { es: 'General', en: 'General' },
  'settings.general.sub': { es: 'Comportamiento global de Eco.', en: 'Global behavior of Eco.' },
  'settings.general.listen_on_boot': { es: 'Escuchar al abrir Eco', en: 'Listen on startup' },
  'settings.general.menubar': { es: 'Mantener Eco en la barra de menú', en: 'Keep Eco in the menu bar' },
  'settings.general.default_folder': { es: 'Carpeta por defecto', en: 'Default folder' },
  'settings.general.default_folder_desc': {
    es: 'Se asigna automáticamente al crear una burbuja. Vacío = pedir cada vez.',
    en: 'Auto-assigned when creating a new bubble. Empty = ask each time.',
  },
  'settings.general.ask_each_time': { es: 'Preguntar cada vez', en: 'Ask each time' },
  'settings.general.shortcut': { es: 'Atajo global', en: 'Global shortcut' },
  'settings.general.shortcut_desc': {
    es: 'Pulsá esta combinación para invocar Eco.',
    en: 'Press this combination to invoke Eco.',
  },
  'settings.general.app_language': { es: 'Idioma de Eco', en: 'Eco language' },
  'settings.suggestions.title': { es: 'Sugerencias rápidas', en: 'Quick suggestions' },
  'settings.suggestions.sub': {
    es: 'Aparecen debajo del input de cada conversación. Click → se copia al draft.',
    en: 'They appear below the input of each conversation. Click → copies to draft.',
  },
  'settings.suggestions.add_placeholder': {
    es: 'Agregar nueva sugerencia (ej: "Generá tests")',
    en: 'Add new suggestion (e.g.: "Generate tests")',
  },
  'settings.suggestions.add_btn': { es: 'Agregar', en: 'Add' },
  'settings.suggestions.reset': { es: 'Restablecer', en: 'Reset' },
  'settings.suggestions.empty': {
    es: 'Sin sugerencias. Agregá una arriba.',
    en: 'No suggestions. Add one above.',
  },

  // ─────────────────────────── Generic
  'generic.cancel': { es: 'Cancelar', en: 'Cancel' },
  'generic.save': { es: 'Guardar', en: 'Save' },
  'generic.delete': { es: 'Borrar', en: 'Delete' },
  'generic.close': { es: 'Cerrar', en: 'Close' },
  'generic.confirm': { es: 'Confirmar', en: 'Confirm' },
  'generic.loading': { es: 'Cargando…', en: 'Loading…' },
  'generic.optional': { es: 'opcional', en: 'optional' },
  'generic.required': { es: 'requerido', en: 'required' },

  // ─────────────────────────── Workspace picker
  'wsp.title': {
    es: '¿En qué carpeta vas a trabajar?',
    en: 'Which folder will you work in?',
  },
  'wsp.sub': {
    es: '"{{name}}" — Eco solo podrá leer y escribir aquí',
    en: '"{{name}}" — Eco can only read and write here',
  },
  'wsp.no_workspaces': {
    es: 'No tenés workspaces autorizados todavía.',
    en: 'You have no authorized workspaces yet.',
  },
  'wsp.add_other': { es: 'Agregar otra carpeta…', en: 'Add another folder…' },
  'wsp.add_hint': {
    es: 'Pegá el path absoluto. No puede ser ruta del sistema (/etc, /sys, etc.).',
    en: 'Paste the absolute path. Cannot be a system path (/etc, /sys, etc.).',
  },
  'wsp.add_btn': { es: 'Agregar y usar', en: 'Add and use' },
  'wsp.add_loading': { es: 'Agregando…', en: 'Adding…' },
  'wsp.skip': { es: 'Trabajar sin carpeta', en: 'Work without folder' },
  'wsp.change_later': {
    es: 'Podés cambiar el workspace después desde el menú "…" de la burbuja',
    en: 'You can change the workspace later from the bubble\'s "…" menu',
  },

  // ─────────────────────────── Eco commands feedback
  'cmd.unknown.title': { es: 'No entendí', en: 'I didn\'t understand' },
  'cmd.unknown.detail': { es: 'Decí "Eco ayuda"', en: 'Say "Eco help"' },
  'cmd.help.title': { es: 'Comandos disponibles', en: 'Available commands' },
  'cmd.dashboard': { es: 'Inicio', en: 'Home' },
  'cmd.settings': { es: 'Ajustes', en: 'Settings' },
  'cmd.files': { es: 'Archivos', en: 'Files' },
  'cmd.history': { es: 'Historial', en: 'History' },
  'cmd.new_bubble': { es: 'Nueva burbuja', en: 'New bubble' },
  'cmd.no_title': { es: 'Sin título', en: 'No title' },
  'cmd.bubble_created': { es: 'Burbuja creada', en: 'Bubble created' },
  'cmd.renamed': { es: 'Renombrada', en: 'Renamed' },
  'cmd.closed': { es: 'Burbuja cerrada', en: 'Bubble closed' },
  'cmd.going_to': { es: 'Yendo a', en: 'Going to' },
  'cmd.next': { es: 'Siguiente', en: 'Next' },
  'cmd.prev': { es: 'Anterior', en: 'Previous' },
  'cmd.status': { es: 'Estado', en: 'Status' },
  'cmd.paused': { es: 'Pausada', en: 'Paused' },
  'cmd.resumed': { es: 'Reanudada', en: 'Resumed' },
  'cmd.voice_on': { es: 'Voz prendida', en: 'Voice on' },
  'cmd.voice_off': { es: 'Silencio', en: 'Silence' },
  'cmd.theme': { es: 'Tema {{mode}}', en: 'Theme {{mode}}' },
} as const;

type DictKey = keyof typeof DICT;

const STORAGE_KEY = 'eco.lang';

export function loadLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'es' || v === 'en') return v;
  } catch { /* noop */ }
  // Auto-detect del navegador
  const nav = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() : '';
  if (nav?.startsWith('en')) return 'en';
  return 'es';
}

export function persistLang(lang: Lang): void {
  try { window.localStorage.setItem(STORAGE_KEY, lang); } catch { /* noop */ }
}

export function translate(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const entry = (DICT as Record<string, { es: string; en: string }>)[key];
  let s = entry ? entry[lang] || entry.es : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return s;
}

export { DICT };
export type { DictKey };
