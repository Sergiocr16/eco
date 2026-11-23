# @eco/mcp-server

MCP server stdio para crear, consultar y controlar bubbles (agentes) de Eco
desde Claude Code, Codex u otro cliente compatible con el
[Model Context Protocol](https://modelcontextprotocol.io/).

Todas las tools hablan con el backend local de Eco por HTTP usando el token de
máquina (`~/.eco/token`). El backend valida el id y el dueño de cada bubble; las
acciones que cambian estado (cerrar, renombrar, categorías) las aplica la UI de
Eco, así que requieren la app abierta.

## Tools

### Crear y listar

- **`create_bubble`** `{ title, workspace?, base_branch?, initial_prompt?, agent? }` —
  Crea una bubble con su worktree git aislado. Sin `workspace` se autodetecta
  desde el cwd. `initial_prompt` (multilínea OK) arranca al agente con una
  tarea. `agent` hereda el CLI del caller (Claude o Codex) si se omite.
- **`list_bubbles`** `{ workspace?, include_archived?, category? }` — Lista las
  bubbles con estado resumido (trabajando / quieta / offline / archivada),
  categorías y workspace.

### Estado y conversación

- **`get_bubble`** `{ bubble_id, output_lines?, include_transcript?, include_git?, agent? }` —
  Estado exacto: `working`, `waiting_input` (terminó su turno),
  `waiting_permission` (tool pendiente con el terminal quieto = prompt de
  permiso o pregunta), `idle`, `offline`, `archived`. Incluye el último mensaje
  del agente (leído del transcript de Claude Code), terminales, dev servers,
  git (rama, ahead/behind, archivos cambiados, último commit, PR) y la cola del
  terminal sin ANSI.
- **`read_bubble_conversation`** `{ bubble_id, last_turns?, include_tools?, max_chars?, agent? }` —
  Últimos N turnos (Usuario / Agente) desde el transcript de Claude Code,
  aunque el agente esté offline. Con `include_tools` lista cada tool usada con
  su input y resultado resumidos. Para Codex devuelve la cola del terminal.
- **`wait_for_bubble`** `{ bubble_id, timeout_s?=55, agent? }` — Espera a que
  el agente deje de trabajar (o hasta `timeout_s`, máx 600) y devuelve su
  estado y último mensaje. Si se vence, volvé a llamarla.

### Enviar input

- **`send_to_bubble`** `{ bubble_id, text, agent?, wait_s?=0 }` — Tipea un
  prompt (multilínea OK, viaja como bracketed paste = un solo mensaje) en el
  terminal del agente. Si el terminal no corría, lo arranca y espera a que el
  CLI esté listo. Confirma la entrega contra el transcript del agente
  (`delivered`): si un diálogo de Claude Code interceptó el prompt, devuelve
  la pantalla para resolverlo con `answer_bubble` y reenviar. Con `wait_s > 0`
  además espera la respuesta.
- **`answer_bubble`** `{ bubble_id, answer, agent? }` — Responde un prompt
  interactivo: teclas con nombre (`enter`, `esc`, `up`, `down`, `tab`,
  `ctrl_c`, `backspace`) o texto corto + Enter. En los permisos de Claude
  Code: `1` = sí, `2` = sí y no preguntar más, `3`/`esc` = no.
- **`interrupt_bubble`** `{ bubble_id, signal?='esc'|'ctrl_c', agent? }` —
  Cancela el turno del agente (Esc) o interrumpe el proceso (Ctrl+C).

### Gestión

- **`close_bubble`** `{ bubble_id, permanent?=false }` — Archiva (como el botón
  cerrar de Eco: mata terminal y dev servers, conserva worktree y rama). Con
  `permanent: true` elimina del todo.
- **`rename_bubble`** `{ bubble_id, title }`.
- **`focus_bubble`** `{ bubble_id }` — Abre la bubble en la ventana de Eco.
- **`set_bubble_category`** `{ bubble_id, category?, mode?='set'|'add'|'remove'|'clear' }` —
  Por nombre (sin distinguir mayúsculas/acentos) o id. Si no existe, falla
  listando las disponibles; las categorías se crean desde la UI.
- **`list_categories`** `{}`.

### Dev server y git

- **`dev_server`** `{ bubble_id, action: 'start'|'stop'|'restart'|'status', role? }` —
  Usa el comando que el admin configuró para el workspace (single o dual
  backend → frontend). Devuelve estado, URL y últimas líneas de log.
- **`get_bubble_diff`** `{ bubble_id, path?, max_bytes? }` — Diff del
  worktree contra HEAD (stat + diff + archivos nuevos) o de un archivo.

### Navegador de la bubble

Manejan el navegador que la bubble tiene en Eco (tab Navegador), el mismo que
el usuario ve. Las ejecuta el proceso principal de Electron con
`webContents.debugger` sobre el `<webview>`: no se abre ningún puerto de
depuración. Solo funcionan con Eco.app abierta (el modo web no tiene webviews).
Las operaciones de una misma bubble se ejecutan de a una.

Los elementos se apuntan con `ref` (de `browser_snapshot`), `selector` CSS o
`text` visible. Todas las respuestas traen un `cursor`: pasalo como `since` a
`browser_console` / `browser_network` para ver solo lo que generó una acción.

El navegador que se maneja es **siempre el de la app de escritorio**. Un cliente
remoto (iPad / web por la tailnet) ve esa misma pestaña en vivo por el espejo
del tab Navegador y puede tocarla y escribir en ella. `browser_open`,
`browser_tabs` y `browser_tab_*` dicen en su respuesta qué vista se maneja y
cuántos clientes remotos la están mirando.

- **`browser_open`** `{ bubble_id, url?, tab_id? }` — Muestra el navegador de la
  bubble (abre la bubble y su tab) y navega a `url` esperando la carga. Lista
  las pestañas con sus ids.
- **`browser_tabs`** `{ bubble_id }` — Pestañas (id, URL, título, activa) y vista.
- **`browser_tab_new`** `{ bubble_id, url?, isolated? }` — Pestaña nueva, activa y
  visible en la barra de pestañas; `isolated` = sesión limpia (otro usuario).
- **`browser_tab_select`** / **`browser_tab_close`** `{ bubble_id, tab_id }`.
- **`browser_navigate`** `{ bubble_id, url?, action?: 'go'|'back'|'forward'|'reload', hard?, wait?, timeout_s? }`.
- **`browser_snapshot`** `{ bubble_id, scope?, include_hidden?, max? }` — Controles
  visibles con refs estables (`[e12] button "Guardar" (deshabilitado)`), títulos,
  alertas y diálogos. Entiende Angular Material (`md-button`, `md-select`, …).
- **`browser_get_text`** `{ bubble_id, scope?, max_chars? }` — `innerText`.
- **`browser_click`** `{ bubble_id, ref|selector|text|x+y, double?, button?, modifiers? }` —
  Clic real (`Input.dispatchMouseEvent`); avisa si otro elemento tapa el punto.
- **`browser_type`** `{ bubble_id, value, ref|selector|text?, clear?, submit?, slowly? }` —
  Texto real vía `webContents.insertText` (dispara `input`); `slowly` tecla por tecla.
- **`browser_press`** `{ bubble_id, key, times?, ref|selector|text? }` — `"Enter"`, `"Shift+Tab"`, …
- **`browser_select`** `{ bubble_id, value, ref|selector|text }` — Solo `<select>` nativo.
- **`browser_wait_for`** `{ bubble_id, text?|selector?|ref?|expression?, gone?, network_idle?, timeout_s? }`.
- **`browser_eval`** `{ bubble_id, expression }` — JS en la página, resultado como JSON.
- **`browser_screenshot`** `{ bubble_id, ref|selector|text?, full_page?, format?, save_to?, return_image? }` —
  Devuelve la imagen; con `save_to` (ruta absoluta) además la guarda.
- **`browser_console`** `{ bubble_id, since?, level?, pattern?, limit? }` — `console.*`,
  excepciones y errores del navegador.
- **`browser_network`** `{ bubble_id, since?, url_pattern?, method?, only_errors?, only_api?, limit?, request_id? }` —
  Con `request_id`, cuerpos del request y de la respuesta.

## Instalación

Desde Eco: Settings → Integraciones → **MCP Server (Claude Code)** → Instalar.
La app empaquetada además lo registra sola al arrancar.

Manual:

```bash
cd mcp-server
npm install
npm run build
claude mcp add eco -s user -- node /ruta/al/repo/eco/mcp-server/dist/index.js
```

Para Codex (necesita el marcador para que las bubbles nazcan en Codex):

```bash
codex mcp add eco --env ECO_MCP_AGENT=codex -- node /ruta/al/repo/eco/mcp-server/dist/index.js
```

Reiniciá Claude Code: las tools aparecen como `mcp__eco__<nombre>`.

## Requisitos

- **Eco corriendo**: el server hace HTTP contra el backend de Eco en
  `127.0.0.1:{7100,7050,7000}` (override: `ECO_BACKEND_URL`).
- **Token de Eco** en `~/.eco/token` (se genera al abrir Eco).
- **Eco abierto (UI)** para crear, cerrar, renombrar, enfocar o categorizar:
  esas acciones las materializa el frontend (el estado vive en Firestore) y el
  backend las confirma con el siguiente sync. Sin UI → `eco.no_clients`.

## Variables de entorno

- `ECO_BACKEND_URL` — URL del backend (default: autodetect).
- `ECO_MCP_AGENT` — `claude` | `codex`: CLI por defecto de las bubbles creadas.

## Ejemplo

> Creá un agente "Tickets soporte" que liste los issues abiertos, esperá a que
> termine y decime qué encontró.

```json
{ "name": "mcp__eco__create_bubble", "arguments": { "title": "Tickets soporte", "initial_prompt": "Listá los issues abiertos del repo con gh y resumí los 5 más urgentes." } }
{ "name": "mcp__eco__wait_for_bubble", "arguments": { "bubble_id": "b_…", "timeout_s": 120 } }
```
