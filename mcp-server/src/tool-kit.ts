// Piezas compartidas por las tools MCP (tools.ts y browser-tools.ts): tipos del
// resultado, validación de argumentos con zod y traducción de errores del backend.

import { z } from 'zod';
import type { EcoApiError } from './client.js';

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export type ToolResult = { content: ToolContent[]; isError?: boolean };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (rawArgs: unknown) => Promise<ToolResult>;
};

export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  schema: S,
  handler: (args: z.output<S>) => Promise<ToolResult>,
): ToolDef {
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(schema) as Record<string, unknown>,
    run: async (rawArgs: unknown) => {
      const parsed = schema.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        return errorResult(`Argumentos inválidos: ${parsed.error.issues.map((e) => `${e.path.join('.') || '?'}: ${e.message}`).join('; ')}`);
      }
      try {
        return await handler(parsed.data);
      } catch (e) {
        return errorResult(friendlyError(e));
      }
    },
  };
}

export function isApiError(e: unknown): e is EcoApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}

export function friendlyError(e: unknown): string {
  if (isApiError(e)) {
    switch (e.code) {
      case 'eco.no_clients':
        return 'Eco no está abierto (o el dueño de la bubble no tiene la UI abierta). Abrí la app y volvé a intentar.';
      case 'workspace.not_allowed':
        return 'Workspace no está en la whitelist de Eco. Agregalo desde Ajustes → Carpetas.';
      case 'bubble.not_found':
        // El backend agrega al mensaje si el snapshot está congelado (sync rechazado).
        return `${e.message} Usá list_bubbles para ver las activas.`;
      case 'bubble.invalid_id':
        return 'El bubble_id no tiene el formato esperado (b_xxx). Usá list_bubbles para copiar uno válido.';
      case 'bubble.not_owner':
        return 'Esa bubble pertenece a otro usuario de Eco; no se puede operar desde acá.';
      case 'bubble.archived':
        return 'Esa bubble está archivada. Desarchivala en Eco antes de mandarle input.';
      case 'eco.not_synced':
        return 'Eco no sincronizó bubbles todavía. Abrí la app al menos una vez.';
      case 'pty.not_running':
        return 'El terminal del agente de esa bubble no está corriendo. Mandale un prompt con send_to_bubble (lo arranca) o abrí la bubble en Eco.';
      case 'dev.not_configured':
        return 'El workspace no tiene comando de dev server configurado. Lo define el admin en Ajustes → Carpetas.';
      case 'dev.no_workspace':
        return 'La bubble no tiene workspace, así que no tiene dev server ni git.';
      case 'category.not_found':
      case 'category.ambiguous':
        return e.message;
      case 'browser.unavailable':
        return 'El navegador de Eco solo se controla con la app de escritorio (Eco.app) abierta: el modo web no tiene webviews.';
      case 'browser.hidden':
        return 'El navegador de esa bubble está oculto en Eco (hay otra bubble o pestaña a la vista). Llamá browser_open { bubble_id } para mostrarlo y reintentá.';
      default:
        if (e.code.startsWith('browser.')) return `${e.message} (${e.code})`;
        return `Error de Eco (${e.code}): ${e.message}`;
    }
  }
  return `Error: ${e instanceof Error ? e.message : String(e)}`;
}

export const BubbleId = z.string().min(1).max(128).describe('Id de la bubble (sale de list_bubbles o de create_bubble).');
