// Modelo de datos en Firestore: colecciones tipadas + mapeo entre los tipos de
// la app (Bubble/Message/...) y los docs de Firestore. Firestore es la fuente
// de verdad (ver el plan de migración).
//
// Decisión clave: la bubble se PARTE en metadatos (doc liviano) + mensajes
// (subcolección paginada), para no chocar con el límite de 1 MB/doc y poder
// escuchar solo la lista de bubbles sin traer todo el historial.

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { getDb } from './firebase';
import type { Bubble, Message } from './types';

// --- Shapes en Firestore ---

export type UserDoc = {
  role: 'admin' | 'member';
  email: string;
  displayName: string;
  disabled: boolean;
  createdAt?: number;
  lastSeenAt?: number;
};

// Metadatos de la bubble (sin mensajes). ownerId obligatorio para las Rules.
export type BubbleDoc = {
  ownerId: string;
  title: string;
  workspace: string;
  sessionId: string | null;
  accent: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  baseBranch?: string;
  categoryIds?: string[];
  lastMsgPreview?: string;
  archived?: boolean;
  archivedAt?: number;
};

// Mensaje en la subcolección bubbles/{id}/messages. `seq` ordena (== createdAt).
export type MessageDoc = {
  ownerId: string;
  role: Message['role'];
  text: string;
  toolCalls?: Message['toolCalls'];
  createdAt: number;
  seq: number;
};

export type CategoryDoc = {
  ownerId: string;
  name: string;
  color: string;
  order: number;
  updatedAt: number;
};

export type NoteDoc = {
  ownerId: string;
  bubbleId: string;
  body: string;
  updatedAt: number;
};

export type ReviewDoc = {
  ownerId: string;
  bubbleId: string;
  // Mapa path → timestamp de aceptación (mismo formato que eco.review.accepted).
  accepted: Record<string, number>;
  updatedAt: number;
};

export type PrefsDoc = {
  themeMode?: string;
  accentHue?: number;
  lang?: string;
};

export type AuditEventDoc = {
  ownerId: string;
  actorName: string;
  type: string;
  ts: number;
  workspace?: string;
  bubbleId?: string;
  meta?: Record<string, unknown>;
};

// --- Referencias a colecciones/docs ---

export const cols = {
  users: () => collection(getDb(), 'users') as CollectionReference<UserDoc>,
  bubbles: () => collection(getDb(), 'bubbles') as CollectionReference<BubbleDoc>,
  messages: (bubbleId: string) =>
    collection(getDb(), 'bubbles', bubbleId, 'messages') as CollectionReference<MessageDoc>,
  categories: () => collection(getDb(), 'categories') as CollectionReference<CategoryDoc>,
  notes: () => collection(getDb(), 'notes') as CollectionReference<NoteDoc>,
  review: () => collection(getDb(), 'review') as CollectionReference<ReviewDoc>,
  auditLog: () => collection(getDb(), 'auditLog') as CollectionReference<AuditEventDoc>,
};

export const refs = {
  user: (uid: string) => doc(getDb(), 'users', uid) as DocumentReference<UserDoc>,
  bubble: (id: string) => doc(getDb(), 'bubbles', id) as DocumentReference<BubbleDoc>,
  message: (bubbleId: string, msgId: string) =>
    doc(getDb(), 'bubbles', bubbleId, 'messages', msgId) as DocumentReference<MessageDoc>,
  category: (id: string) => doc(getDb(), 'categories', id) as DocumentReference<CategoryDoc>,
  note: (id: string) => doc(getDb(), 'notes', id) as DocumentReference<NoteDoc>,
  review: (id: string) => doc(getDb(), 'review', id) as DocumentReference<ReviewDoc>,
  prefs: (uid: string) => doc(getDb(), 'prefs', uid) as DocumentReference<PrefsDoc>,
};

// --- Mapeo Bubble (app) <-> BubbleDoc (Firestore) ---

// Quita undefined: Firestore rechaza valores undefined en setDoc.
function clean<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function bubbleToDoc(b: Bubble, ownerId: string): BubbleDoc {
  return clean({
    ownerId,
    title: b.title,
    workspace: b.workspace,
    sessionId: b.sessionId,
    accent: b.accent,
    pinned: b.pinned,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    baseBranch: b.baseBranch,
    categoryIds: b.categoryIds,
    lastMsgPreview: b.lastMsgPreview,
    archived: b.archived,
    archivedAt: b.archivedAt,
  });
}

// Reconstruye una Bubble desde su doc. Los mensajes llegan aparte (subcolección):
// status/unread son runtime → defaults.
export function docToBubble(id: string, d: BubbleDoc, messages: Message[] = []): Bubble {
  return {
    id,
    title: d.title,
    workspace: d.workspace,
    sessionId: d.sessionId ?? null,
    messages,
    status: 'idle',
    unread: 0,
    accent: d.accent,
    pinned: !!d.pinned,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    baseBranch: d.baseBranch,
    categoryIds: d.categoryIds && d.categoryIds.length > 0 ? d.categoryIds : undefined,
    ownerId: d.ownerId,
    lastMsgPreview: d.lastMsgPreview,
    archived: d.archived,
    archivedAt: d.archivedAt,
  };
}

export function messageToDoc(m: Message, ownerId: string): MessageDoc {
  return clean({
    ownerId,
    role: m.role,
    text: m.text,
    toolCalls: m.toolCalls,
    createdAt: m.createdAt,
    seq: m.createdAt,
  });
}

export function docToMessage(id: string, d: MessageDoc): Message {
  return clean({
    id,
    role: d.role,
    text: d.text,
    toolCalls: d.toolCalls,
    createdAt: d.createdAt,
  }) as Message;
}
