export type EcoStatus = 'idle' | 'listening' | 'thinking' | 'executing' | 'speaking' | 'error';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'executing' | 'speaking';

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

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type BubbleStatus = 'idle' | 'pending' | 'running' | 'waiting' | 'paused' | 'done' | 'error' | 'thinking' | 'executing';

export type Bubble = {
  id: string;
  title: string;
  workspace: string;
  sessionId: string | null;
  messages: Message[];
  status: BubbleStatus;
  unread: number;
  accent: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  // True si hay un PTY (shell) abierto en el backend para esta burbuja. NO implica
  // que esté ejecutando un comando — el shell zsh queda vivo entre comandos.
  ptyOpen?: boolean;
};

export type BubbleAction =
  | { kind: 'open'; id: string; title: string; workspace?: string; focus?: boolean }
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'close'; id: string }
  | { kind: 'focus'; id: string };
