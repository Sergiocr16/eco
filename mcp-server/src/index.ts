#!/usr/bin/env node
// Entry-point del MCP server stdio para Eco. Lo lanza Claude Code cuando se
// registra con:
//
//   claude mcp add eco -- node /path/to/mcp-server/dist/index.js
//
// Las tools quedan disponibles en cualquier sesión de Claude Code como
// `mcp__eco__create_bubble` y `mcp__eco__list_bubbles`.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  CreateBubbleSchema,
  ListBubblesSchema,
  handleCreateBubble,
  handleListBubbles,
} from './tools.js';

const server = new Server(
  { name: 'eco', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_bubble',
      description:
        'Crea una bubble (agente) nueva en Eco con su worktree git aislado. ' +
        'Opcionalmente acepta un initial_prompt que el agente Claude interno ' +
        'de la bubble procesará apenas se monta — útil para arrancar la ' +
        'conversación con una tarea ya definida. ' +
        'Si no se pasa workspace, se autodetecta usando el cwd actual.',
      inputSchema: zodToJsonSchema(CreateBubbleSchema),
    },
    {
      name: 'list_bubbles',
      description:
        'Lista las bubbles activas en Eco (id, título, workspace, status). ' +
        'Requiere que Eco haya sincronizado al menos una vez desde que el ' +
        'backend arrancó.',
      inputSchema: zodToJsonSchema(ListBubblesSchema),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  if (name === 'create_bubble') {
    const parsed = CreateBubbleSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Argumentos inválidos: ${parsed.error.errors.map((e) => e.message).join('; ')}`,
          },
        ],
        isError: true,
      };
    }
    return handleCreateBubble(parsed.data);
  }
  if (name === 'list_bubbles') {
    return handleListBubbles();
  }
  return {
    content: [{ type: 'text', text: `Tool desconocida: ${name}` }],
    isError: true,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log a stderr (no stdout — stdout es el canal MCP) para que aparezca en
  // los logs de Claude Code sin romper el protocolo.
  process.stderr.write('[eco-mcp] listo (stdio)\n');
}

main().catch((err) => {
  process.stderr.write(`[eco-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
