import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { useTokens, useTheme } from '@/design/theme';
import { isLightTheme } from '@/design/tokens';
import { useT } from '@/hooks/useI18n';
import { IconX } from '@/design/icons';
import { baseExtensions } from '@/components/FilesPanel/cm-extensions';
import { MarkdownPreview } from './MarkdownPreview';
import type { Note } from './types';

type Props = {
  note: Note;
  showPreview: boolean;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
  onTogglePreview: () => void;
  onDelete: () => void;
};

export function NoteEditor({
  note, showPreview, onTitleChange, onBodyChange, onTogglePreview, onDelete,
}: Props) {
  const t = useTokens();
  const { effectiveMode } = useTheme();
  const isLight = isLightTheme(effectiveMode);
  const tr = useT();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef<Compartment>(new Compartment());
  // Callbacks frescos sin recrear el editor.
  const cbRef = useRef({ onBodyChange });
  useEffect(() => { cbRef.current = { onBodyChange }; }, [onBodyChange]);

  // Mount UNA VEZ; sincronizamos doc cuando cambia el note activo.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: note.body,
        extensions: [
          markdown(),
          themeCompartmentRef.current.of(baseExtensions({
            readOnly: false,
            tokens: t,
            isLight,
            onSave: () => { /* auto-save afuera */ },
            onChange: (doc) => cbRef.current.onBodyChange(doc),
            onSelectionChange: () => { /* no-op */ },
          })),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync doc cuando el note activo cambia (no por cada keystroke local — eso
  // viene del editor mismo). Comparamos contra el doc current para evitar
  // sobrescribir mientras el user tipea.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== note.body) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: note.body },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Sync theme cuando cambia el tokenset.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(baseExtensions({
        readOnly: false,
        tokens: t,
        isLight,
        onSave: () => { /* no-op */ },
        onChange: (doc) => cbRef.current.onBodyChange(doc),
        onSelectionChange: () => { /* no-op */ },
      })),
    });
  }, [t, isLight]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0,
      background: t.bg0,
    }}>
      {/* Header: título input + toggle preview + delete */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg1,
      }}>
        <input
          value={note.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={tr('notes.title_placeholder')}
          style={{
            flex: 1, padding: '4px 6px',
            background: 'transparent', color: t.text0,
            border: 0, outline: 'none',
            fontFamily: t.fontSans, fontSize: 16, fontWeight: 600,
          }}
        />
        <button
          type="button"
          onClick={onTogglePreview}
          title={showPreview ? tr('notes.edit_mode') : tr('notes.preview')}
          style={{
            padding: '4px 10px', borderRadius: t.r2,
            background: showPreview ? `color-mix(in oklch, ${t.accent} 18%, transparent)` : 'transparent',
            color: showPreview ? t.accent : t.text2,
            border: `1px solid ${showPreview ? t.accent : t.glassBorder}`,
            cursor: 'pointer', fontSize: 11.5, fontFamily: t.fontSans, fontWeight: 500,
          }}
        >
          {showPreview ? tr('notes.edit_mode') : tr('notes.preview')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          title={tr('notes.delete')}
          aria-label={tr('notes.delete')}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, padding: 0, borderRadius: t.r2,
            background: 'transparent', color: t.text2, border: 0, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = t.bg3; e.currentTarget.style.color = t.err; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.text2; }}
        >
          <IconX size={12}/>
        </button>
      </div>
      {/* Body: editor o preview (uno SIEMPRE montado, el otro oculto para
          preservar el state del editor entre toggles). */}
      <div
        ref={hostRef}
        style={{
          flex: 1, minHeight: 0, overflow: 'hidden',
          display: showPreview ? 'none' : 'block',
        }}
      />
      {showPreview && (
        <MarkdownPreview source={note.body}/>
      )}
    </div>
  );
}
