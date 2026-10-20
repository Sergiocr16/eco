// Mensajes del WebSocket `/ws`. Es un canal SOLO server → cliente: el tab de
// Conversación (que era el único que mandaba `prompt`/`interrupt`) se removió,
// y con él el Claude Agent SDK. Los agentes ahora viven en el PTY (`/ws/pty`).

// Acciones que el backend le pide al frontend. El productor es el MCP server
// externo vía los endpoints `/bubble/*`: el estado de las burbujas vive en
// Firestore a través del frontend, así que cerrar/renombrar/categorizar desde
// afuera se delega a la UI (que confirma vía /bubbles/sync). Se emiten SOLO a
// las conexiones del dueño (`broadcastClientActionToUser`).
export type ClientAction =
  | {
    kind: 'open_bubble';
    id: string;
    title: string;
    focus: boolean;
    workspace?: string;
    baseBranch?: string;
  }
  | { kind: 'archive_bubble'; id: string }
  | { kind: 'delete_bubble'; id: string }
  | { kind: 'rename_bubble'; id: string; title: string }
  | { kind: 'focus_bubble'; id: string }
  | { kind: 'set_bubble_categories'; id: string; categoryIds: string[] };

export type ServerMessage =
  | { type: 'client_action'; action: ClientAction }
  | { type: 'pty_status'; bubbleId: string; running: boolean; active?: boolean }
  // Notifica si el PTY está produciendo output o ya se quedó quieto (1.5 s sin
  // output → idle). Es POR BURBUJA, no por terminal: cualquier sesión (Claude,
  // Codex o un shell plano) la marca ocupada.
  | { type: 'pty_busy_change'; bubbleId: string; busy: boolean }
  | { type: 'dev_status'; bubbleId: string; role?: 'main' | 'frontend' | 'backend'; status: 'idle' | 'starting' | 'running' | 'stopped' | 'error'; port: number; url: string; command: string; exitCode: number | null; skill?: string }
  | { type: 'dev_log'; bubbleId: string; role: 'main' | 'frontend' | 'backend'; chunk: string }
  // Sync cross-device del estado del usuario (bubbles, categorías, notas, etc.).
  // El backend lo empuja a los OTROS dispositivos del mismo usuario cuando uno
  // guarda un doc. `key` es la clave del doc (p.ej. "bubble:b_1", "prefs").
  | { type: 'doc_updated'; key: string; value: unknown; updatedAt: number }
  | { type: 'doc_deleted'; key: string }
  // Señal de vida del server cada HEARTBEAT_MS. El cliente la usa para saber si
  // el socket sigue vivo sin depender de sus propios timers (Chromium los
  // estrangula en background).
  | { type: 'heartbeat' };
