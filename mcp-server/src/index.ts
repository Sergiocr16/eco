#!/usr/bin/env node
// Entry-point del MCP server stdio para Eco. Lo lanza Claude Code cuando se
// registra con:
//
//   claude mcp add eco -- node /path/to/mcp-server/dist/index.js
//
// Las tools quedan disponibles en cualquier sesión de Claude Code como
// `mcp__eco__<nombre>` (ver TOOLS en tools.ts).

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOLS } from './tools.js';

// Instrucciones que el cliente MCP (Claude Code / Codex) le muestra al modelo
// junto con las tools: el "manual de uso" vive acá para que cualquier sesión
// sepa qué puede hacer con Eco sin leer el repo.
const INSTRUCTIONS = `Eco orquesta agentes de Claude Code / Codex en "bubbles": cada bubble tiene su worktree git, su terminal (PTY) con el CLI del agente, dev server, browser y notas. Estas tools te dejan crear, dirigir, observar y cerrar bubbles desde acá.

FLUJO TÍPICO
1. list_bubbles → ids, estado resumido, categorías y workspace. Los ids (b_...) salen de acá.
2. create_bubble { title, workspace?, initial_prompt? } → nueva bubble con worktree propio; con initial_prompt el agente arranca a trabajar solo.
3. send_to_bubble { bubble_id, text, wait_s? } → le das instrucciones al agente (multilínea OK, llega como un solo mensaje). Confirma la entrega; con wait_s espera la respuesta.
4. wait_for_bubble / get_bubble → esperás a que termine y leés su último mensaje, estado exacto, terminales, dev servers y git.
5. read_bubble_conversation → los últimos turnos completos de la conversación (funciona aunque el agente esté offline).
6. close_bubble → archiva (default) o elimina (permanent: true).

ESTADOS de get_bubble/wait_for_bubble: working (terminal produciendo output) · waiting_input (terminó su turno, espera instrucciones) · waiting_permission (tool pendiente con el terminal quieto = prompt de permiso o pregunta → answer_bubble) · idle (quieto, sin transcript) · offline (sin terminal; send_to_bubble lo arranca) · archived.

REGLAS
- Si send_to_bubble devuelve "NO registró el prompt", un diálogo de Claude Code lo interceptó: mirá el terminal que te devuelve, resolvelo con answer_bubble ("enter"/"esc"/"1"...) y reenviá.
- wait_for_bubble vence a los timeout_s (default 55, máx 600): si dice que venció, volvé a llamarla; no asumas que terminó.
- interrupt_bubble corta el turno (esc) o el proceso (ctrl_c). answer_bubble responde prompts interactivos.
- Las categorías se crean desde la UI de Eco; set_bubble_category solo asigna existentes (nombre sin distinguir mayúsculas/acentos, o id). list_categories las lista.
- rename_bubble, focus_bubble, set_bubble_category, close_bubble y create_bubble las aplica la UI de Eco: necesitan la app abierta (error eco.no_clients si no).
- dev_server usa el comando que el admin configuró para el workspace; get_bubble_diff muestra el diff del worktree o de un archivo.
- Nunca cierres ni mandes input a bubbles que no te pidieron tocar: para experimentos creá una bubble nueva.`;

const server = new Server(
  { name: 'eco', version: '1.1.0' },
  { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
);

const byName = new Map(TOOLS.map((t) => [t.name, t]));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const tool = byName.get(name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Tool desconocida: ${name}` }],
      isError: true,
    };
  }
  return tool.run(rawArgs);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log a stderr (no stdout — stdout es el canal MCP) para que aparezca en
  // los logs de Claude Code sin romper el protocolo.
  process.stderr.write(`[eco-mcp] listo (stdio) — ${TOOLS.length} tools\n`);
}

main().catch((err) => {
  process.stderr.write(`[eco-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
