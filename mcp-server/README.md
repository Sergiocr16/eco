# @eco/mcp-server

MCP server stdio para crear bubbles (agentes) en Eco desde Claude Code u
otro cliente compatible con el [Model Context Protocol](https://modelcontextprotocol.io/).

## Tools expuestas

### `create_bubble`

Crea una bubble nueva en Eco con su worktree git aislado.

**Argumentos**:
- `title` (string, requerido) — Título corto del agente (3-6 palabras).
- `workspace` (string, opcional) — Path absoluto del workspace. Si se omite,
  el server detecta automáticamente el cwd con el que arrancó Claude Code y
  busca un workspace permitido de Eco que lo contenga.
- `base_branch` (string, opcional) — Rama git base. Default: HEAD del workspace.
- `initial_prompt` (string, opcional) — Mensaje que el agente Claude interno
  de la bubble procesará automáticamente al crearse.

### `list_bubbles`

Devuelve las bubbles activas en Eco (id, título, workspace, status). Requiere
que el frontend de Eco haya sincronizado al menos una vez desde que el
backend arrancó.

## Instalación

```bash
cd mcp-server
npm install
npm run build
```

Luego registralo con Claude Code:

```bash
claude mcp add eco -- node /home/pi/projects/eco/mcp-server/dist/index.js
```

Esto agrega el server a `~/.claude.json`. Reiniciá Claude Code y las tools
quedan disponibles como `mcp__eco__create_bubble` y `mcp__eco__list_bubbles`.

## Requisitos

- **Eco corriendo**: el server hace POST contra el backend de Eco. Si el
  backend no responde en `127.0.0.1:{7100,7050,7000}` devuelve error.
- **Token de Eco**: leído desde `~/.eco/token`. Abrí Eco al menos una vez
  para que se genere.
- **Eco abierto (UI)**: la creación visual de la bubble pasa por el frontend
  via WS. Sin Eco abierto, el endpoint devuelve `eco.no_clients`.

## Variables de entorno

- `ECO_BACKEND_URL` — Override de la URL del backend (default: autodetect).

## Ejemplo de uso

Desde Claude Code, dentro de un workspace que esté en la whitelist de Eco:

> Crea un agente en Eco llamado "Tickets soporte" y arrancalo pidiendo que
> liste los issues abiertos del repo.

Claude invoca:

```json
{
  "name": "mcp__eco__create_bubble",
  "arguments": {
    "title": "Tickets soporte",
    "initial_prompt": "Listá los issues abiertos del repo usando gh y resumime los 5 más urgentes."
  }
}
```

El server detecta el workspace por cwd, crea la bubble con un worktree
nuevo, y dispara el prompt inicial. Aparece en Eco trabajando sola.
