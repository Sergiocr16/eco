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
  // Rama base desde la cual se creó el worktree de esta burbuja. Solo aplica
  // si el workspace es repo git. Sin valor → el worktree salió del HEAD del
  // repo padre al momento de crear la burbuja (comportamiento legacy).
  baseBranch?: string;
  // Categorías asignadas (ids de categorías configurables en Settings). Una
  // burbuja puede tener varias — se muestran como chips y la primera colorea
  // el nodo en la vista de grafo. Vacío/sin valor → color por estado (legacy).
  // El formato viejo single `categoryId` se migra en useBubbles.loadStored.
  categoryIds?: string[];
  // Dueño de la bubble (userId). Solo se setea para el grafo de equipo del
  // admin (bubbles de otros usuarios sintetizadas desde /admin/overview); en
  // el flujo normal las bubbles son del usuario logueado y va undefined.
  ownerId?: string;
  // Soft delete: cuando es true, la burbuja desaparece del Dashboard y
  // aparece en la pantalla "Archivados". El worktree git se mantiene
  // intacto en disco para permitir des-archivar con todo el state.
  // Eliminar definitivamente borra el worktree y limpia localStorage.
  archived?: boolean;
  archivedAt?: number;
};

export type BubbleAction =
  | { kind: 'open'; id: string; title: string; workspace?: string; focus?: boolean }
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'close'; id: string }
  | { kind: 'focus'; id: string };
