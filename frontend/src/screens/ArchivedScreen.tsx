import { useMemo, useState } from 'react';
import { useT } from '@/hooks/useI18n';
import { IconArchive, IconRotateCcw, IconSearch, IconTrash, IconX } from '@/design/icons';
import { Btn, Card, IconBtn, IconTile, PageHeader, bubbleLetter } from '@/design/primitives';
import type { Bubble } from '@/lib/types';

type Props = {
  bubbles: Bubble[];
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
};

export function ArchivedScreen({ bubbles, onUnarchive, onDelete, onOpen }: Props) {
  const tr = useT();
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Bubble | null>(null);

  // Solo archivados, sort por archivedAt desc (más recientes primero).
  const list = useMemo(() => {
    const archived = bubbles.filter((b) => b.archived);
    archived.sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
    if (!query.trim()) return archived;
    const q = query.toLowerCase();
    return archived.filter((b) =>
      b.title.toLowerCase().includes(q)
      || (b.workspace ?? '').toLowerCase().includes(q),
    );
  }, [bubbles, query]);

  return (
    <div className="eco-page eco-page--scroll">
      <PageHeader
        eyebrow={tr('nav.archived')}
        title={tr('archived.title')}
        sub={tr('archived.sub')}
        actions={bubbles.some((b) => b.archived) ? (
          <label className="eco-inputbar eco-inputbar--on-sheet" style={{ flex: '1 1 240px', maxWidth: 320 }}>
            <IconSearch size={15}/>
            <input
              className="eco-input-bare"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('archived.search_placeholder')}
            />
          </label>
        ) : undefined}
      />

      <Card variant="list">
        {list.length === 0 ? (
          <EmptyState/>
        ) : list.map((b) => (
          <ArchivedRow
            key={b.id}
            bubble={b}
            onUnarchive={() => onUnarchive(b.id)}
            onOpen={() => onOpen(b.id)}
            onDelete={() => setConfirmDelete(b)}
          />
        ))}
      </Card>

      {confirmDelete && (
        <ConfirmDeleteDialog
          bubble={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
        />
      )}
    </div>
  );
}

function EmptyState() {
  const tr = useT();
  return (
    <div className="eco-empty eco-vstack" style={{ alignItems: 'center' }}>
      <IconTile icon={IconArchive} size="lg"/>
      <div className="eco-label">{tr('archived.empty_title')}</div>
      <div className="eco-sub" style={{ maxWidth: 360 }}>{tr('archived.empty_desc')}</div>
    </div>
  );
}

function ArchivedRow({ bubble, onUnarchive, onOpen, onDelete }: {
  bubble: Bubble;
  onUnarchive: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const tr = useT();
  const stamp = formatArchivedStamp(bubble.archivedAt ?? 0, tr);
  return (
    <div className="eco-row">
      <button
        type="button"
        onClick={onOpen}
        className="eco-hstack eco-row__main"
        style={{
          gap: 14, padding: 0, border: 0, background: 'transparent',
          color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
        }}
      >
        <IconTile>{bubbleLetter(bubble.title)}</IconTile>
        <div className="eco-grow">
          <div className="eco-row__title eco-truncate">{bubble.title}</div>
          <div className="eco-hstack eco-hstack--wrap eco-row__desc" style={{ gap: '2px 10px' }}>
            <span className="eco-mono eco-truncate" style={{ fontSize: 12 }}>{bubble.workspace || '—'}</span>
            {stamp && <span>{stamp}</span>}
          </div>
        </div>
      </button>
      <div className="eco-row__end">
        <Btn kind="raised" size="sm" icon={IconRotateCcw} onClick={onUnarchive} title={tr('archived.unarchive_tooltip')}>
          {tr('archived.unarchive')}
        </Btn>
        <Btn kind="danger" size="sm" icon={IconTrash} onClick={onDelete} title={tr('archived.delete_permanent_tooltip')}>
          {tr('archived.delete_permanent')}
        </Btn>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({ bubble, onCancel, onConfirm }: {
  bubble: Bubble;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tr = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="eco-scrim"
      style={{ zIndex: 230 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="eco-dialog eco-dialog--sm eco-dialog--danger" aria-label={tr('archived.delete_confirm_title')}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile eco-dialog__tile--danger"><IconTrash size={20}/></span>
          <h2 className="eco-dialog__title">{tr('archived.delete_confirm_title')}</h2>
          <IconBtn icon={IconX} size={32} title={tr('common.cancel')} onClick={onCancel}/>
        </div>
        <div className="eco-dialog__section">
          <div className="eco-label">«{bubble.title}»</div>
          <p className="eco-dialog__body">{tr('archived.delete_confirm_body')}</p>
        </div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>
              {tr('common.cancel')}
            </button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--danger-solid" onClick={onConfirm}>
              {tr('archived.delete_permanent')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatArchivedStamp(ts: number, tr: (k: string, v?: Record<string, string | number>) => string): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return tr('archived.archived_just_now');
  if (min < 60) return tr('archived.archived_minutes_ago', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return tr('archived.archived_hours_ago', { n: hr });
  const d = Math.floor(hr / 24);
  return tr('archived.archived_days_ago', { n: d });
}
