import { useMemo } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { IconX } from '@/design/icons';
import type { Note } from './types';

type Props = {
  notes: Note[];
  activeNoteId: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onSummarize: () => void;
  canSummarize: boolean;
  summarizing: boolean;
};

export function NotesList({
  notes, activeNoteId, query, onQueryChange, onActivate, onDelete, onCreate, onSummarize, canSummarize, summarizing,
}: Props) {
  const t = useTokens();
  const tr = useT();

  // Filtro por título o body (case-insensitive).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  }, [notes, query]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: t.glassBg, minWidth: 0,
    }}>
      {/* Toolbar: + nueva + buscar */}
      <div style={{
        padding: '8px 10px', borderBottom: `1px solid ${t.glassBorder}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={onCreate}
            title={tr('notes.new')}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '6px 10px', height: 28, borderRadius: t.r2, border: 0,
              background: t.accent, color: t.accentOn,
              cursor: 'pointer', fontSize: 12, fontFamily: t.fontSans, fontWeight: 500,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
            {tr('notes.new')}
          </button>
          <button
            type="button"
            onClick={onSummarize}
            disabled={!canSummarize || summarizing}
            title={canSummarize ? tr('notes.summarize_tooltip') : tr('notes.summary_empty_chat')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '6px 10px', height: 28, borderRadius: t.r2,
              background: 'transparent', color: t.text1,
              border: `1px solid ${t.glassBorder}`,
              cursor: canSummarize && !summarizing ? 'pointer' : 'not-allowed',
              opacity: canSummarize && !summarizing ? 1 : 0.45,
              fontSize: 12, fontFamily: t.fontSans, fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {summarizing ? (
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                border: `1.5px solid ${t.glassBorder}`,
                borderTopColor: t.accent,
                animation: 'eco-spin 0.7s linear infinite',
                display: 'inline-block',
              }}/>
            ) : (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12M2 8h8M2 12h12"/>
              </svg>
            )}
            {tr('notes.summarize')}
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={tr('notes.search')}
          style={{
            padding: '5px 10px', borderRadius: t.r2,
            background: t.bg1, color: t.text0,
            border: `1px solid ${t.glassBorder}`, outline: 'none',
            fontSize: 12, fontFamily: t.fontSans,
          }}
        />
      </div>
      {/* Lista */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 14, color: t.text2, fontSize: 12, fontFamily: t.fontSans }}>
            {notes.length === 0 ? tr('notes.empty_desc') : tr('notes.no_match')}
          </div>
        ) : (
          filtered.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              active={n.id === activeNoteId}
              onActivate={() => onActivate(n.id)}
              onDelete={() => onDelete(n.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NoteRow({ note, active, onActivate, onDelete }: {
  note: Note; active: boolean; onActivate: () => void; onDelete: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const title = note.title.trim() || tr('notes.untitled');
  const preview = note.body.split('\n').find((l) => l.trim()) ?? '';
  const stamp = formatRelative(note.updatedAt, tr);
  return (
    <div
      onClick={onActivate}
      style={{
        position: 'relative',
        padding: '8px 12px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: active ? `color-mix(in oklch, ${t.accent} 18%, transparent)` : 'transparent',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 2,
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = t.bg3; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
      }}>
        <div style={{
          flex: 1, minWidth: 0,
          color: note.title.trim() ? t.text0 : t.text3,
          fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <span style={{ color: t.text3, fontSize: 10.5, fontFamily: t.fontMono, flexShrink: 0 }}>
          {stamp}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={tr('notes.delete')}
          title={tr('notes.delete')}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, padding: 0,
            background: 'transparent', color: t.text3, border: 0,
            cursor: 'pointer', borderRadius: 4, flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = t.bg3; e.currentTarget.style.color = t.err; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.text3; }}
        >
          <IconX size={10}/>
        </button>
      </div>
      {preview && (
        <div style={{
          color: t.text2, fontSize: 11.5, fontFamily: t.fontSans,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {preview}
        </div>
      )}
    </div>
  );
}

function formatRelative(ts: number, tr: (k: string, v?: Record<string, string | number>) => string): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return tr('notes.relative_just_now');
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d`;
  const date = new Date(ts);
  return `${date.getDate()}/${date.getMonth() + 1}`;
}
