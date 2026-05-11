import { z } from 'zod';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ClientAction } from './agent-tools.js';

export const PromptMessageSchema = z.object({
  type: z.literal('prompt'),
  text: z.string().min(1).max(50_000),
  workspace: z.string().max(4096).optional(),
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
  | { type: 'client_action'; action: ClientAction };
