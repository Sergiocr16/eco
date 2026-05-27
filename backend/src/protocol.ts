import { z } from 'zod';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ClientAction } from './agent-tools.js';

export const PromptMessageSchema = z.object({
  type: z.literal('prompt'),
  text: z.string().min(1).max(50_000),
  workspace: z.string().max(4096).optional(),
  bubbleId: z.string().max(128).optional(),
  resumeSessionId: z.string().max(128).optional(),
});

export const InterruptMessageSchema = z.object({
  type: z.literal('interrupt'),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  PromptMessageSchema,
  InterruptMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type ServerMessage =
  | { type: 'sdk_message'; message: SDKMessage }
  | { type: 'session_started'; sessionId: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string }
  | { type: 'client_action'; action: ClientAction }
  | { type: 'voice_transcribed'; text: string; ts: number }
  | { type: 'pty_status'; bubbleId: string; running: boolean; active?: boolean }
  // Notifica cambios en si Claude (en el PTY) está procesando output o ya
  // terminó. Basado en inactividad del PTY (1.5 s sin output → idle).
  | { type: 'pty_busy_change'; bubbleId: string; busy: boolean }
  | { type: 'dev_status'; bubbleId: string; role?: 'main' | 'frontend' | 'backend'; status: 'idle' | 'starting' | 'running' | 'stopped' | 'error'; port: number; url: string; command: string; exitCode: number | null; skill?: string }
  | { type: 'dev_log'; bubbleId: string; role: 'main' | 'frontend' | 'backend'; chunk: string }
  // Originado por el MCP server externo vía POST /bubble/create con
  // initialPrompt. El frontend lo escucha y dispara `sendTo(bubbleId, text)`
  // como si el user hubiese tipeado el mensaje. `workspace` es opcional —
  // si está, se usa para resumir/iniciar la sesión; si no, el frontend cae
  // al workspace de la bubble.
  | { type: 'inject_prompt'; bubbleId: string; text: string; workspace?: string };
