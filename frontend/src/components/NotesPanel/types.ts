// Tipos + helpers para la pestaña Notas. State per-bubble persistido en
// localStorage; se borra al cerrar el agente (cleanup en useBubbles).

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

export function genNoteId(): string {
  return `note_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function emptyState(): NotesState {
  return { notes: [], activeNoteId: null };
}

export function loadNotes(bubbleId: string): NotesState {
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
  try {
    localStorage.setItem(storageKey(bubbleId), JSON.stringify(state));
  } catch { /* localStorage lleno — no podemos hacer mucho */ }
}

// Sort por updatedAt desc, devolviendo una nueva array (immutable).
export function sortByUpdated(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}
