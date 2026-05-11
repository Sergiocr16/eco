export type EcoStatus = 'idle' | 'listening' | 'thinking' | 'executing' | 'speaking' | 'error';

export type ChatRole = 'user' | 'assistant';

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'success' | 'denied' | 'error';
  output?: string;
};

export type Message = {
  id: string;
  role: ChatRole;
  text: string;
  toolCalls?: ToolCall[];
  createdAt: number;
};

export type Workspace = {
  path: string;
  label: string;
};
