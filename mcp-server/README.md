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
