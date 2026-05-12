export type Lang = 'es' | 'en';

export const DEFAULT_LANG: Lang = 'es';

// Diccionario centralizado. Si una key no existe en el idioma activo,
// cae al español. Variables: usar {{name}} en el template.
const DICT = {
  // ─────────────────────────── Auth
  'auth.your_account': { es: 'tu cuenta', en: 'your account' },
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
  'settings.general.dock': { es: 'Dock de burbujas', en: 'Bubble dock' },
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
  'dash.bubble.name_label': { es: 'Nombre de la burbuja', en: 'Bubble name' },
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
  'rail.folders.tooltip_empty': { es: '{{p}} · sin burbujas', en: '{{p}} · no bubbles' },
  'rail.folders.tooltip_open': {
    es: '{{p}} · abrir burbuja más reciente',
    en: '{{p}} · open most recent bubble',
  },
  'wsp.chip.none': { es: 'sin carpeta', en: 'no folder' },
  'wsp.chip.assign': { es: 'Asignar carpeta', en: 'Assign folder' },
  'wsp.chip.empty_picker': {
    es: 'Sin workspaces. Agregalos en Ajustes → Carpetas.',
    en: 'No workspaces. Add them in Settings → Folders.',
  },
  'bubble.default_title': { es: 'Conversación {{n}}', en: 'Conversation {{n}}' },
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
  'detail.header.bubble': { es: 'Burbuja', en: 'Bubble' },
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

  // ─────────────────────────── Voice orb states
  'voice.idle.label': { es: 'En espera', en: 'Idle' },
  'voice.idle.sub': { es: 'Decí "Eco" o pulsá para hablar', en: 'Say "Eco" or click to talk' },
  'voice.listening.label': { es: 'Escuchando', en: 'Listening' },
  'voice.thinking.label': { es: 'Pensando', en: 'Thinking' },
  'voice.executing.label': { es: 'Ejecutando', en: 'Executing' },
  'voice.speaking.label': { es: 'Hablando', en: 'Speaking' },

  // ─────────────────────────── State labels
  'state.idle': { es: 'Inactivo', en: 'Idle' },
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

  // ─────────────────────────── Rail
  'rail.cli.label': { es: 'Claude CLI', en: 'Claude CLI' },
  'rail.cli.local': { es: 'local', en: 'local' },
  'rail.cli.model': { es: 'Modelo: {{model}}', en: 'Model: {{model}}' },

  // ─────────────────────────── Bubble menu
  'menu.rename': { es: 'Renombrar', en: 'Rename' },
  'menu.close_bubble': { es: 'Cerrar burbuja', en: 'Close bubble' },
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
    es: 'Mensajes de todas las burbujas, ordenados por fecha.',
    en: 'Messages from all bubbles, sorted by date.',
  },
  'history.empty': { es: 'Sin historial todavía.', en: 'No history yet.' },

  // ─────────────────────────── File Explorer
  'files.active_folders': { es: 'Carpetas activas', en: 'Active folders' },
  'files.no_folders': { es: 'Sin carpetas seleccionadas.', en: 'No folders selected.' },
  'files.no_folder_selected': { es: 'Sin carpeta seleccionada', en: 'No folder selected' },
  'files.recent_changes': { es: 'Cambios recientes en las burbujas', en: 'Recent changes in bubbles' },
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
    es: '{{total}} burbuja{{p}} · {{active}} activa{{ap}}',
    en: '{{total}} bubble{{p}} · {{active}} active',
  },
  'status.empty': { es: 'Sin burbujas todavía.', en: 'No bubbles yet.' },
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
    es: 'Controla cómo Eco te escucha y te responde.',
    en: 'Control how Eco listens and responds.',
  },
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
    es: 'Define qué acciones requieren confirmación explícita.',
    en: 'Define which actions require explicit confirmation.',
  },
  'settings.security.safe_mode': { es: 'Modo seguro global', en: 'Global safe mode' },
  'settings.security.safe_mode_desc': {
    es: 'Pide confirmación antes de cualquier modificación de archivos.',
    en: 'Asks for confirmation before any file modification.',
  },
  'settings.security.audit_log': { es: 'Registro de auditoría', en: 'Audit log' },
  'settings.security.audit_log_desc': {
    es: 'Guarda log permanente de cada acción ejecutada por agentes.',
    en: 'Permanent log of every action executed by agents.',
  },
  'settings.security.lock_inactivity': { es: 'Bloquear Eco tras inactividad', en: 'Lock Eco after inactivity' },
  'settings.security.delete_all': { es: 'Borrar todos los datos locales', en: 'Delete all local data' },
  'settings.security.delete_all_desc': {
    es: 'Elimina cuenta, agentes, historial y caché. No reversible.',
    en: 'Deletes account, agents, history and cache. Not reversible.',
  },
  'settings.security.delete_btn': { es: 'Borrar todo', en: 'Delete all' },
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
  'settings.appearance.theme.dark': { es: 'Oscuro', en: 'Dark' },
  'settings.appearance.theme.light': { es: 'Claro', en: 'Light' },
  'settings.appearance.theme.system': { es: 'Sistema', en: 'System' },
  'settings.appearance.accent': { es: 'Color de acento', en: 'Accent color' },

  // ─────────────────────────── Settings — About
  'settings.about.tagline': {
    es: 'Centro de control local para agentes de IA · v0.1',
    en: 'Local control center for AI agents · v0.1',
  },

  // ─────────────────────────── Eco commands feedback
  'cmdhelp.open.example': { es: 'Eco abrir <nombre>', en: 'Eco open <name>' },
  'cmdhelp.open.desc': { es: 'Crea una nueva burbuja con ese nombre', en: 'Creates a new bubble with that name' },
  'cmdhelp.rename.example': { es: 'Eco renombrar <nombre>', en: 'Eco rename <name>' },
  'cmdhelp.rename.desc': { es: 'Cambia el título de la burbuja activa', en: 'Changes the active bubble title' },
  'cmdhelp.close.example': { es: 'Eco cerrar', en: 'Eco close' },
  'cmdhelp.close.desc': { es: 'Cierra la burbuja activa', en: 'Closes the active bubble' },
  'cmdhelp.goto.example': { es: 'Eco ir <nombre>', en: 'Eco go <name>' },
  'cmdhelp.goto.desc': { es: 'Va a la burbuja con ese nombre (fuzzy)', en: 'Goes to the bubble with that name (fuzzy)' },
  'cmdhelp.nav.example': { es: 'Eco siguiente · Eco anterior', en: 'Eco next · Eco previous' },
  'cmdhelp.nav.desc': { es: 'Navega entre burbujas', en: 'Navigate between bubbles' },
  'cmdhelp.dash.example': { es: 'Eco dashboard · inicio', en: 'Eco dashboard · home' },
  'cmdhelp.dash.desc': { es: 'Vuelve al dashboard', en: 'Back to dashboard' },
  'cmdhelp.sections.example': { es: 'Eco ajustes · archivos · historial', en: 'Eco settings · files · history' },
  'cmdhelp.sections.desc': { es: 'Navega a esas secciones', en: 'Navigate to those sections' },
  'cmdhelp.status.example': { es: 'Eco estado', en: 'Eco status' },
  'cmdhelp.status.desc': { es: 'Lista todas las burbujas con su actividad', en: 'List all bubbles with their activity' },
  'cmdhelp.pause.example': { es: 'Eco pausar · continuar', en: 'Eco pause · continue' },
  'cmdhelp.pause.desc': { es: 'Pausa o reanuda la burbuja activa', en: 'Pause or resume the active bubble' },
  'cmdhelp.voice.example': { es: 'Eco silencio · hablar', en: 'Eco silence · speak' },
  'cmdhelp.voice.desc': { es: 'Apaga o prende la voz', en: 'Turn voice off or on' },
  'cmdhelp.theme.example': { es: 'Eco claro · oscuro · sistema', en: 'Eco light · dark · system' },
  'cmdhelp.theme.desc': { es: 'Cambia el tema', en: 'Change theme' },
  'cmdhelp.help.example': { es: 'Eco ayuda', en: 'Eco help' },
  'cmdhelp.help.desc': { es: 'Muestra este panel', en: 'Shows this panel' },
  'cmdhelp.scroll.example': { es: 'Eco abajo · arriba · al final · al inicio', en: 'Eco down · up · to end · to start' },
  'cmdhelp.scroll.desc': { es: 'Hace scroll del panel activo', en: 'Scrolls the active panel' },
  'cmdhelp.tab.example': { es: 'Eco terminal · archivos · plan · chat', en: 'Eco terminal · files · plan · chat' },
  'cmdhelp.tab.desc': { es: 'Cambia de pestaña dentro de la burbuja', en: 'Switches tab inside the bubble' },
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
  'cmd.confirm_yes': { es: 'Sí, confirmado', en: 'Yes, confirmed' },
  'cmd.confirm_no': { es: 'Cancelado', en: 'Cancelled' },
  'cmd.repeat': { es: 'Releyendo último mensaje', en: 'Repeating last message' },
  'cmd.tts.faster': { es: 'Voz más rápida', en: 'Voice faster' },
  'cmd.tts.slower': { es: 'Voz más lenta', en: 'Voice slower' },
  'cmd.tts.normal': { es: 'Voz normal', en: 'Voice normal' },
  'cmd.tts.louder': { es: 'Voz más fuerte', en: 'Voice louder' },
  'cmd.tts.quieter': { es: 'Voz más baja', en: 'Voice quieter' },

  // Wake indicator
  'wake.listening': { es: 'Eco · escuchando comando…', en: 'Eco · listening for command…' },

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
