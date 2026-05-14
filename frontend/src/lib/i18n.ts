export type Lang = 'es' | 'en';

export const DEFAULT_LANG: Lang = 'es';

// Diccionario centralizado. Si una key no existe en el idioma activo,
// cae al español. Variables: usar {{name}} en el template.
const DICT = {
  // ─────────────────────────── Auth
  'auth.your_account': { es: 'tu cuenta', en: 'your account' },
  'auth.brand.headline.l1':  { es: 'Tu cabina de mando', en: 'Your command deck' },
  'auth.brand.headline.l2':  { es: 'para Claude.',       en: 'for Claude.' },
  'auth.brand.sub': {
    es: 'Eco orquesta múltiples agentes de Claude Code en paralelo, con voz, navegador y terminal. Todo corre en tu Mac.',
    en: 'Eco orchestrates multiple Claude Code agents in parallel, with voice, browser and terminal. It all runs on your Mac.',
  },
  'auth.brand.feat.voice.t':   { es: 'Manejado por voz', en: 'Voice-first' },
  'auth.brand.feat.voice.b':   { es: 'Decí "Hey Eco" y pedile lo que sea. STT con Whisper local.', en: 'Say "Hey Eco" and ask anything. Local Whisper STT.' },
  'auth.brand.feat.term.t':    { es: 'Terminal real', en: 'Real terminal' },
  'auth.brand.feat.term.b':    { es: 'PTY zsh por agente, persistente entre sesiones.', en: 'PTY zsh per agent, persistent across sessions.' },
  'auth.brand.feat.agents.t':  { es: 'Agentes en paralelo', en: 'Parallel agents' },
  'auth.brand.feat.agents.b':  { es: 'Cada conversación vive en su propio git worktree aislado.', en: 'Each conversation lives in its own isolated git worktree.' },
  'auth.brand.feat.private.t': { es: 'Privado por diseño', en: 'Private by design' },
  'auth.brand.feat.private.b': { es: 'PIN + frase argon2id chmod 600. Sin telemetría ni nube.', en: 'PIN + argon2id phrase chmod 600. No telemetry, no cloud.' },
  'auth.brand.badge.local':       { es: 'Local-first', en: 'Local-first' },
  'auth.brand.badge.cli_or_api':  { es: 'Claude CLI o API key', en: 'Claude CLI or API key' },
  'auth.brand.badge.opensource':  { es: 'sin telemetría', en: 'no telemetry' },
  'auth.local_tagline': { es: 'Eco · v0.1 · todo local en tu Mac', en: 'Eco · v0.1 · all local on your Mac' },
  'auth.back': { es: 'Volver', en: 'Back' },
  'auth.phrase_placeholder': { es: 'palabra1 palabra2 palabra3 …', en: 'word1 word2 word3 …' },
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

  // ─────────────────────────── Account menu
  'account.signed_in_as': { es: 'Sesión iniciada como', en: 'Signed in as' },
  'account.lock': { es: 'Bloquear pantalla', en: 'Lock screen' },
  'account.lock.sub': { es: 'Pide el PIN para volver', en: 'Requires PIN to unlock' },
  'account.destroy': { es: 'Cerrar sesión y eliminar usuario', en: 'Sign out and delete user' },
  'account.destroy.sub': { es: 'Empieza de cero con otra cuenta', en: 'Start fresh with another account' },
  'account.destroy.title': { es: '¿Eliminar este usuario?', en: 'Delete this user?' },
  'account.destroy.warning': {
    es: 'Se borrará tu usuario y la frase de recuperación queda inútil. Esta acción no se puede deshacer.',
    en: 'Your user will be deleted and the recovery phrase becomes useless. This cannot be undone.',
  },
  'account.destroy.pin_placeholder': { es: 'PIN actual', en: 'Current PIN' },
  'account.destroy.confirm': { es: 'Eliminar usuario', en: 'Delete user' },
  'account.destroy.loading': { es: 'Eliminando…', en: 'Deleting…' },
  'account.destroy.cancel': { es: 'Cancelar', en: 'Cancel' },
  'account.photo.change': { es: 'Cambiar foto', en: 'Change photo' },
  'account.photo.remove': { es: 'Quitar foto', en: 'Remove photo' },
  'account.photo.err_type': { es: 'Tiene que ser una imagen', en: 'Must be an image' },
  'account.photo.err_save': { es: 'No se pudo guardar', en: 'Could not save' },
  'diff.search': { es: 'Buscar en el diff…', en: 'Search in diff…' },
  'detail.tab.browser': { es: 'Navegador', en: 'Browser' },
  'detail.tab.server': { es: 'Servidor', en: 'Server' },
  'settings.general.dock': { es: 'Dock de agentes', en: 'Agent dock' },
  'settings.general.dock_desc': {
    es: 'Lista las conversaciones activas en el sidebar izquierdo con vista previa al pasar el cursor.',
    en: 'Show active conversations in the left sidebar with hover preview.',
  },

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

  // Top cards del dashboard
  'dash.card.next.title':     { es: 'Próxima acción', en: 'Next action' },
  'dash.card.next.alldone':   { es: 'Todo al día', en: 'All caught up' },
  'dash.card.next.waiting':   { es: 'Esperando tu respuesta', en: 'Waiting for input' },
  'dash.card.next.error':     { es: 'Necesita revisión', en: 'Needs review' },
  'dash.card.next.thinking':  { es: 'Pensando…', en: 'Thinking…' },
  'dash.card.next.executing': { es: 'Ejecutando una tarea', en: 'Running a task' },
  'dash.card.next.running':   { es: 'En progreso', en: 'In progress' },
  'dash.card.next.idle':      { es: 'Inactivo — podés cerrarlo', en: 'Idle — safe to close' },

  'dash.card.live.title':     { es: 'Agentes en vivo', en: 'Live agents' },

  'dash.card.res.title':      { es: 'Recursos en uso', en: 'Open resources' },
  'dash.card.res.ptys':       { es: 'Terminales', en: 'Terminals' },
  'dash.card.res.servers':    { es: 'Dev servers', en: 'Dev servers' },
  'dash.card.res.browsers':   { es: 'Navegadores', en: 'Browsers' },
  'dash.card.res.files':      { es: 'Archivos modificados', en: 'Modified files' },
  'dash.card.res.remote':     { es: 'Remote control', en: 'Remote control' },
  'dash.card.res.worktreesactivos': { es: 'Worktrees', en: 'Worktrees' },
  'dash.card.res.worktrees':  { es: 'Worktrees', en: 'Worktrees' },

  'dash.card.sys.title':      { es: 'Estado del sistema', en: 'System status' },
  'dash.card.sys.backend':    { es: 'Backend Eco', en: 'Eco backend' },
  'dash.card.sys.apikey':     { es: 'API key Claude', en: 'Claude API key' },
  'dash.card.sys.listener':   { es: 'Listener de voz', en: 'Voice listener' },

  'dash.section.agents': { es: 'Agentes', en: 'Agents' },
  'dash.new_bubble': { es: 'Nuevo agente', en: 'New agent' },
  'dash.new_bubble_hint': {
    es: 'Click para nombrarla o decí "Eco abrir [nombre]"',
    en: 'Click to name it or say "Eco open [name]"',
  },
  'dash.no_agents': { es: 'Sin agentes', en: 'No agents' },
  'dash.rail.recent': { es: 'Agentes recientes', en: 'Recent agents' },
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
  'dash.bubble.new': { es: 'Nuevo agente', en: 'New agent' },
  'dash.bubble.no_msg': { es: 'Sin mensajes aún', en: 'No messages yet' },
  'dash.bubble.name_label': { es: 'Nombre del agente', en: 'Agent name' },
  'dash.bubble.name_placeholder': {
    es: 'Ej: Refactor auth, Investigar bug...',
    en: 'E.g. Refactor auth, Investigate bug...',
  },
  'dash.bubble.enter_hint': {
    es: '↩ enter para crear · esc para cancelar',
    en: '↩ enter to create · esc to cancel',
  },
  'dash.bubble.rename_tip': {
    es: 'Doble click para renombrar',
    en: 'Double click to rename',
  },
  'dash.bubble.pause': { es: 'Pausar', en: 'Pause' },
  'dash.bubble.resume': { es: 'Reanudar', en: 'Resume' },
  'dash.bubble.retry': { es: 'Reintentar', en: 'Retry' },
  'dash.bubble.open_detail': { es: 'Abrir detalle', en: 'Open detail' },
  'dash.cmd.placeholder_active': {
    es: 'Eco, dile al agente que…',
    en: 'Eco, tell the agent to…',
  },
  'rail.folders.tooltip_empty': { es: '{{p}} · sin agentes', en: '{{p}} · no agents' },
  'rail.folders.tooltip_open': {
    es: '{{p}} · abrir agente más reciente',
    en: '{{p}} · open most recent agent',
  },
  'wsp.chip.none': { es: 'sin carpeta', en: 'no folder' },
  'wsp.chip.assign': { es: 'Asignar carpeta', en: 'Assign folder' },
  'wsp.chip.empty_picker': {
    es: 'Sin workspaces. Agregalos en Ajustes → Carpetas.',
    en: 'No workspaces. Add them in Settings → Folders.',
  },
  'agent.default_title': { es: 'Agente {{n}}', en: 'Agent {{n}}' },
  'voice.err.permission': { es: 'Permiso de micrófono denegado', en: 'Microphone permission denied' },
  'voice.err.no_mic': { es: 'No se encontró micrófono', en: 'No microphone found' },
  'voice.err.recognition': { es: 'Error de reconocimiento', en: 'Recognition error' },
  'quick.default.1': { es: 'Resumime los cambios', en: 'Summarize the changes' },
  'quick.default.2': { es: 'Generá tests', en: 'Generate tests' },
  'quick.default.3': { es: 'Explicame este código', en: 'Explain this code' },
  'quick.default.4': { es: 'Pasá a producción', en: 'Ship to production' },

  // ─────────────────────────── Backend errors (códigos namespace 'berr.<code>')
  'berr.http.host_required': { es: 'Host header requerido', en: 'Host header required' },
  'berr.http.host_forbidden': { es: 'Host no permitido', en: 'Host not allowed' },
  'berr.http.invalid_body': { es: 'Cuerpo inválido', en: 'Invalid request body' },
  'berr.http.client_header_required': { es: 'Header X-Eco-Client requerido', en: 'X-Eco-Client header required' },
  'berr.http.unauthorized': { es: 'No autorizado', en: 'Unauthorized' },
  'berr.auth.user_exists': { es: 'Ya existe un usuario registrado', en: 'A user is already registered' },
  'berr.auth.no_user': { es: 'No hay usuario registrado', en: 'No user is registered' },
  'berr.auth.pin_format': { es: 'El PIN debe tener entre 4 y 8 dígitos', en: 'PIN must be 4 to 8 digits' },
  'berr.auth.pin_required': { es: 'PIN requerido', en: 'PIN required' },
  'berr.auth.pin_required_delete': { es: 'PIN requerido para borrar usuario', en: 'PIN required to delete user' },
  'berr.auth.pin_wrong': { es: 'PIN incorrecto', en: 'Wrong PIN' },
  'berr.auth.name_empty': { es: 'Nombre de usuario vacío', en: 'Username is empty' },
  'berr.auth.phrase_invalid': { es: 'Frase de recuperación inválida (debe tener 12 palabras BIP39)', en: 'Invalid recovery phrase (must be 12 BIP39 words)' },
  'berr.auth.phrase_mismatch': { es: 'Frase de recuperación incorrecta', en: 'Wrong recovery phrase' },
  'berr.auth.session_invalid': { es: 'Sesión inválida o expirada', en: 'Invalid or expired session' },
  'berr.auth.register_failed': { es: 'Error al registrar', en: 'Registration failed' },
  'berr.auth.recover_failed': { es: 'No se pudo recuperar', en: 'Recovery failed' },
  'berr.wsp.path_empty': { es: 'Ruta vacía', en: 'Empty path' },
  'berr.wsp.path_not_absolute': { es: 'La ruta debe ser absoluta', en: 'Path must be absolute' },
  'berr.wsp.path_too_long': { es: 'Ruta demasiado larga', en: 'Path too long' },
  'berr.wsp.path_invalid_char': { es: 'Carácter inválido', en: 'Invalid character' },
  'berr.wsp.path_not_found': { es: 'La carpeta no existe en el sistema', en: 'Folder does not exist on the system' },
  'berr.wsp.path_not_readable': { es: 'No se puede leer la carpeta', en: 'Cannot read the folder' },
  'berr.wsp.path_not_dir': { es: 'No es una carpeta', en: 'Not a folder' },
  'berr.wsp.path_system': { es: 'Ruta del sistema no permitida', en: 'System path not allowed' },
  'berr.wsp.path_inside_system': { es: 'Ruta dentro del sistema no permitida', en: 'Path inside system folders not allowed' },
  'berr.wsp.add_failed': { es: 'No se pudo agregar el workspace', en: 'Failed to add workspace' },
  'berr.apikey.invalid': { es: 'API key inválida', en: 'Invalid API key' },
  'berr.apikey.save_failed': { es: 'No se pudo guardar la API key', en: 'Failed to save API key' },
  'berr.voice.empty_text': { es: 'Texto vacío', en: 'Empty text' },
  'berr.shell.too_concurrent': { es: 'Demasiados comandos concurrentes', en: 'Too many concurrent commands' },
  'berr.shell.failed': { es: 'Error de shell', en: 'Shell error' },
  'berr.file.diff_failed': { es: 'No se pudo generar el diff', en: 'Failed to generate diff' },
  'berr.tts.piper_unavailable': { es: 'Piper no instalado', en: 'Piper not installed' },
  'berr.tts.too_concurrent': { es: 'Demasiadas síntesis concurrentes', en: 'Too many concurrent syntheses' },
  'berr.tts.timeout': { es: 'TTS timeout', en: 'TTS timeout' },
  'berr.tts.synth_failed': { es: 'Error de síntesis', en: 'Synthesis error' },
  // WS errors
  'berr.invalid_json': { es: 'JSON inválido', en: 'Invalid JSON' },
  'berr.invalid_message': { es: 'Mensaje no cumple el esquema', en: 'Message does not match schema' },
  'berr.busy': { es: 'Ya hay un prompt en curso. Enviá interrupt primero.', en: 'A prompt is already running. Send interrupt first.' },
  'berr.rate_limit': { es: 'Rate limit alcanzado', en: 'Rate limit reached' },
  'berr.agent_failure': { es: 'El agente no pudo completar la operación', en: 'The agent could not complete the operation' },
  'berr.not_connected': { es: 'No conectado al backend', en: 'Not connected to the backend' },
  'berr.ws.too_many_connections': { es: 'Demasiadas conexiones simultáneas', en: 'Too many simultaneous connections' },
  'berr.agent.workspace_denied': { es: 'Workspace no permitido o inválido', en: 'Workspace not allowed or invalid' },
  'berr.agent.aborted': { es: 'Operación interrumpida o expiró', en: 'Operation interrupted or timed out' },
  'berr.agent.permission_denied': { es: 'Acción denegada por política de seguridad', en: 'Action denied by security policy' },
  'berr.agent.rate_limit': { es: 'Rate limit alcanzado', en: 'Rate limit reached' },
  'berr.agent.unknown_failure': { es: 'El agente no pudo completar la operación', en: 'The agent could not complete the operation' },

  'common.cancel': { es: 'Cancelar', en: 'Cancel' },
  'common.create': { es: 'Crear', en: 'Create' },
  'common.save': { es: 'Guardar', en: 'Save' },
  'common.delete': { es: 'Eliminar', en: 'Delete' },
  'common.close': { es: 'Cerrar', en: 'Close' },
  'common.back': { es: 'Atrás', en: 'Back' },
  'common.next': { es: 'Siguiente', en: 'Next' },
  'common.loading': { es: 'Cargando…', en: 'Loading…' },

  // ─────────────────────────── Agent detail
  'detail.btn.listen': { es: 'Hablar', en: 'Speak' },
  'detail.btn.listening': { es: 'Escuchando', en: 'Listening' },
  'detail.tab.chat': { es: 'Conversación', en: 'Conversation' },
  'detail.tab.terminal': { es: 'Terminal', en: 'Terminal' },
  'detail.tab.files': { es: 'Archivos', en: 'Files' },
  'detail.tab.plan': { es: 'Plan', en: 'Plan' },
  'detail.menu.rename': { es: 'Renombrar agente', en: 'Rename agent' },
  'detail.menu.change_workspace': { es: 'Cambiar workspace', en: 'Change workspace' },
  'detail.menu.copy_chat': { es: 'Copiar conversación', en: 'Copy conversation' },
  'detail.menu.close': { es: 'Cerrar agente', en: 'Close agent' },
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
    es: 'Esta agente todavía no modificó archivos.',
    en: 'This agent has not modified any files yet.',
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
  'detail.sidebar.next': { es: 'Acciones rápidas', en: 'Quick actions' },
  'detail.sidebar.suggestion': { es: 'Sugerencia', en: 'Suggestion' },
  'detail.sidebar.safe_mode': { es: 'Modo seguro activo', en: 'Safe mode enabled' },
  'detail.stat.time_active':   { es: 'Tiempo activo', en: 'Time active' },
  'detail.stat.last_activity': { es: 'Última actividad', en: 'Last activity' },
  'detail.stat.messages':      { es: 'Mensajes', en: 'Messages' },
  'detail.stat.tool_calls':    { es: 'Tool calls', en: 'Tool calls' },
  'detail.stat.files_changed': { es: 'Archivos tocados', en: 'Files changed' },
  'detail.stat.state':         { es: 'Estado', en: 'State' },
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
  'detail.header.bubble': { es: 'Agente', en: 'Agent' },
  'detail.header.id': { es: 'ID', en: 'ID' },
  'detail.btn.listen_off_title': { es: 'Detener escucha', en: 'Stop listening' },
  'detail.btn.listen_on_title': { es: 'Activar escucha', en: 'Start listening' },
  'detail.btn.interrupt': { es: 'Detener al agente', en: 'Stop the agent' },
  'detail.chat.write_to': { es: 'Escríbele a {{name}}…', en: 'Write to {{name}}…' },
  'detail.chat.listening_hint': {
    es: 'Escuchando · hablá normal o decí "Eco" para comandos',
    en: 'Listening · speak normally or say "Eco" for commands',
  },
  'detail.chat.eco_listening': { es: 'escuchando comando…', en: 'listening for command…' },
  'detail.menu.workspace_empty_picker': {
    es: 'Sin workspaces. Agregalos en Ajustes.',
    en: 'No workspaces. Add them in Settings.',
  },
  'detail.term.welcome_workspace': {
    es: 'eco-shell · {{ws}}',
    en: 'eco-shell · {{ws}}',
  },
  'detail.term.welcome_workspace_none': {
    es: '(sin workspace)',
    en: '(no workspace)',
  },
  'detail.term.welcome_session': {
    es: '◆ Sesión: {{title}} · escribí "help" para ayuda',
    en: '◆ Session: {{title}} · type "help" for help',
  },
  'detail.term.help_lines': {
    es: 'Comandos disponibles:\n  clear, cls       — limpia la terminal\n  cd <ruta>        — cambia el directorio (sin salir del workspace)\n  pwd              — muestra el directorio actual\n  help             — esta ayuda\n  <cualquier otro> — se ejecuta en shell con timeout 30s',
    en: 'Available commands:\n  clear, cls       — clear the terminal\n  cd <path>        — change directory (within workspace)\n  pwd              — show current directory\n  help             — this help\n  <anything else>  — runs in shell with 30s timeout',
  },
  'detail.term.cd_outside': {
    es: 'cd: {{target}}: fuera del workspace',
    en: 'cd: {{target}}: outside workspace',
  },
  'detail.term.exit_code': { es: 'exit {{code}}', en: 'exit {{code}}' },
  'detail.term.truncated': { es: 'output truncado', en: 'output truncated' },
  'detail.files.created': { es: 'creado', en: 'created' },
  'detail.files.modified_one': { es: 'modificado', en: 'modified' },
  'detail.files.open_editor': { es: 'Abrir en editor', en: 'Open in editor' },

  // ─────────────────────────── Settings
  'settings.title': { es: 'Ajustes', en: 'Settings' },
  'settings.section.general': { es: 'General', en: 'General' },
  'settings.section.claude': { es: 'Claude & API', en: 'Claude & API' },
  'settings.section.voice': { es: 'Voz', en: 'Voice' },
  'settings.section.folders': { es: 'Carpetas', en: 'Folders' },
  'settings.section.security': { es: 'Seguridad', en: 'Security' },
  'settings.section.appearance': { es: 'Apariencia', en: 'Appearance' },
  'settings.section.integrations': { es: 'Integraciones', en: 'Integrations' },
  'settings.section.about': { es: 'Acerca de', en: 'About' },

  'settings.integrations.title': { es: 'Integraciones externas', en: 'External integrations' },
  'settings.integrations.sub': { es: 'Conectá Eco con tu vault Obsidian y otras herramientas', en: 'Connect Eco with your Obsidian vault and other tools' },
  'settings.integrations.obsidian.title': { es: 'Vault Obsidian', en: 'Obsidian vault' },
  'settings.integrations.obsidian.desc': {
    es: 'Cuando está activado, Eco lee tu MOC + última sesión + ADR del proyecto al abrir un agente y lo inyecta como contexto. Podés guardar la sesión actual en el vault con un botón en cada conversación. Acceso directo al filesystem — no requiere que Obsidian esté abierto.',
    en: 'When enabled, Eco reads your project MOC + last session + recent ADR when opening an agent and injects them as context. You can save the current session to the vault from each conversation. Direct filesystem access — Obsidian does not need to be running.',
  },
  'settings.integrations.obsidian.detected_label': { es: 'Vaults detectados en tu Obsidian', en: 'Vaults detected in your Obsidian' },
  'settings.integrations.obsidian.vault_open': { es: 'abierto ahora', en: 'open now' },
  'settings.integrations.obsidian.vault_label': { es: 'O path manual', en: 'Or manual path' },
  'settings.integrations.obsidian.pick_folder': { es: 'Elegir carpeta…', en: 'Pick folder…' },
  'settings.integrations.obsidian.enabled_label': { es: 'Activar lectura/escritura', en: 'Enable read/write' },
  'settings.integrations.obsidian.howto': { es: 'Estructura esperada:', en: 'Expected structure:' },
  'settings.integrations.obsidian.howto_desc': {
    es: 'PARA-lite — 10 - Projects/<repo>/{_MOC.md, Sessions/, Decisions/, Notes/}. Si no existe, Eco la crea al guardar la primera sesión.',
    en: 'PARA-lite — 10 - Projects/<repo>/{_MOC.md, Sessions/, Decisions/, Notes/}. If it doesn\'t exist, Eco creates it when saving the first session.',
  },
  'settings.general.title': { es: 'General', en: 'General' },
  'settings.general.sub': { es: 'Comportamiento global de Eco.', en: 'Global behavior of Eco.' },
  'settings.general.listen_on_boot': { es: 'Escuchar al abrir Eco', en: 'Listen on startup' },
  'settings.general.listen_on_conversation': {
    es: 'Escuchar al entrar a una conversación',
    en: 'Listen when entering a conversation',
  },
  'settings.general.listen_on_conversation_desc': {
    es: 'Si está ON, prende el micrófono al entrar a una conversación. Si está OFF, lo apaga al entrar (anula el "Escuchar al abrir Eco" para conversaciones).',
    en: 'If ON, turns the mic on when entering a conversation. If OFF, turns it off on entry (overrides "Listen on startup" for conversations).',
  },
  'settings.general.review_mode': {
    es: 'Revisar cambios estilo Cursor',
    en: 'Review changes (Cursor-style)',
  },
  'settings.general.review_mode_desc': {
    es: 'El agente aplica los cambios sin interrupciones. Después revisás los diffs en la pestaña Archivos: aceptás o rechazás cada hunk o el archivo entero. Lo rechazado se revierte con git apply -R.',
    en: 'The agent applies changes without interruption. You then review the diffs in the Files tab: accept or reject each hunk or the whole file. Rejected hunks are reverted with git apply -R.',
  },
  'settings.general.notify_on_finish': {
    es: 'Notificar cuando Claude termine',
    en: 'Notify when Claude finishes',
  },
  'settings.general.notify_on_finish_desc': {
    es: 'Muestra una notificación del sistema cuando el PTY del agente queda idle después de procesar. Solo se dispara si la ventana de Eco no está visible (estás en otra app).',
    en: 'Shows a system notification when the agent PTY goes idle after processing. Only fires when the Eco window is not visible (you’re in another app).',
  },
  'settings.general.menubar': { es: 'Mantener Eco en la barra de menú', en: 'Keep Eco in the menu bar' },
  'settings.general.default_folder': { es: 'Carpeta por defecto', en: 'Default folder' },
  'settings.general.default_folder_desc': {
    es: 'Se asigna automáticamente al crear un agente. Vacío = pedir cada vez.',
    en: 'Auto-assigned when creating a new agent. Empty = ask each time.',
  },
  'settings.general.ask_each_time': { es: 'Preguntar cada vez', en: 'Ask each time' },
  'settings.general.shortcut': { es: 'Atajo global', en: 'Global shortcut' },
  'settings.general.shortcut_desc': {
    es: 'Pulsá esta combinación para invocar Eco.',
    en: 'Press this combination to invoke Eco.',
  },
  'settings.general.app_language': { es: 'Idioma de Eco', en: 'Eco language' },
  'settings.general.worktrees_clean':      { es: 'Limpiar worktrees sin usar', en: 'Clean unused worktrees' },
  'settings.general.worktrees_clean_desc': {
    es: 'Elimina worktrees de agentes cerrados que ya no tienen cambios pendientes en ~/.eco/worktrees/.',
    en: 'Removes worktrees from closed agents that have no pending changes in ~/.eco/worktrees/.',
  },
  'settings.general.worktrees_run':      { es: 'Limpiar ahora', en: 'Clean now' },
  'settings.general.worktrees_cleaning': { es: 'Limpiando…', en: 'Cleaning…' },
  'settings.general.worktrees_result':   {
    es: 'Eliminados {removed} · conservados {kept} (con cambios)',
    en: 'Removed {removed} · kept {kept} (with changes)',
  },
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
    es: 'Eco solo podrá leer y escribir aquí',
    en: 'Eco can only read and write here',
  },
  'wsp.no_workspaces': {
    es: 'No tenés workspaces autorizados todavía.',
    en: 'You have no authorized workspaces yet.',
  },
  'wsp.add_other': { es: 'Agregar otra carpeta…', en: 'Add another folder…' },
  'wsp.pick_folder': { es: 'Elegir carpeta…', en: 'Pick folder…' },
  'wsp.type_path_instead': { es: '…o pegar la ruta manualmente', en: '…or paste path manually' },
  'wsp.add_hint': {
    es: 'Pegá el path absoluto. No puede ser ruta del sistema (/etc, /sys, etc.).',
    en: 'Paste the absolute path. Cannot be a system path (/etc, /sys, etc.).',
  },
  'wsp.add_btn': { es: 'Agregar y usar', en: 'Add and use' },
  'wsp.add_loading': { es: 'Agregando…', en: 'Adding…' },
  'wsp.skip': { es: 'Trabajar sin carpeta', en: 'Work without folder' },
  'wsp.change_later': {
    es: 'Podés cambiar el workspace después desde el menú "…" de el agente',
    en: 'You can change the workspace later from the agent\'s "…" menu',
  },

  // ─────────────────────────── Voice orb states
  'voice.idle.label': { es: 'En espera', en: 'Idle' },
  'voice.idle.sub': { es: 'Decí "Eco" o pulsá para hablar', en: 'Say "Eco" or click to talk' },
  'voice.listening.label': { es: 'Escuchando', en: 'Listening' },
  'voice.thinking.label': { es: 'Pensando', en: 'Thinking' },
  'voice.executing.label': { es: 'Ejecutando', en: 'Executing' },
  'voice.speaking.label': { es: 'Hablando', en: 'Speaking' },

  // ─────────────────────────── State labels
  'state.idle': { es: 'Inactivo', en: 'Idle' },
  'state.terminal_live': { es: 'Terminal activa', en: 'Terminal live' },
  'state.pending': { es: 'Pendiente', en: 'Pending' },
  'state.running': { es: 'Ejecutando', en: 'Running' },
  'state.waiting': { es: 'Esperando input', en: 'Waiting for input' },
  'state.paused': { es: 'En pausa', en: 'Paused' },
  'state.done': { es: 'Finalizado', en: 'Done' },
  'state.error': { es: 'Error', en: 'Error' },
  'state.thinking': { es: 'Pensando', en: 'Thinking' },
  'state.executing': { es: 'Ejecutando', en: 'Executing' },

  // ─────────────────────────── Graph view
  'graph.legend.nodes': { es: '{{n}} nodos conectados a Eco', en: '{{n}} nodes connected to Eco' },
  'graph.ws.agents_one': { es: '{{n}} agente', en: '{{n}} agent' },
  'graph.ws.agents_many': { es: '{{n}} agentes', en: '{{n}} agents' },
  'graph.recenter': { es: 'Centrar vista', en: 'Recenter view' },
  'graph.zoom_in': { es: 'Acercar', en: 'Zoom in' },
  'graph.zoom_out': { es: 'Alejar', en: 'Zoom out' },
  'graph.zoom_reset': { es: 'Restablecer zoom', en: 'Reset zoom' },

  // ─────────────────────────── Rail
  'rail.cli.label': { es: 'Claude CLI', en: 'Claude CLI' },
  'rail.cli.local': { es: 'local', en: 'local' },
  'rail.cli.model': { es: 'Modelo: {{model}}', en: 'Model: {{model}}' },

  // ─────────────────────────── Agent menu
  'menu.rename': { es: 'Renombrar', en: 'Rename' },
  'menu.close_bubble': { es: 'Cerrar agente', en: 'Close agent' },
  'menu.pin': { es: 'Pinear', en: 'Pin' },
  'menu.unpin': { es: 'Despinear', en: 'Unpin' },

  // ─────────────────────────── Connection / errors
  'conn.connected': { es: 'conectado', en: 'connected' },
  'conn.connecting': { es: 'conectando…', en: 'connecting…' },
  'conn.disconnected': { es: 'sin conexión', en: 'no connection' },
  'conn.error': { es: 'error', en: 'error' },

  // ─────────────────────────── History screen
  'history.title': { es: 'Historial', en: 'History' },
  'history.sub': {
    es: 'Mensajes de todas las agentes, ordenados por fecha.',
    en: 'Messages from all agents, sorted by date.',
  },
  'history.empty': { es: 'Sin historial todavía.', en: 'No history yet.' },

  // ─────────────────────────── File Explorer
  'files.active_folders': { es: 'Carpetas activas', en: 'Active folders' },
  'files.no_folders': { es: 'Sin carpetas seleccionadas.', en: 'No folders selected.' },
  'files.no_folder_selected': { es: 'Sin carpeta seleccionada', en: 'No folder selected' },
  'files.recent_changes': { es: 'Cambios recientes en las agentes', en: 'Recent changes in agents' },
  'files.no_changes': {
    es: 'Aún no hay cambios registrados. Cuando los agentes escriban archivos, aparecerán aquí.',
    en: 'No changes yet. When agents write files, they will appear here.',
  },
  'files.op.created': { es: 'Creado', en: 'Created' },
  'files.op.modified': { es: 'Modificado', en: 'Modified' },
  'files.op.pending': { es: 'Pendiente', en: 'Pending' },
  'files.op.deleted': { es: 'Borrado', en: 'Deleted' },
  'files.by': { es: 'por', en: 'by' },
  'files.diff_btn': { es: 'Diff', en: 'Diff' },

  // ─────────────────────────── Status overlay
  'status.title': { es: 'Estado de Eco', en: 'Eco status' },
  'status.help_title': { es: 'Comandos de Eco', en: 'Eco commands' },
  'status.summary': {
    es: '{{total}} agente{{p}} · {{active}} activa{{ap}}',
    en: '{{total}} agent{{p}} · {{active}} active',
  },
  'status.empty': { es: 'Sin agentes todavía.', en: 'No agents yet.' },
  'status.help_hint': {
    es: 'Decí o escribí cualquiera de estos comandos.',
    en: 'Say or type any of these commands.',
  },
  'status.msg_count': { es: '{{n}} msg', en: '{{n}} msg' },

  // ─────────────────────────── DiffViewer
  'diff.git': { es: 'diff contra HEAD', en: 'diff against HEAD' },
  'diff.created': { es: 'archivo nuevo (no commiteado)', en: 'new file (not committed)' },
  'diff.plain': { es: 'workspace sin git · contenido completo', en: 'workspace without git · full content' },
  'diff.not_found': { es: 'archivo no encontrado', en: 'file not found' },
  'diff.loading': { es: 'cargando…', en: 'loading…' },
  'diff.no_changes': { es: 'Sin cambios.', en: 'No changes.' },

  // ─────────────────────────── Skill autocomplete
  'skill.results': { es: 'Skills · {{n}} {{w}}', en: 'Skills · {{n}} {{w}}' },
  'skill.result_one': { es: 'resultado', en: 'result' },
  'skill.result_many': { es: 'resultados', en: 'results' },
  'skill.nav_hint': { es: '↑↓ navegar · ⏎ usar · esc cancelar', en: '↑↓ navigate · ⏎ use · esc cancel' },
  'skill.label_skill': { es: 'skill', en: 'skill' },
  'skill.label_command': { es: 'command', en: 'command' },
  'skill.label_agent': { es: 'agent', en: 'agent' },
  'skill.yours': { es: 'tuyo', en: 'yours' },

  // ─────────────────────────── Settings — Voice
  'settings.voice.title': { es: 'Voz', en: 'Voice' },
  'settings.voice.sub': {
    es: 'Eco usa una voz masculina natural en español. Pensada para confirmaciones cortas — no para leer respuestas largas.',
    en: 'Eco uses a natural male Spanish voice. Designed for short confirmations — not for reading long replies.',
  },
  'settings.voice.voice_label': { es: 'Voz de Eco', en: 'Eco\'s voice' },
  'settings.voice.test_btn': { es: 'Probar', en: 'Test' },
  'settings.voice.loading': { es: 'Cargando voces…', en: 'Loading voices…' },
  'settings.voice.intent_hint': {
    es: 'Se elige automáticamente la mejor voz local (Piper) instalada. Si no hay Piper, cae a la voz del sistema.',
    en: 'Automatically picks the best local Piper voice installed. Falls back to system voice if none.',
  },
  'settings.voice.rate': { es: 'Velocidad', en: 'Rate' },
  'settings.voice.rate_desc': { es: '1× = normal · más bajo = más lento', en: '1× = normal · lower = slower' },
  'settings.voice.volume': { es: 'Volumen', en: 'Volume' },
  'settings.voice.volume_desc': { es: 'Solo afecta la voz, no el audio del sistema', en: 'Only affects voice, not system audio' },
  'settings.voice.wake_word': { es: 'Palabra de activación', en: 'Wake word' },
  'settings.voice.wake_word_desc': {
    es: 'Eco se activa cuando la escucha.',
    en: 'Eco activates when it hears this word.',
  },
  'settings.voice.always_on': { es: 'Escucha siempre activa', en: 'Always listening' },
  'settings.voice.always_on_desc': {
    es: 'Necesario para reconocer la palabra de activación.',
    en: 'Required to recognize the wake word.',
  },
  'settings.voice.lang': { es: 'Idioma de reconocimiento', en: 'Recognition language' },
  'settings.voice.speak_replies': { es: 'Respuestas habladas', en: 'Spoken replies' },
  'settings.voice.speak_replies_desc': {
    es: 'Eco te lee en voz alta las respuestas de los agentes.',
    en: 'Eco reads agent responses out loud.',
  },
  'settings.voice.voice_selected': { es: 'Voz seleccionada', en: 'Selected voice' },
  'settings.voice.group_neural': { es: 'Neural local', en: 'Local neural' },
  'settings.voice.group_system': { es: 'Sistema', en: 'System' },
  'settings.voice.no_voices': { es: 'Sin voces en español detectadas.', en: 'No Spanish voices detected.' },
  'settings.voice.try_voice': { es: '▸ Probar', en: '▸ Test' },

  // ─────────────────────────── Settings — Claude
  'settings.claude.title': { es: 'Claude & API', en: 'Claude & API' },
  'settings.claude.sub': {
    es: 'Configura tu acceso a los modelos de Anthropic.',
    en: 'Configure your access to Anthropic models.',
  },
  // Autenticación con Claude — explica las 2 vías (CLI vs API key)
  'settings.claude.auth.using_cli': {
    es: 'Autenticado con tu sesión de Claude Code',
    en: 'Authenticated via your Claude Code session',
  },
  'settings.claude.auth.using_apikey': {
    es: 'Autenticado con API key',
    en: 'Authenticated via API key',
  },
  'settings.claude.auth.using_none': {
    es: 'Sin método de autenticación configurado',
    en: 'No authentication method configured',
  },
  'settings.claude.auth.priority_hint': {
    es: 'Si tenés ambos, Eco prefiere la sesión CLI (sin costo extra)',
    en: 'If both are present, Eco prefers the CLI session (no extra cost)',
  },
  'settings.claude.auth.active': { es: 'Activo', en: 'Active' },
  'settings.claude.auth.or': { es: 'o', en: 'or' },
  'settings.claude.auth.cli_title': {
    es: 'Sesión de Claude Code CLI · recomendado',
    en: 'Claude Code CLI session · recommended',
  },
  'settings.claude.auth.cli_desc': {
    es: 'Si tenés Claude Pro o Max, hacé `claude login` una vez en tu terminal. El consumo va contra tu suscripción — sin costo extra por mensaje.',
    en: 'If you have Claude Pro or Max, run `claude login` once in your terminal. Usage counts against your subscription — no extra cost per message.',
  },
  'settings.claude.auth.cli_installed':     { es: 'CLI detectado', en: 'CLI detected' },
  'settings.claude.auth.cli_not_installed': { es: 'CLI no encontrado en el path configurado', en: 'CLI not found at configured path' },
  'settings.claude.auth.cli_loggedin':      { es: 'sesión activa en', en: 'session active in' },
  'settings.claude.auth.cli_notloggedin':   { es: 'sin sesión iniciada', en: 'no session' },
  'settings.claude.auth.apikey_title': {
    es: 'API Key directa de Anthropic',
    en: 'Direct Anthropic API key',
  },
  'settings.claude.auth.apikey_desc': {
    es: 'Pegá una key sk-ant-… para uso pay-per-use. Cada mensaje consume tu API budget según los tokens. Útil si no tenés suscripción Pro/Max.',
    en: 'Paste an sk-ant-… key for pay-per-use. Each message consumes your API budget based on tokens. Useful if you don\'t have a Pro/Max subscription.',
  },

  'settings.claude.model_info.title': {
    es: 'Modelo actual',
    en: 'Current model',
  },
  'settings.claude.model_info.desc': {
    es: 'Sonnet 4.5 — balance ideal de inteligencia y velocidad. Para cambiar, editá ECO_MODEL en backend/.env (override avanzado).',
    en: 'Sonnet 4.5 — best balance of intelligence and speed. To change, edit ECO_MODEL in backend/.env (advanced override).',
  },

  'settings.claude.apikey.title': { es: 'API Key de Anthropic', en: 'Anthropic API Key' },
  'settings.claude.apikey.desc': {
    es: 'Se guarda en ~/.eco/api-key con permisos 600. En sesiones con PIN, se cifra con la clave derivada (próximamente).',
    en: 'Stored at ~/.eco/api-key with mode 600. In PIN sessions, will be encrypted with derived key (coming soon).',
  },
  'settings.claude.apikey.saved': { es: 'Guardada', en: 'Saved' },
  'settings.claude.apikey.save_btn': { es: 'Guardar', en: 'Save' },
  'settings.claude.apikey.replace_btn': { es: 'Reemplazar', en: 'Replace' },
  'settings.claude.apikey.validating': { es: 'Validando…', en: 'Validating…' },
  'settings.claude.apikey.remove_btn': { es: 'Quitar', en: 'Remove' },
  'settings.claude.apikey.success': {
    es: 'API key guardada y validada contra Anthropic.',
    en: 'API key saved and validated against Anthropic.',
  },
  'settings.claude.default_model': { es: 'Modelo por defecto', en: 'Default model' },
  'settings.claude.default_model_desc': { es: 'Usado al crear nuevos agentes.', en: 'Used when creating new agents.' },
  'settings.claude.cli_path': { es: 'Ruta del Claude CLI', en: 'Claude CLI path' },
  'settings.claude.cli_path_desc': { es: 'Binario que ejecuta cada agente.', en: 'Binary that runs each agent.' },
  'settings.claude.streaming': { es: 'Streaming de respuestas', en: 'Response streaming' },
  'settings.claude.streaming_desc': { es: 'Mostrar texto en tiempo real.', en: 'Show text in real time.' },

  // ─────────────────────────── Settings — Folders
  'settings.folders.title': { es: 'Carpetas autorizadas', en: 'Authorized folders' },
  'settings.folders.sub': {
    es: 'Eco solo puede leer y escribir dentro de estas rutas. Los workspaces de .env aparecen marcados como bloqueados.',
    en: 'Eco can only read and write within these paths. .env workspaces are marked as locked.',
  },
  'settings.folders.add_placeholder': { es: 'Pegá una ruta absoluta…', en: 'Paste an absolute path…' },
  'settings.folders.add_btn': { es: 'Agregar', en: 'Add' },
  'settings.folders.pick_native': { es: 'Elegir carpeta con Finder…', en: 'Pick folder with Finder…' },
  'settings.folders.adding': { es: 'Agregando…', en: 'Adding…' },
  'settings.folders.hint': {
    es: 'La ruta debe ser absoluta y existir. Se bloquean rutas del sistema (/etc, /sys, /proc, etc.).',
    en: 'Path must be absolute and exist. System paths (/etc, /sys, /proc, etc.) are blocked.',
  },
  'settings.folders.empty': {
    es: 'Sin carpetas autorizadas. Agregá una arriba para empezar.',
    en: 'No authorized folders. Add one above to start.',
  },
  'settings.folders.from_env': { es: 'Desde backend/.env · no editable', en: 'From backend/.env · not editable' },
  'settings.folders.from_app': { es: 'Agregada desde la app', en: 'Added from the app' },

  // ─────────────────────────── Settings — Security
  'settings.security.title': { es: 'Seguridad', en: 'Security' },
  'settings.security.sub': {
    es: 'Bloqueo de la app y manejo de datos locales.',
    en: 'App locking and local data management.',
  },
  'settings.security.lock_inactivity': { es: 'Bloquear tras inactividad', en: 'Lock after inactivity' },
  'settings.security.lock_inactivity_desc': {
    es: 'Pide tu PIN cuando no haya actividad por este tiempo. Pone Eco en lock — los agentes siguen corriendo en background.',
    en: 'Asks for your PIN after this period of inactivity. Locks Eco — agents keep running in the background.',
  },
  'settings.security.lock_now': { es: 'Bloquear pantalla ahora', en: 'Lock screen now' },
  'settings.security.lock_now_desc': {
    es: 'Cierra la sesión local; tendrás que reingresar tu PIN. Los agentes corriendo no se interrumpen.',
    en: 'Closes the local session; you\'ll need to re-enter your PIN. Running agents are not interrupted.',
  },
  'settings.security.lock_now_btn': { es: 'Bloquear', en: 'Lock' },

  'settings.security.clear.title': { es: 'Limpiar datos locales', en: 'Clear local data' },
  'settings.security.clear.desc': {
    es: 'Borra preferencias, historial de agentes, foto de perfil y caché del navegador interno. NO toca tu cuenta ni los worktrees del repo.',
    en: 'Removes preferences, agent history, profile photo and internal browser cache. Does NOT touch your account or repo worktrees.',
  },
  'settings.security.clear.btn': { es: 'Limpiar', en: 'Clear' },
  'settings.security.clear.confirm1': {
    es: '¿Limpiar todos los datos locales? Se reiniciará la app.',
    en: 'Clear all local data? The app will reload.',
  },
  'settings.security.clear.confirm2': {
    es: 'Última confirmación. Esto NO se puede deshacer.',
    en: 'Last confirmation. This CANNOT be undone.',
  },
  'settings.security.clear.done': {
    es: 'Datos locales borrados. Recargando…',
    en: 'Local data cleared. Reloading…',
  },

  'settings.security.minutes': { es: '{{n}} minutos', en: '{{n}} minutes' },
  'settings.security.one_hour': { es: '1 hora', en: '1 hour' },
  'settings.security.never': { es: 'Nunca', en: 'Never' },

  // ─────────────────────────── Settings — Appearance
  'settings.appearance.title': { es: 'Apariencia', en: 'Appearance' },
  'settings.appearance.sub': {
    es: 'Tema visual y preferencias de interfaz.',
    en: 'Visual theme and interface preferences.',
  },
  'settings.appearance.theme': { es: 'Tema', en: 'Theme' },
  'settings.appearance.theme.curated': { es: 'Paletas con personalidad', en: 'Curated palettes' },
  'settings.appearance.theme.dark': { es: 'Oscuro', en: 'Dark' },
  'settings.appearance.theme.light': { es: 'Claro', en: 'Light' },
  'settings.appearance.theme.system': { es: 'Sistema', en: 'System' },
  'settings.appearance.accent': { es: 'Color de acento', en: 'Accent color' },

  // ─────────────────────────── Settings — About
  'settings.about.tagline': {
    es: 'Centro de control local para agentes de Claude. Voz, código, terminal, navegador y git, todo en tu Mac.',
    en: 'Local control center for Claude agents. Voice, code, terminal, browser and git, all on your Mac.',
  },
  'settings.about.packaged': { es: 'App empaquetada', en: 'Packaged app' },
  'settings.about.dev':      { es: 'Modo dev', en: 'Dev mode' },

  // What Eco does
  'settings.about.what.title': { es: '¿Qué hace Eco?', en: 'What does Eco do?' },
  'settings.about.what.body': {
    es: 'Eco orquesta múltiples agentes de Claude trabajando en paralelo, cada uno con su propio worktree git aislado (desde la rama base que elijas), dev server con puerto único, terminal real y navegador con sesión propia (cookies/localStorage no se cruzan). Te permite chatear, dar comandos por voz o texto, revisar diffs estilo Cursor antes de commitear, commitear con IA, hacer push, y guardar sesiones en Obsidian. 35 temas + 26 accents para personalizar. Todo corre 100% local en tu Mac.',
    en: 'Eco orchestrates multiple Claude agents working in parallel, each with its own isolated git worktree (from a base branch you pick), unique dev server port, real terminal and browser with its own session (cookies/localStorage don\'t cross). Chat, voice or text commands, Cursor-style diff review before committing, AI commits, push, and Obsidian session saving. 35 themes + 26 accents for personalization. Everything runs 100% local on your Mac.',
  },

  // Features
  'settings.about.features.title': { es: 'Características', en: 'Features' },
  'settings.about.feat.agents.title':  { es: 'Agentes en paralelo', en: 'Parallel agents' },
  'settings.about.feat.agents.body':   { es: 'Múltiples conversaciones simultáneas con Claude, aisladas por git worktree desde la rama base que elijas (favoritos configurables).', en: 'Multiple simultaneous Claude conversations, isolated by git worktree from a base branch you pick (configurable favorites).' },
  'settings.about.feat.terminal.title': { es: 'Terminal real', en: 'Real terminal' },
  'settings.about.feat.terminal.body':  { es: 'PTY zsh por agente con xterm.js. Persiste si salís y volvés. Multi-cliente: scripts internos como skill picker no kickean tu sesión.', en: 'PTY zsh per agent with xterm.js. Persists if you leave and return. Multi-client: internal scripts like skill picker don\'t kick your session.' },
  'settings.about.feat.browser.title':  { es: 'Navegador aislado', en: 'Isolated browser' },
  'settings.about.feat.browser.body':   { es: '<webview> Chromium con partition única por agente — cookies/localStorage no se cruzan. Botones de copiar URL y enviar al PTY de Claude.', en: 'Chromium <webview> with unique partition per agent — cookies/localStorage don\'t cross. Buttons to copy URL and send to Claude\'s PTY.' },
  'settings.about.feat.server.title':   { es: 'Dev server aislado', en: 'Isolated dev server' },
  'settings.about.feat.server.body':    { es: 'Un dev server por agente con puerto auto-asignado serializado (no chocan). Detección del puerto real del log + auto-reparación si el config hardcodea puerto.', en: 'One dev server per agent with serialized auto-assigned port (no clashes). Real port detection from log + auto-repair if config hardcodes port.' },
  'settings.about.feat.git.title':      { es: 'Git integrado', en: 'Built-in git' },
  'settings.about.feat.git.body':       { es: 'Branch picker, commit con IA (preview editable), push, pull/fetch, lista de PRs con checkout, banner del PR actual con merge/close.', en: 'Branch picker, AI commit (editable preview), push, pull/fetch, PRs list with checkout, current PR banner with merge/close.' },
  'settings.about.feat.review.title':   { es: 'Review estilo Cursor', en: 'Cursor-style review' },
  'settings.about.feat.review.body':    { es: 'El agente edita libremente; vos revisás los diffs después, aceptás/rechazás por hunk o por archivo. Banner persistente con pendientes.', en: 'Agent edits freely; you review diffs after, accept/reject per hunk or file. Persistent banner with pending changes.' },
  'settings.about.feat.voice.title':    { es: 'Voz local', en: 'Local voice' },
  'settings.about.feat.voice.body':     { es: 'Wake word + STT con Apple Speech (.app) o Whisper (web). TTS con Piper o macOS say. Sin la nube.', en: 'Wake word + STT with Apple Speech (.app) or Whisper (web). TTS with Piper or macOS say. Cloud-free.' },
  'settings.about.feat.obsidian.title': { es: 'Obsidian', en: 'Obsidian' },
  'settings.about.feat.obsidian.body':  { es: 'Lee MOC + última sesión + ADR del proyecto. Guarda sesiones automáticamente — built-in PARA-lite o comando custom (ej. tu skill /kb).', en: 'Reads project MOC + last session + ADR. Saves sessions automatically — built-in PARA-lite or custom command (e.g. your /kb skill).' },
  'settings.about.feat.skills.title':   { es: 'Skills', en: 'Skills' },
  'settings.about.feat.skills.body':    { es: 'Slash commands de Claude Code detectados de tu vault. Picker integrado con favoritos y ejecución al PTY del agente.', en: 'Claude Code slash commands detected from your vault. Built-in picker with favorites and execution to agent\'s PTY.' },
  'settings.about.feat.themes.title':   { es: 'Personalización', en: 'Personalization' },
  'settings.about.feat.themes.body':    { es: '35 temas (Vaporwave, Aurora, Volcán, Galaxia, Matrix, Acid Yellow, Blood Moon, Cherry Bomb, etc.) + 26 accents (Mint, Esmeralda, Fucsia, Azul real, Mostaza...).', en: '35 themes (Vaporwave, Aurora, Volcano, Galaxy, Matrix, Acid Yellow, Blood Moon, Cherry Bomb, etc.) + 26 accents (Mint, Emerald, Fuchsia, Royal Blue, Mustard...).' },
  'settings.about.feat.cleanup.title':  { es: 'Cleanup automático', en: 'Auto cleanup' },
  'settings.about.feat.cleanup.body':   { es: 'Al cerrar un agente se borra el worktree y la rama eco/<id>. Doble confirmación si hay archivos modificados sin commitear.', en: 'Closing an agent removes the worktree and the eco/<id> branch. Double confirmation if there are uncommitted changes.' },

  // Tutorials
  'settings.about.tutorials.title': { es: 'Tutoriales rápidos', en: 'Quick tutorials' },
  'settings.about.tut.first_agent.title': { es: 'Crear tu primer agente', en: 'Create your first agent' },
  'settings.about.tut.first_agent.s1':    { es: 'Andá al Dashboard y dale al botón "Nuevo agente".', en: 'Go to the Dashboard and click "New agent".' },
  'settings.about.tut.first_agent.s2':    { es: 'Escribí un nombre descriptivo (ej: "Fix bug login") y dale Crear.', en: 'Write a descriptive name (e.g., "Fix login bug") and hit Create.' },
  'settings.about.tut.first_agent.s3':    { es: 'Elegí la carpeta del proyecto con el botón Finder.', en: 'Pick the project folder with the Finder button.' },
  'settings.about.tut.first_agent.s4':    { es: 'Empezá a chatear. Eco crea un git worktree automáticamente.', en: 'Start chatting. Eco creates a git worktree automatically.' },
  'settings.about.tut.dev_server.title':  { es: 'Levantar el dev server', en: 'Start the dev server' },
  'settings.about.tut.dev_server.s1':     { es: 'Dentro del agente, pestaña "Servidor".', en: 'Inside the agent, "Server" tab.' },
  'settings.about.tut.dev_server.s2':     { es: 'Elegí un skill (ej: /dev-up) o pegá el comando bash directo.', en: 'Pick a skill (e.g., /dev-up) or paste the bash command directly.' },
  'settings.about.tut.dev_server.s3':     { es: 'Iniciar. Cuando arranque, abrí "Navegador" — la URL se carga sola.', en: 'Start. When ready, open "Browser" — the URL loads itself.' },
  'settings.about.tut.commit.title':      { es: 'Commit con IA', en: 'AI commit' },
  'settings.about.tut.commit.s1':         { es: 'Sidebar del agente → sección Git → "Generar mensaje".', en: 'Agent sidebar → Git section → "Generate message".' },
  'settings.about.tut.commit.s2':         { es: 'Claude analiza el diff y propone un mensaje. Editalo si querés.', en: 'Claude analyzes the diff and proposes a message. Edit if needed.' },
  'settings.about.tut.commit.s3':         { es: '"Hacer commit" lo aplica. NUNCA hace push — eso es manual.', en: '"Commit" applies it. NEVER pushes — that\'s manual.' },
  'settings.about.tut.voice.title':       { es: 'Hablarle a Eco', en: 'Talk to Eco' },
  'settings.about.tut.voice.s1':          { es: 'Decí "Eco" + tu comando. Ej: "Eco abrí Aditum" o "Eco al final".', en: 'Say "Eco" + your command. E.g., "Eco open Aditum" or "Eco scroll to end".' },
  'settings.about.tut.voice.s2':          { es: 'Dentro de un agente, sin "Eco" adelante, el texto se manda al chat.', en: 'Inside an agent, without "Eco" prefix, text goes to the chat.' },

  // Shortcuts
  'settings.about.shortcuts.title': { es: 'Atajos de teclado', en: 'Keyboard shortcuts' },
  'settings.about.sc.reload':         { es: 'Recargar la app', en: 'Reload the app' },
  'settings.about.sc.devtools':       { es: 'Abrir DevTools (debug)', en: 'Open DevTools (debug)' },
  'settings.about.sc.settings':       { es: 'Abrir Ajustes', en: 'Open Settings' },
  'settings.about.sc.close_modal':    { es: 'Cerrar modal/dialog', en: 'Close modal/dialog' },
  'settings.about.sc.voice_command':  { es: 'Ejecutar comando de voz', en: 'Run voice command' },

  // Privacy
  'settings.about.privacy.title': { es: 'Privacidad y datos', en: 'Privacy & data' },
  'settings.about.priv.local': { es: 'Local', en: 'Local' },
  'settings.about.priv.cloud': { es: 'A la nube', en: 'To cloud' },
  'settings.about.priv.audio.label':     { es: 'Audio del micrófono', en: 'Microphone audio' },
  'settings.about.priv.audio.desc':      { es: 'STT con Whisper corre 100% en tu Mac. El audio NUNCA sale.', en: 'Whisper STT runs 100% on your Mac. Audio NEVER leaves.' },
  'settings.about.priv.tts.label':       { es: 'Voz sintetizada (TTS)', en: 'Synthesized voice (TTS)' },
  'settings.about.priv.tts.desc':        { es: 'Piper genera el audio offline. Sin servicios externos.', en: 'Piper generates audio offline. No external services.' },
  'settings.about.priv.auth.label':      { es: 'Tu cuenta (PIN + frase)', en: 'Your account (PIN + phrase)' },
  'settings.about.priv.auth.desc':       { es: '~/.eco/user.json con argon2id, chmod 600. Sin servidor externo.', en: '~/.eco/user.json with argon2id, chmod 600. No external server.' },
  'settings.about.priv.workspace.label': { es: 'Workspaces y archivos', en: 'Workspaces and files' },
  'settings.about.priv.workspace.desc':  { es: 'Solo Eco lee/escribe los paths que autorizaste explícitamente.', en: 'Only Eco reads/writes paths you explicitly authorized.' },
  'settings.about.priv.history.label':   { es: 'Historial de agentes', en: 'Agent history' },
  'settings.about.priv.history.desc':    { es: 'localStorage del browser de Eco. No se sincroniza ni se sube.', en: 'Eco browser localStorage. Not synced or uploaded.' },
  'settings.about.priv.claude.label':    { es: 'Conversaciones con Claude', en: 'Conversations with Claude' },
  'settings.about.priv.claude.desc':     { es: 'Los prompts y respuestas SÍ viajan a la API de Anthropic (por diseño). Eco no los registra en ningún server propio.', en: 'Prompts and replies DO go to Anthropic\'s API (by design). Eco does not log them on any of its own servers.' },

  // Stack
  'settings.about.stack.title': { es: 'Stack técnico', en: 'Tech stack' },

  // Credits
  'settings.about.credits.title':     { es: 'Créditos', en: 'Credits' },
  'settings.about.credits.role':      { es: 'Diseñador, desarrollador y mantenedor de Eco.', en: 'Designer, developer and maintainer of Eco.' },
  'settings.about.credits.year':      { es: 'Versión', en: 'Version' },
  'settings.about.credits.license':   { es: 'Licencia', en: 'License' },
  'settings.about.credits.platform':  { es: 'Plataforma', en: 'Platform' },
  'settings.about.credits.lang':      { es: 'Lenguaje', en: 'Language' },
  'settings.about.credits.thanks_to': { es: 'Hecho posible por', en: 'Made possible by' },
  'settings.about.credits.thanks_body': {
    es: 'Claude Code SDK · Anthropic · Electron · Vite · React · xterm.js · node-pty · openWakeWord · faster-whisper · Piper TTS · Obsidian Local REST API. Gracias a los autores y mantenedores de cada uno de estos proyectos.',
    en: 'Claude Code SDK · Anthropic · Electron · Vite · React · xterm.js · node-pty · openWakeWord · faster-whisper · Piper TTS · Obsidian Local REST API. Thanks to the authors and maintainers of each one of these projects.',
  },
  'settings.about.credits.made_with': { es: 'Hecho con cuidado en Florida, USA', en: 'Crafted with care in Florida, USA' },

  // Centro de soporte — UI
  'settings.about.search.placeholder': { es: 'Buscar en el centro de soporte…', en: 'Search the support center…' },
  'settings.about.search.empty':       { es: 'Sin resultados', en: 'No results' },
  'settings.about.search.one':         { es: 'resultado', en: 'result' },
  'settings.about.search.many':        { es: 'resultados', en: 'results' },
  'settings.about.group.start':        { es: 'Empezar', en: 'Get started' },
  'settings.about.group.reference':    { es: 'Referencia', en: 'Reference' },
  'settings.about.group.help':         { es: 'Ayuda', en: 'Help' },
  'settings.about.group.tech':         { es: 'Bajo el capó', en: 'Under the hood' },

  // Quick start
  'settings.about.quickstart.title': { es: 'Inicio rápido', en: 'Quick start' },
  'settings.about.qs.s1.t': { es: 'Conectá Claude', en: 'Connect Claude' },
  'settings.about.qs.s1.b': {
    es: 'Si tenés Claude CLI logueado, Eco lo usa solo. Si no, pegá una API key de Anthropic en Ajustes → Claude.',
    en: 'If you have Claude CLI logged in, Eco picks it up automatically. Otherwise paste an Anthropic API key in Settings → Claude.',
  },
  'settings.about.qs.s2.t': { es: 'Creá un agente', en: 'Create an agent' },
  'settings.about.qs.s2.b': {
    es: 'En el Dashboard tocá "Nuevo agente". Dale un nombre y elegí la carpeta del proyecto.',
    en: 'On the Dashboard tap "New agent". Give it a name and pick the project folder.',
  },
  'settings.about.qs.s3.t': { es: 'Conversá', en: 'Chat' },
  'settings.about.qs.s3.b': {
    es: 'Escribí o decí "Eco …". Cada agente vive en un git worktree aislado bajo ~/.eco/worktrees/.',
    en: 'Type or say "Eco …". Each agent lives in an isolated git worktree under ~/.eco/worktrees/.',
  },
  'settings.about.qs.s4.t': { es: 'Probá la voz', en: 'Try voice' },
  'settings.about.qs.s4.b': {
    es: 'Activá el listener en Ajustes → Voz. Decí "Hey Eco" y luego un comando. Mirá la pestaña Voz para la lista completa.',
    en: 'Turn on the listener in Settings → Voice. Say "Hey Eco" then a command. See the Voice tab for the full list.',
  },

  // Voice commands
  'settings.about.voice.title':         { es: 'Comandos de voz', en: 'Voice commands' },
  'settings.about.voice.nav':           { es: 'Navegación global', en: 'Global navigation' },
  'settings.about.voice.nav.home':      { es: 'Volver al dashboard', en: 'Back to dashboard' },
  'settings.about.voice.nav.settings':  { es: 'Abre la pantalla de Ajustes', en: 'Open Settings' },
  'settings.about.voice.nav.tabs':      { es: 'Abre la pestaña correspondiente del navbar', en: 'Open the matching navbar tab' },
  'settings.about.voice.nav.status':    { es: 'Lee voz alta el estado actual de Eco', en: 'Reads aloud current Eco status' },
  'settings.about.voice.nav.help':      { es: 'Muestra los comandos disponibles', en: 'Shows available commands' },
  'settings.about.voice.agents':        { es: 'Agentes', en: 'Agents' },
  'settings.about.voice.agents.open':   { es: 'Crea o abre un agente por nombre', en: 'Creates or opens an agent by name' },
  'settings.about.voice.agents.rename': { es: 'Renombra el agente activo', en: 'Renames the active agent' },
  'settings.about.voice.agents.close':  { es: 'Cierra el agente activo', en: 'Closes the active agent' },
  'settings.about.voice.agents.nav':    { es: 'Navega entre los agentes abiertos', en: 'Cycles through open agents' },
  'settings.about.voice.agents.pause':  { es: 'Pausa o continúa la respuesta en curso', en: 'Pauses or resumes the current reply' },
  'settings.about.voice.inside':        { es: 'Dentro de un agente', en: 'Inside an agent' },
  'settings.about.voice.inside.tabs':   { es: 'Cambia entre las pestañas internas', en: 'Switches between inner tabs' },
  'settings.about.voice.inside.scroll': { es: 'Mueve el scroll del chat', en: 'Scrolls the chat' },
  'settings.about.voice.inside.repeat': { es: 'Eco vuelve a leer la última respuesta', en: 'Eco reads the last reply again' },
  'settings.about.voice.inside.confirm':{ es: 'Confirma o cancela una pregunta de Eco', en: 'Confirms or cancels an Eco prompt' },
  'settings.about.voice.appearance':    { es: 'Voz y apariencia', en: 'Voice & appearance' },
  'settings.about.voice.appearance.tts':{ es: 'Mutea o reactiva la voz de Eco', en: 'Mutes or unmutes Eco voice' },
  'settings.about.voice.appearance.rate':{ es: 'Cambia la velocidad de habla', en: 'Changes speaking rate' },
  'settings.about.voice.appearance.theme':{ es: 'Cambia el tema visual', en: 'Switches visual theme' },

  // Slash commands
  'settings.about.slash.title':  { es: 'Slash commands', en: 'Slash commands' },
  'settings.about.slash.intro':  {
    es: 'Dentro del chat del agente podés tirar comandos directos a Claude Code. Eco también detecta tus skills personales del vault de Obsidian.',
    en: 'Inside the agent chat you can run direct Claude Code commands. Eco also detects your personal skills from the Obsidian vault.',
  },
  'settings.about.slash.devup':  { es: 'Sube, baja o reinicia el dev server del agente.', en: 'Brings the agent dev server up, down or restarts it.' },
  'settings.about.slash.remote': { es: 'Conecta el agente a Claude Code en modo remote-control.', en: 'Connects the agent to Claude Code in remote-control mode.' },
  'settings.about.slash.custom': { es: 'Cualquier skill que tengas en ~/.claude/commands/.', en: 'Any skill you have in ~/.claude/commands/.' },
  'settings.about.slash.kb':     { es: 'Guarda info al vault de Obsidian (ADR, nota, tarea, etc.).', en: 'Saves info to your Obsidian vault (ADR, note, task, etc.).' },

  // FAQ
  'settings.about.faq.title':       { es: 'Preguntas frecuentes', en: 'FAQ' },
  'settings.about.faq.cost.q':      { es: '¿Cuánto cuesta usar Eco?', en: 'How much does Eco cost?' },
  'settings.about.faq.cost.a':      {
    es: 'Eco es gratis. Solo pagás el uso de la API de Anthropic según tu plan (o nada si usás Claude CLI con tu suscripción).',
    en: 'Eco is free. You only pay Anthropic API usage according to your plan (or nothing if you use Claude CLI with your subscription).',
  },
  'settings.about.faq.cli.q':       { es: '¿API key o Claude CLI?', en: 'API key or Claude CLI?' },
  'settings.about.faq.cli.a':       {
    es: 'Si tenés Claude Pro/Team con CLI logueado, Eco lo usa y no consumís API. La API key solo es necesaria si no tenés CLI o querés forzarla.',
    en: 'If you have Claude Pro/Team with CLI logged in, Eco uses it and you do not consume API. The API key is only needed if you do not have CLI or want to force it.',
  },
  'settings.about.faq.offline.q':   { es: '¿Funciona offline?', en: 'Does it work offline?' },
  'settings.about.faq.offline.a':   {
    es: 'La voz (STT/TTS) y el listener corren 100% local. El chat con Claude necesita internet para hablar con Anthropic.',
    en: 'Voice (STT/TTS) and the listener run 100% locally. Chat with Claude needs internet to talk to Anthropic.',
  },
  'settings.about.faq.windows.q':   { es: '¿Hay versión para Windows o Linux?', en: 'Is there a Windows or Linux build?' },
  'settings.about.faq.windows.a':   {
    es: 'Hoy solo macOS. Mucho del código depende de zsh, Keychain y rutas Unix; el port a Windows requiere trabajo.',
    en: 'macOS only today. A lot of the code depends on zsh, Keychain and Unix paths; a Windows port needs work.',
  },
  'settings.about.faq.commit.q':    { es: '¿Eco hace commits o push automáticos?', en: 'Does Eco auto-commit or push?' },
  'settings.about.faq.commit.a':    {
    es: 'Nunca. Eco propone mensajes y aplica commits si vos le das aceptar. Push siempre es manual desde tu terminal.',
    en: 'Never. Eco proposes messages and applies commits only if you accept. Push is always manual from your terminal.',
  },
  'settings.about.faq.worktree.q':  { es: '¿Qué son los git worktrees?', en: 'What are git worktrees?' },
  'settings.about.faq.worktree.a':  {
    es: 'Cada agente trabaja en una copia aislada del repo bajo ~/.eco/worktrees/<agente>. Tu working tree principal no se toca.',
    en: 'Each agent works in an isolated repo copy under ~/.eco/worktrees/<agent>. Your main working tree is untouched.',
  },
  'settings.about.faq.data.q':      { es: '¿Dónde se guardan mis datos?', en: 'Where is my data stored?' },
  'settings.about.faq.data.a':      {
    es: 'Todo local: ~/.eco/ para configuración y worktrees, localStorage para historial y preferencias del UI. Nada en la nube.',
    en: 'All local: ~/.eco/ for config and worktrees, localStorage for history and UI prefs. Nothing in the cloud.',
  },
  'settings.about.faq.voice.q':     { es: '¿Eco escucha siempre el micrófono?', en: 'Does Eco always listen to the mic?' },
  'settings.about.faq.voice.a':     {
    es: 'Solo si activás el listener. Antes de la wake word "Hey Eco" no se procesa nada — openwakeword corre local y descarta audio que no matchee.',
    en: 'Only if you enable the listener. Before the "Hey Eco" wake word nothing is processed — openwakeword runs locally and discards non-matching audio.',
  },

  // Troubleshooting
  'settings.about.trouble.title':    { es: 'Solución de problemas', en: 'Troubleshooting' },
  'settings.about.tr.term.p':        { es: 'La terminal no abre o se cierra al instante', en: 'Terminal does not open or closes instantly' },
  'settings.about.tr.term.s':        {
    es: 'Verificá que la carpeta del agente exista y que tengas zsh instalado. En Ajustes → Carpetas, asegurate de que la ruta es correcta. Si seguís viendo "[shell exited code=1]", probá reiniciar Eco.',
    en: 'Make sure the agent folder exists and zsh is installed. In Settings → Folders confirm the path is correct. If you keep seeing "[shell exited code=1]", try restarting Eco.',
  },
  'settings.about.tr.server.p':      { es: 'El dev server no levanta', en: 'Dev server does not start' },
  'settings.about.tr.server.s':      {
    es: 'Otro proceso puede tener el puerto. Eco intenta liberarlo automáticamente pero podés correr `lsof -ti :PUERTO` en una terminal externa para verificar. Usá "Reiniciar" en la pestaña Servidor.',
    en: 'Another process may hold the port. Eco tries to free it automatically but you can run `lsof -ti :PORT` in a shell to verify. Use "Restart" in the Server tab.',
  },
  'settings.about.tr.browser.p':     { es: 'El navegador queda en blanco', en: 'Browser stays blank' },
  'settings.about.tr.browser.s':     {
    es: 'Si una página detecta el user-agent de Electron te puede bloquear. Eco usa Chrome 131 por defecto; si el sitio sigue fallando, probá DevTools (clic derecho) y revisá el log de red.',
    en: 'Some sites block Electron user-agents. Eco uses Chrome 131 by default; if it still fails, open DevTools (right click) and check the network log.',
  },
  'settings.about.tr.claude.p':      { es: 'Claude no responde o devuelve 401', en: 'Claude does not reply or returns 401' },
  'settings.about.tr.claude.s':      {
    es: 'Andá a Ajustes → Claude. Si usás CLI, verificá que estás logueado con `claude /login`. Si usás API key, pegala de nuevo (debe empezar con sk-ant-).',
    en: 'Go to Settings → Claude. If using CLI, confirm you are logged in via `claude /login`. If using API key, paste it again (must start with sk-ant-).',
  },
  'settings.about.tr.worktree.p':    { es: '"branch already used by worktree"', en: '"branch already used by worktree"' },
  'settings.about.tr.worktree.s':    {
    es: 'Eco detecta y limpia worktrees huérfanos bajo ~/.eco/worktrees/. Si es uno externo, corré `git worktree list` y `git worktree remove --force` desde el repo.',
    en: 'Eco detects and cleans orphan worktrees under ~/.eco/worktrees/. If external, run `git worktree list` and `git worktree remove --force` from the repo.',
  },
  'settings.about.tr.port.p':        { es: 'Eco no abre o dice "puerto en uso"', en: 'Eco does not open or says "port in use"' },
  'settings.about.tr.port.s':        {
    es: 'Eco usa el puerto 7100 cuando está empaquetado. Si otro proceso lo tiene, matalo con `lsof -ti :7100 | xargs kill -9`.',
    en: 'Eco uses port 7100 when packaged. If another process holds it, kill it with `lsof -ti :7100 | xargs kill -9`.',
  },
  'settings.about.tr.voice.p':       { es: 'La voz no me escucha', en: 'Voice cannot hear me' },
  'settings.about.tr.voice.s':       {
    es: 'Revisá permisos de micrófono en Preferencias del Sistema → Privacidad → Micrófono → Eco. En la app, mirá la onda en el dock — si no se mueve, el listener no está corriendo.',
    en: 'Check microphone permission in System Preferences → Privacy → Microphone → Eco. In the app, look at the dock waveform — if it does not move, the listener is not running.',
  },

  // Network
  'settings.about.network.title':    { es: 'Conexiones de red', en: 'Network connections' },
  'settings.about.net.anthropic':    { es: 'Único destino externo. Chat con Claude.', en: 'Only external destination. Chat with Claude.' },
  'settings.about.net.backend':      { es: 'Backend Node interno (loopback).', en: 'Internal Node backend (loopback).' },
  'settings.about.net.frontend':     { es: 'UI sirve desde el backend en la app empaquetada.', en: 'UI is served by the backend in the packaged app.' },
  'settings.about.net.webview':      { es: 'Navega como Chrome 131. Vos controlás dónde va.', en: 'Browses as Chrome 131. You control where it goes.' },
  'settings.about.net.whisper':      { es: 'STT en tu Mac. Sin red.', en: 'STT on your Mac. No network.' },
  'settings.about.net.piper':        { es: 'TTS en tu Mac. Sin red.', en: 'TTS on your Mac. No network.' },
  'settings.about.net.obsidian':     { es: 'Lectura/escritura del vault. Sin red.', en: 'Vault read/write. No network.' },

  // Files
  'settings.about.files.title':      { es: 'Archivos y rutas', en: 'Files & paths' },
  'settings.about.files.user':       { es: 'PIN + frase argon2id. chmod 600.', en: 'PIN + phrase argon2id. chmod 600.' },
  'settings.about.files.token':      { es: 'Token de sesión del backend local.', en: 'Local backend session token.' },
  'settings.about.files.apikey':     { es: 'API key de Anthropic encriptada. chmod 600.', en: 'Encrypted Anthropic API key. chmod 600.' },
  'settings.about.files.obsidian':   { es: 'Ruta del vault y preferencias de integración.', en: 'Vault path and integration prefs.' },
  'settings.about.files.worktrees':  { es: 'Copia aislada del repo por cada agente.', en: 'Isolated repo copy per agent.' },
  'settings.about.files.localstorage': { es: 'Temas, tabs, marcadores, historial de agentes.', en: 'Themes, tabs, bookmarks, agent history.' },

  // Dev
  'settings.about.dev.title':            { es: 'Modo desarrollador', en: 'Developer mode' },
  'settings.about.dev.env.title':        { es: 'Variables de entorno', en: 'Environment variables' },
  'settings.about.dev.env.host':         { es: 'Host del backend (default 127.0.0.1).', en: 'Backend host (default 127.0.0.1).' },
  'settings.about.dev.env.port':         { es: 'Puerto del backend (default 7000 dev, 7100 packaged).', en: 'Backend port (default 7000 dev, 7100 packaged).' },
  'settings.about.dev.env.workspaces':   { es: 'Workspaces permitidos, separados por dos puntos.', en: 'Allowed workspaces, colon-separated.' },
  'settings.about.dev.env.model':        { es: 'Modelo de Claude por defecto.', en: 'Default Claude model.' },
  'settings.about.dev.env.autoclaude':   { es: 'Auto-iniciar Claude CLI en PTY (1/0).', en: 'Auto-start Claude CLI in PTY (1/0).' },
  'settings.about.dev.env.clipath':      { es: 'Ruta explícita al binario claude.', en: 'Explicit path to claude binary.' },
  'settings.about.dev.scripts.title':    { es: 'Scripts útiles', en: 'Useful scripts' },
  'settings.about.dev.scripts.dev':      { es: 'Backend + Vite en modo desarrollo.', en: 'Backend + Vite in dev mode.' },
  'settings.about.dev.scripts.devapp':   { es: 'Backend + Vite + Electron en paralelo.', en: 'Backend + Vite + Electron in parallel.' },
  'settings.about.dev.scripts.distmac':  { es: 'Construye el .dmg para distribución.', en: 'Builds the .dmg for distribution.' },
  'settings.about.dev.scripts.typecheck':{ es: 'Verifica tipos TypeScript del frontend.', en: 'Runs TypeScript typecheck on the frontend.' },
  'settings.about.dev.scripts.listener': { es: 'Corre solo el wake-word listener.', en: 'Runs only the wake-word listener.' },

  // Support
  'settings.about.support.title':    { es: 'Soporte', en: 'Support' },
  'settings.about.support.intro':    {
    es: 'Eco es un proyecto personal de Aditum. No hay soporte 24/7 — pero acá hay formas de avanzar.',
    en: 'Eco is a personal Aditum project. There is no 24/7 support — but here is how to move forward.',
  },
  'settings.about.support.bug.t':    { es: 'Reportar un bug', en: 'Report a bug' },
  'settings.about.support.bug.b':    {
    es: 'Tomá captura del error, anotá los pasos para reproducirlo y guardalo en tu vault de Obsidian con /kb. Eco lee esas notas en futuras sesiones.',
    en: 'Take a screenshot, note the reproduction steps and save them to your Obsidian vault with /kb. Eco reads those notes in future sessions.',
  },
  'settings.about.support.logs.t':   { es: 'Logs y diagnóstico', en: 'Logs & diagnostics' },
  'settings.about.support.logs.b':   {
    es: 'Para ver logs en vivo, corré Eco desde Terminal así:',
    en: 'To view live logs, run Eco from Terminal like this:',
  },
  'settings.about.support.reset.t':  { es: 'Reset completo', en: 'Full reset' },
  'settings.about.support.reset.b':  {
    es: 'Si todo está roto, cerrá Eco y borrá ~/.eco/ y las claves "eco.*" del localStorage. La próxima vez te pedirá PIN y frase de nuevo.',
    en: 'If everything is broken, close Eco and delete ~/.eco/ plus the "eco.*" keys in localStorage. Next launch will ask for PIN and phrase again.',
  },

  // ─────────────────────────── Onboarding wizard
  'onboarding.back':   { es: 'Atrás', en: 'Back' },
  'onboarding.next':   { es: 'Siguiente', en: 'Next' },
  'onboarding.skip':   { es: 'Omitir', en: 'Skip' },
  'onboarding.start':  { es: 'Comenzar', en: 'Get started' },
  'onboarding.finish': { es: 'Ir a Eco', en: 'Open Eco' },

  'onboarding.welcome.title':       { es: 'Bienvenido a Eco', en: 'Welcome to Eco' },
  'onboarding.welcome.title_named': { es: 'Hola {name}, bienvenido a Eco', en: 'Hi {name}, welcome to Eco' },
  'onboarding.welcome.body': {
    es: 'Vamos a dejar todo listo en unos pocos pasos. Podés saltar cualquier paso y cambiarlo después en Ajustes.',
    en: 'Let us set everything up in a few short steps. You can skip any step and change it later in Settings.',
  },
  'onboarding.welcome.tag.fast':    { es: 'Rápido', en: 'Fast' },
  'onboarding.welcome.tag.private': { es: '100% local', en: '100% local' },
  'onboarding.welcome.tag.voice':   { es: 'Manejado por voz', en: 'Voice-first' },

  'onboarding.language.title': { es: 'Idioma', en: 'Language' },
  'onboarding.language.sub':   { es: 'Elegí el idioma de la interfaz. Lo cambiás cuando quieras.', en: 'Pick the UI language. You can change it any time.' },

  'onboarding.appearance.title':  { es: 'Apariencia', en: 'Appearance' },
  'onboarding.appearance.sub':    { es: 'Tema y color de acento.', en: 'Theme and accent color.' },
  'onboarding.appearance.dark':   { es: 'Oscuro', en: 'Dark' },
  'onboarding.appearance.light':  { es: 'Claro', en: 'Light' },
  'onboarding.appearance.system': { es: 'Sistema', en: 'System' },
  'onboarding.appearance.accent': { es: 'Acento', en: 'Accent' },

  'onboarding.claude.title':                { es: 'Conectar con Claude', en: 'Connect Claude' },
  'onboarding.claude.sub':                  { es: 'Eco necesita acceso a Claude. Usá tu CLI o una API key.', en: 'Eco needs access to Claude. Use your CLI or an API key.' },
  'onboarding.claude.cli.ok':               { es: 'Claude CLI listo', en: 'Claude CLI ready' },
  'onboarding.claude.cli.ok_body':          { es: 'Detectamos tu sesión local. No necesitás API key.', en: 'We detected your local session. No API key needed.' },
  'onboarding.claude.cli.no':               { es: 'Claude CLI no detectado', en: 'Claude CLI not detected' },
  'onboarding.claude.cli.installed_no_login': { es: 'CLI instalado pero sin login. Corré `claude /login` en una terminal o pegá una API key abajo.', en: 'CLI is installed but not logged in. Run `claude /login` in a terminal or paste an API key below.' },
  'onboarding.claude.cli.missing':          { es: 'Instalá Claude CLI (npm i -g @anthropic-ai/claude) o pegá una API key abajo.', en: 'Install Claude CLI (npm i -g @anthropic-ai/claude) or paste an API key below.' },
  'onboarding.claude.apikey.title':         { es: 'API key de Anthropic', en: 'Anthropic API key' },
  'onboarding.claude.apikey.sub':           { es: 'Se guarda local en ~/.eco/api-key con permisos 600. Nunca se sincroniza.', en: 'Stored locally in ~/.eco/api-key with 600 perms. Never synced.' },
  'onboarding.claude.apikey.save':          { es: 'Guardar', en: 'Save' },
  'onboarding.claude.apikey.replace':       { es: 'Cambiar', en: 'Replace' },

  'onboarding.folder.title':      { es: 'Carpeta de proyectos', en: 'Project folder' },
  'onboarding.folder.sub':        { es: 'Elegí dónde viven tus proyectos. Eco solo accede a las carpetas que autorizás.', en: 'Pick where your projects live. Eco only accesses folders you authorize.' },
  'onboarding.folder.pick_title': { es: 'Elegí una carpeta para Eco', en: 'Pick a folder for Eco' },
  'onboarding.folder.pick':       { es: 'Elegir carpeta…', en: 'Pick folder…' },
  'onboarding.folder.current':    { es: 'Carpetas autorizadas', en: 'Authorized folders' },
  'onboarding.folder.default':    { es: 'Predeterminada', en: 'Default' },
  'onboarding.folder.web_note':   { es: 'Configurá las carpetas en Ajustes → Carpetas (esta vista no tiene picker nativo fuera de Electron).', en: 'Configure folders in Settings → Folders (no native picker outside Electron).' },

  'onboarding.obsidian.title':         { es: 'Conectar Obsidian', en: 'Connect Obsidian' },
  'onboarding.obsidian.sub':           { es: 'Opcional. Eco lee tus MOC y guarda sesiones automáticamente en el vault.', en: 'Optional. Eco reads your MOCs and auto-saves sessions to the vault.' },
  'onboarding.obsidian.detected':      { es: 'Vaults detectados', en: 'Detected vaults' },
  'onboarding.obsidian.open':          { es: 'Abierto', en: 'Open' },
  'onboarding.obsidian.pick':          { es: 'Elegir carpeta del vault…', en: 'Pick vault folder…' },
  'onboarding.obsidian.pick_other':    { es: 'Elegir otra carpeta…', en: 'Pick a different folder…' },
  'onboarding.obsidian.none':          { es: 'Configurá la integración en Ajustes → Integraciones cuando estés en la app.', en: 'Configure the integration in Settings → Integrations once you are in the app.' },
  'onboarding.obsidian.connected':     { es: 'Obsidian conectado', en: 'Obsidian connected' },
  'onboarding.obsidian.disconnect':    { es: 'Desconectar', en: 'Disconnect' },
  'onboarding.obsidian.para_detected': { es: 'Estructura PARA detectada · {n} notas', en: 'PARA structure detected · {n} notes' },
  'onboarding.obsidian.error':         { es: 'No se pudo guardar la configuración. Revisá que la carpeta exista.', en: 'Could not save the configuration. Make sure the folder exists.' },
  'onboarding.obsidian.note':          { es: 'Eco usa la API local de Obsidian para leer notas y guardar sesiones bajo "Sessions/". Nunca se sube nada.', en: 'Eco uses the Obsidian local API to read notes and save sessions under "Sessions/". Nothing is uploaded.' },

  'onboarding.voice.title':              { es: 'Voz', en: 'Voice' },
  'onboarding.voice.sub':                { es: 'Eco puede escucharte y responderte. Todo corre local.', en: 'Eco can listen and reply. It all runs locally.' },
  'onboarding.voice.autostart.title':    { es: 'Escuchar al arrancar', en: 'Listen on launch' },
  'onboarding.voice.autostart.body':     { es: 'Activa el wake word "Hey Eco" cuando abrís la app.', en: 'Turns on the "Hey Eco" wake word when the app opens.' },
  'onboarding.voice.note':               { es: 'Vas a necesitar permitir el micrófono la primera vez. El audio nunca sale de tu Mac.', en: 'You will need to grant mic permission the first time. Audio never leaves your Mac.' },

  'onboarding.done.title':       { es: '¡Listo!', en: 'All set!' },
  'onboarding.done.body':        { es: 'Eco está configurado. Acá tenés algunos tips para arrancar.', en: 'Eco is configured. Here are a few tips to get going.' },
  'onboarding.done.tip.dashboard': { es: 'En el Dashboard tocá "Nuevo agente" y elegí la carpeta del proyecto.', en: 'On the Dashboard tap "New agent" and pick the project folder.' },
  'onboarding.done.tip.voice':     { es: 'Decí "Hey Eco" + comando. Probá "Eco abrir Aditum" o "Eco ayuda".', en: 'Say "Hey Eco" + a command. Try "Eco open Aditum" or "Eco help".' },
  'onboarding.done.tip.support':   { es: 'Si te trabás, mirá Ajustes → Acerca para FAQ, comandos y solución de problemas.', en: 'If you get stuck, check Settings → About for FAQ, commands and troubleshooting.' },

  // ─────────────────────────── Eco commands feedback
  'cmdhelp.open.example': { es: 'Eco abrir <nombre>', en: 'Eco open <name>' },
  'cmdhelp.open.desc': { es: 'Crea un nuevo agente con ese nombre', en: 'Creates a new agent with that name' },
  'cmdhelp.rename.example': { es: 'Eco renombrar <nombre>', en: 'Eco rename <name>' },
  'cmdhelp.rename.desc': { es: 'Cambia el título de el agente activo', en: 'Changes the active agent title' },
  'cmdhelp.close.example': { es: 'Eco cerrar', en: 'Eco close' },
  'cmdhelp.close.desc': { es: 'Cierra el agente activo', en: 'Closes the active agent' },
  'cmdhelp.goto.example': { es: 'Eco ir <nombre>', en: 'Eco go <name>' },
  'cmdhelp.goto.desc': { es: 'Va a el agente con ese nombre (fuzzy)', en: 'Goes to the agent with that name (fuzzy)' },
  'cmdhelp.nav.example': { es: 'Eco siguiente · Eco anterior', en: 'Eco next · Eco previous' },
  'cmdhelp.nav.desc': { es: 'Navega entre agentes', en: 'Navigate between agents' },
  'cmdhelp.dash.example': { es: 'Eco dashboard · inicio', en: 'Eco dashboard · home' },
  'cmdhelp.dash.desc': { es: 'Vuelve al dashboard', en: 'Back to dashboard' },
  'cmdhelp.sections.example': { es: 'Eco ajustes · archivos · historial', en: 'Eco settings · files · history' },
  'cmdhelp.sections.desc': { es: 'Navega a esas secciones', en: 'Navigate to those sections' },
  'cmdhelp.status.example': { es: 'Eco estado', en: 'Eco status' },
  'cmdhelp.status.desc': { es: 'Lista todas las agentes con su actividad', en: 'List all agents with their activity' },
  'cmdhelp.pause.example': { es: 'Eco pausar · continuar', en: 'Eco pause · continue' },
  'cmdhelp.pause.desc': { es: 'Pausa o reanuda el agente activo', en: 'Pause or resume the active agent' },
  'cmdhelp.voice.example': { es: 'Eco silencio · hablar', en: 'Eco silence · speak' },
  'cmdhelp.voice.desc': { es: 'Apaga o prende la voz', en: 'Turn voice off or on' },
  'cmdhelp.theme.example': { es: 'Eco claro · oscuro · sistema', en: 'Eco light · dark · system' },
  'cmdhelp.theme.desc': { es: 'Cambia el tema', en: 'Change theme' },
  'cmdhelp.help.example': { es: 'Eco ayuda', en: 'Eco help' },
  'cmdhelp.help.desc': { es: 'Muestra este panel', en: 'Shows this panel' },
  'cmdhelp.scroll.example': { es: 'Eco abajo · arriba · al final · al inicio', en: 'Eco down · up · to end · to start' },
  'cmdhelp.scroll.desc': { es: 'Hace scroll del panel activo', en: 'Scrolls the active panel' },
  'cmdhelp.tab.example': { es: 'Eco terminal · archivos · plan · chat', en: 'Eco terminal · files · plan · chat' },
  'cmdhelp.tab.desc': { es: 'Cambia de pestaña dentro de el agente', en: 'Switches tab inside the agent' },
  'cmdhelp.confirm.example': { es: 'Eco sí · no · acepta · cancela', en: 'Eco yes · no · accept · cancel' },
  'cmdhelp.confirm.desc': { es: 'Responde al diálogo de confirmación activo', en: 'Answers the active confirmation dialog' },
  'cmdhelp.repeat.example': { es: 'Eco repetir · leeme', en: 'Eco repeat · read it' },
  'cmdhelp.repeat.desc': { es: 'Re-lee el último mensaje del agente', en: 'Re-reads the last agent message' },
  'cmdhelp.tts.example': { es: 'Eco rápido · lento · normal · fuerte · bajo', en: 'Eco faster · slower · normal · louder · quieter' },
  'cmdhelp.tts.desc': { es: 'Ajusta velocidad o volumen de la voz', en: 'Adjusts voice rate or volume' },

  // Feedback de nuevos comandos
  'cmd.scroll': { es: 'Scroll', en: 'Scroll' },
  'cmd.scroll.up': { es: 'arriba', en: 'up' },
  'cmd.scroll.down': { es: 'abajo', en: 'down' },
  'cmd.scroll.top': { es: 'al inicio', en: 'to start' },
  'cmd.scroll.bottom': { es: 'al final', en: 'to end' },
  'cmd.switch_tab': { es: 'Pestaña', en: 'Tab' },
  'cmd.tab.chat': { es: 'Conversación', en: 'Conversation' },
  'cmd.tab.terminal': { es: 'Terminal', en: 'Terminal' },
  'cmd.tab.files': { es: 'Archivos', en: 'Files' },
  'cmd.tab.plan': { es: 'Plan', en: 'Plan' },
  'cmd.tab.browser': { es: 'Navegador', en: 'Browser' },
  'cmd.confirm_yes': { es: 'Sí, confirmado', en: 'Yes, confirmed' },
  'cmd.confirm_no': { es: 'Cancelado', en: 'Cancelled' },
  'cmd.repeat': { es: 'Releyendo último mensaje', en: 'Repeating last message' },
  'cmd.tts.faster': { es: 'Voz más rápida', en: 'Voice faster' },
  'cmd.tts.slower': { es: 'Voz más lenta', en: 'Voice slower' },
  'cmd.tts.normal': { es: 'Voz normal', en: 'Voice normal' },
  'cmd.tts.louder': { es: 'Voz más fuerte', en: 'Voice louder' },
  'cmd.tts.quieter': { es: 'Voz más baja', en: 'Voice quieter' },
  'cmd.server.start': { es: 'Iniciando servidor', en: 'Starting server' },
  'cmd.server.stop': { es: 'Deteniendo servidor', en: 'Stopping server' },
  'cmd.server.restart': { es: 'Reiniciando servidor', en: 'Restarting server' },
  'cmd.remote.on': { es: 'Activando remote control', en: 'Enabling remote control' },
  'cmd.remote.off': { es: 'Desactivando remote control', en: 'Disabling remote control' },
  'cmd.obsidian.save': { es: 'Guardando en Obsidian', en: 'Saving to Obsidian' },

  // Wake indicator
  'wake.listening': { es: 'Eco · escuchando comando…', en: 'Eco · listening for command…' },

  'cmd.unknown.title': { es: 'No entendí', en: 'I didn\'t understand' },
  'cmd.unknown.detail': { es: 'Decí "Eco ayuda"', en: 'Say "Eco help"' },
  'cmd.help.title': { es: 'Comandos disponibles', en: 'Available commands' },
  'cmd.dashboard': { es: 'Inicio', en: 'Home' },
  'cmd.settings': { es: 'Ajustes', en: 'Settings' },
  'cmd.files': { es: 'Archivos', en: 'Files' },
  'cmd.history': { es: 'Historial', en: 'History' },
  'cmd.new_bubble': { es: 'Nuevo agente', en: 'New agent' },
  'cmd.no_title': { es: 'Sin título', en: 'No title' },
  'cmd.bubble_created': { es: 'Agente creado', en: 'Agent created' },
  'cmd.renamed': { es: 'Renombrado', en: 'Renamed' },
  'cmd.closed': { es: 'Agente cerrado', en: 'Agent closed' },
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
