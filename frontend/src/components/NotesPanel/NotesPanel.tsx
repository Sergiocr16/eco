import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { createPortal } from 'react-dom';
import { Btn, IconBtn } from '@/design/primitives';
import { IconFileText, IconPlus, IconTrash, IconX } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { translateBackendError } from '@/lib/backend-errors';
import { ResizableSplit } from '@/components/GitPanel/ResizableSplit';
import { NotesList } from './NotesList';
import { NoteEditor } from './NoteEditor';
import {
  type Note, type NotesState,
  loadNotes, persistNotes, genNoteId, sortByUpdated,
} from './types';
import type { Bubble, Message } from '@/lib/types';

type Props = {
  bubble: Bubble;
};

const SPLIT_KEY = (id: string) => `eco.notes.splitter.${id}`;
const PREVIEW_KEY = (id: string) => `eco.notes.preview.${id}`;

export function NotesPanel({ bubble }: Props) {
  const t = useTokens();
  const tr = useT();
  const bubbleId = bubble.id;

  const [state, setState] = useState<NotesState>(() => loadNotes(bubbleId));
  const [showPreview, setShowPreview] = useState<boolean>(() => {
    try { return localStorage.getItem(PREVIEW_KEY(bubbleId)) === '1'; } catch { return false; }
  });
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Auto-save debounced. Flush sincrónico al unmount para no perder cambios
  // rápidos al cambiar de tab.
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const id = window.setTimeout(() => persistNotes(bubbleId, state), 400);
    return () => window.clearTimeout(id);
  }, [state, bubbleId]);
  useEffect(() => {
    return () => { persistNotes(bubbleId, stateRef.current); };
  }, [bubbleId]);

  useEffect(() => {
    try { localStorage.setItem(PREVIEW_KEY(bubbleId), showPreview ? '1' : '0'); } catch { /* noop */ }
  }, [showPreview, bubbleId]);

  // ─── Acciones ───────────────────────────────────────────────────────────

  const addNote = useCallback((seed?: Partial<Note>): string => {
    const id = genNoteId();
    const now = Date.now();
    const note: Note = {
      id,
      title: seed?.title ?? '',
      body: seed?.body ?? '',
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({
      notes: sortByUpdated([note, ...prev.notes]),
      activeNoteId: id,
    }));
    return id;
  }, []);

  const updateNote = useCallback((id: string, patch: Partial<Pick<Note, 'title' | 'body'>>) => {
    setState((prev) => {
      const updated = prev.notes.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
      );
      return { ...prev, notes: sortByUpdated(updated) };
    });
  }, []);

  const deleteNote = useCallback((id: string) => {
    setState((prev) => {
      const idx = prev.notes.findIndex((n) => n.id === id);
      if (idx < 0) return prev;
      const next = prev.notes.filter((n) => n.id !== id);
      const nextActive = prev.activeNoteId === id
        ? (next[Math.min(idx, next.length - 1)]?.id ?? null)
        : prev.activeNoteId;
      return { notes: next, activeNoteId: nextActive };
    });
  }, []);

  const activate = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeNoteId: id }));
  }, []);

  const askDelete = useCallback((id: string) => setConfirmDeleteId(id), []);
  const confirmDelete = useCallback(() => {
    if (confirmDeleteId) deleteNote(confirmDeleteId);
    setConfirmDeleteId(null);
  }, [confirmDeleteId, deleteNote]);

  // ─── Resumen con claude -p ──────────────────────────────────────────────

  const messages = bubble.messages;
  // El botón siempre está habilitado — la fuente principal es el PTY de la
  // bubble, que el backend lee directo. Solo deshabilitamos durante la
  // request en vuelo. Si no hay PTY ni chat, el backend devuelve error.
  const canSummarize = true;

  const summarize = useCallback(async () => {
    if (summarizing) return;
    // Mantener la signature original aunque ya no chequeamos hasMessages.
    void canSummarize;
    setSummarizing(true);
    setSummaryError(null);
    try {
      // Mandamos chat slimmed como contexto opcional. El PTY lo lee el
      // backend directo del ring buffer (no podemos pasarlo desde el front).
      const slim = messages.slice(-30).map((m: Message) => ({
        role: m.role,
        text: (m.text ?? '').slice(0, 2000),
        ts: m.createdAt,
      }));
      const r = await apiFetch('/notes/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bubbleId: bubble.id,
          bubbleTitle: bubble.title,
          workspace: bubble.workspace,
          messages: slim,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        setSummaryError(translateBackendError(body, tr('berr.notes.summarize_failed')));
        return;
      }
      const data = await r.json() as { ok: boolean; markdown?: string; error?: string };
      if (!data.ok || !data.markdown) {
        setSummaryError(tr('berr.notes.summarize_failed'));
        return;
      }
      const date = new Date();
      const stamp = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      addNote({
        title: tr('notes.summary_title_template', { date: stamp }),
        body: data.markdown,
      });
    } catch {
      setSummaryError(tr('berr.notes.summarize_failed'));
    } finally {
      setSummarizing(false);
    }
  }, [summarizing, canSummarize, messages, bubble.id, bubble.title, bubble.workspace, addNote, tr]);

  // Auto-clear error después de unos segundos.
  useEffect(() => {
    if (!summaryError) return;
    const id = window.setTimeout(() => setSummaryError(null), 4000);
    return () => window.clearTimeout(id);
  }, [summaryError]);

  const activeNote = useMemo(
    () => state.notes.find((n) => n.id === state.activeNoteId) ?? null,
    [state.notes, state.activeNoteId],
  );

  return (
    <ResizableSplit
      storageKey={SPLIT_KEY(bubbleId)}
      defaultLeft={260}
      minLeft={200}
      maxLeftPercent={0.5}
      mobileShow={state.activeNoteId ? 'right' : 'left'}
      mobileLeftLabel={tr('notes.mobile.list')}
      mobileRightLabel={tr('notes.mobile.editor')}
      left={(
        <NotesList
          notes={state.notes}
          activeNoteId={state.activeNoteId}
          query={query}
          onQueryChange={setQuery}
          onActivate={activate}
          onDelete={askDelete}
          onCreate={() => addNote()}
          onSummarize={summarize}
          canSummarize={canSummarize}
          summarizing={summarizing}
        />
      )}
      right={(
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, position: 'relative' }}>
          {activeNote ? (
            <NoteEditor
              note={activeNote}
              showPreview={showPreview}
              onTitleChange={(title) => updateNote(activeNote.id, { title })}
              onBodyChange={(body) => updateNote(activeNote.id, { body })}
              onTogglePreview={() => setShowPreview((v) => !v)}
              onDelete={() => askDelete(activeNote.id)}
            />
          ) : (
            <EmptyState onCreate={() => addNote()}/>
          )}
          {summaryError && (
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              padding: '8px 16px', borderRadius: 14,
              background: t.bg, border: `1px solid ${t.line2}`,
              color: t.err, fontSize: 13, fontFamily: t.fontSans,
              boxShadow: t.shadowMd, zIndex: 10,
            }}>
              {summaryError}
            </div>
          )}
          {confirmDeleteId && (
            <DeleteConfirmDialog
              onCancel={() => setConfirmDeleteId(null)}
              onConfirm={confirmDelete}
            />
          )}
        </div>
      )}
    />
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const tr = useT();
  return (
    <div className="eco-empty" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 24,
    }}>
      <div className="eco-tile eco-tile--lg" style={{ width: 52, height: 52, borderRadius: 16 }}>
        <IconFileText size={22}/>
      </div>
      <div className="eco-h3">
        {tr('notes.empty_title')}
      </div>
      <div className="eco-sub" style={{ maxWidth: 320 }}>
        {tr('notes.empty_desc')}
      </div>
      <Btn kind="primary" icon={IconPlus} onClick={onCreate} style={{ marginTop: 4 }}>
        {tr('notes.empty_cta')}
      </Btn>
    </div>
  );
}

function DeleteConfirmDialog({ onCancel, onConfirm }: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tr = useT();
  // Portal: un ancestro con transform atraparía el `position: fixed` del velo.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      className="eco-scrim"
    >
      <div className="eco-dialog eco-dialog--sm eco-dialog--danger">
        <div className="eco-dialog__head">
          <div className="eco-dialog__tile eco-dialog__tile--danger"><IconTrash size={18}/></div>
          <h2 className="eco-dialog__title">{tr('notes.delete_confirm_title')}</h2>
          <IconBtn icon={IconX} title={tr('common.close')} onClick={onCancel}/>
        </div>
        <p className="eco-dialog__body">{tr('notes.delete_confirm_body')}</p>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--danger-solid" onClick={onConfirm}>{tr('notes.delete')}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
