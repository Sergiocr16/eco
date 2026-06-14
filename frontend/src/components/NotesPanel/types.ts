// Tipos + helpers para la pestaña Notas. State per-bubble persistido en
// localStorage (cache) + sincronizado al servidor (doc `notes:<id>`) para
// cross-device. Se borra al cerrar el agente (cleanup en useBubbles).

import { saveDoc, shouldApplyRemote, type SyncDoc } from '@/lib/user-sync';
import { on as ecoOn } from '@/lib/eco-bus';

export type Note = {
  id: string;          // estable, usado como key React
  title: string;
  body: string;        // markdown source
  createdAt: number;
  updatedAt: number;
};

export type NotesState = {
  notes: Note[];       // ordenadas por updatedAt desc
  activeNoteId: string | null;
};

export const storageKey = (bubbleId: string) => `eco.notes.${bubbleId}`;
const DOC_KEY = (bubbleId: string) => `notes:${bubbleId}`;

// Cache sembrada desde el servidor al loguear (y por push WS). `loadNotes` la
// prefiere sobre localStorage → al abrir las notas de un bubble en otro
// dispositivo se ve la versión del servidor.
const serverCache = new Map<string, NotesState>();

function normalizeNotesValue(value: unknown): NotesState | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as { notes?: unknown; activeNoteId?: unknown };
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((n): n is Note =>
        !!n && typeof (n as Note).id === 'string'
        && typeof (n as Note).title === 'string'
        && typeof (n as Note).body === 'string'
        && typeof (n as Note).createdAt === 'number'
        && typeof (n as Note).updatedAt === 'number')
    : [];
  notes.sort((a, b) => b.updatedAt - a.updatedAt);
  const active = typeof parsed.activeNoteId === 'string' ? parsed.activeNoteId : null;
  const stillExists = active && notes.some((n) => n.id === active);
  return { notes, activeNoteId: stillExists ? active : (notes[0]?.id ?? null) };
}

/** Hidratación al loguear: siembra la cache desde los docs `notes:*`. */
export function hydrateNotesAll(docs: Record<string, SyncDoc>): void {
  for (const [key, doc] of Object.entries(docs)) {
    if (!key.startsWith('notes:')) continue;
    const ns = normalizeNotesValue(doc.value);
    if (ns) serverCache.set(key.slice('notes:'.length), ns);
  }
}

ecoOn('eco:doc_updated', ({ key, value, updatedAt }) => {
  if (!key.startsWith('notes:')) return;
  if (!shouldApplyRemote(key, updatedAt)) return;
  const ns = normalizeNotesValue(value);
  if (ns) serverCache.set(key.slice('notes:'.length), ns);
});

export function genNoteId(): string {
  return `note_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function emptyState(): NotesState {
  return { notes: [], activeNoteId: null };
}

export function loadNotes(bubbleId: string): NotesState {
  // Preferimos la versión del servidor (cross-device) si la hidratamos.
  const cached = serverCache.get(bubbleId);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(storageKey(bubbleId));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as { notes?: unknown; activeNoteId?: unknown };
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((n): n is Note =>
          !!n && typeof (n as Note).id === 'string'
          && typeof (n as Note).title === 'string'
          && typeof (n as Note).body === 'string'
          && typeof (n as Note).createdAt === 'number'
          && typeof (n as Note).updatedAt === 'number')
      : [];
    // Sort defensivo por updatedAt desc.
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    const active = typeof parsed.activeNoteId === 'string' ? parsed.activeNoteId : null;
    const stillExists = active && notes.some((n) => n.id === active);
    return {
      notes,
      activeNoteId: stillExists ? active : (notes[0]?.id ?? null),
    };
  } catch {
    return emptyState();
  }
}

export function persistNotes(bubbleId: string, state: NotesState): void {
  serverCache.set(bubbleId, state);
  try {
    localStorage.setItem(storageKey(bubbleId), JSON.stringify(state));
  } catch { /* localStorage lleno — no podemos hacer mucho */ }
  saveDoc(DOC_KEY(bubbleId), state); // sync cross-device
}

// Sort por updatedAt desc, devolviendo una nueva array (immutable).
export function sortByUpdated(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}
