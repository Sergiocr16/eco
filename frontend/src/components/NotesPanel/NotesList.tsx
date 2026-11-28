import { useMemo } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { IconX, IconPlus, IconSearch, IconList } from '@/design/icons';
import { Btn, cx } from '@/design/primitives';
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
  const tr = useT();

  // Filtro por título o body (case-insensitive).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  }, [notes, query]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0,
    }}>
      {/* Toolbar: + nueva + buscar */}
      <div style={{
        padding: '12px 12px 8px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn kind="primary" icon={IconPlus} onClick={onCreate} title={tr('notes.new')} style={{ flex: '1 1 auto' }}>
            {tr('notes.new')}
          </Btn>
          <button
            type="button"
            onClick={onSummarize}
            disabled={!canSummarize || summarizing}
            title={canSummarize ? tr('notes.summarize_tooltip') : tr('notes.summary_empty_chat')}
            className="eco-btn eco-btn--raised"
          >
            {summarizing ? <span className="eco-spinner"/> : <IconList size={15}/>}
            {tr('notes.summarize')}
          </button>
        </div>
        <label className="eco-inputbar eco-inputbar--sm">
          <IconSearch size={14}/>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={tr('notes.search')}
            className="eco-input-bare"
          />
        </label>
      </div>
      {/* Lista */}
      <div style={{ flex: 1, overflow: 'auto', padding: '2px 12px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 ? (
          // With no notes at all the editor side already shows the empty state.
          notes.length === 0 ? null : (
            <div className="eco-empty eco-sub">
              {tr('notes.no_match')}
            </div>
          )
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
      className={cx('eco-menu__item', active && 'is-on')}
      style={{
        flex: 'none', height: 'auto', padding: '10px 8px 10px 14px', borderRadius: 14,
        flexDirection: 'column', alignItems: 'stretch', gap: 2,
        userSelect: 'none',
        border: `1px solid ${active ? t.accentLine : 'transparent'}`,
        ...(active ? { background: t.accentSoft } : null),
      }}
    >
      <div className="eco-hstack" style={{ gap: 8, minWidth: 0 }}>
        <div className="eco-label eco-truncate" style={{ flex: 1, color: note.title.trim() ? t.text0 : t.text3 }}>
          {title}
        </div>
        <span style={{ color: t.text3, fontSize: 12, flexShrink: 0 }}>
          {stamp}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={tr('notes.delete')}
          title={tr('notes.delete')}
          className="eco-iconbtn eco-iconbtn--xs eco-iconbtn--danger"
        >
          <IconX size={13}/>
        </button>
      </div>
      {preview && (
        <div className="eco-truncate" style={{ color: t.text1, fontSize: 12.5 }}>
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
