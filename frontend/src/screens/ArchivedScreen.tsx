import { useMemo, useState } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { IconArchive, IconResume, IconTrash, IconX } from '@/design/icons';
import { AgentGlyph, bubbleLetter } from '@/design/primitives';
import type { Bubble } from '@/lib/types';

type Props = {
  bubbles: Bubble[];
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
};

export function ArchivedScreen({ bubbles, onUnarchive, onDelete, onOpen }: Props) {
  const t = useTokens();
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
    <div style={{ padding: '28px 32px', overflow: 'auto', height: '100%' }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>
        {tr('archived.title')}
      </h2>
      <p style={{ margin: '4px 0 18px', fontSize: 13, color: t.text2 }}>
        {tr('archived.sub')}
      </p>

      {bubbles.some((b) => b.archived) && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr('archived.search_placeholder')}
          style={{
            width: '100%', maxWidth: 460, marginBottom: 16,
            padding: '8px 12px', borderRadius: 8,
            background: t.bg1, color: t.text0,
            border: `1px solid ${t.glassBorder}`,
            fontFamily: t.fontSans, fontSize: 13, outline: 'none',
          }}
        />
      )}

      {list.length === 0 ? (
        <EmptyState query={query.trim().length > 0}/>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((b) => (
            <ArchivedRow
              key={b.id}
              bubble={b}
              onUnarchive={() => onUnarchive(b.id)}
              onOpen={() => onOpen(b.id)}
              onDelete={() => setConfirmDelete(b)}
            />
          ))}
        </div>
      )}

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

function EmptyState({ query }: { query: boolean }) {
  const t = useTokens();
  const tr = useT();
  return (
    <div style={{
      padding: '40px 24px', textAlign: 'center', color: t.text2,
      fontFamily: t.fontSans, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: t.bg2, color: t.text3,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconArchive size={24}/>
      </div>
      <div style={{ fontSize: 14, color: t.text1, fontWeight: 500 }}>
        {query ? tr('archived.empty_title') : tr('archived.empty_title')}
      </div>
      <div style={{ fontSize: 12, color: t.text3, maxWidth: 360, lineHeight: 1.5 }}>
        {tr('archived.empty_desc')}
      </div>
    </div>
  );
}

function ArchivedRow({ bubble, onUnarchive, onOpen, onDelete }: {
  bubble: Bubble;
  onUnarchive: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const stamp = formatArchivedStamp(bubble.archivedAt ?? 0, tr);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 14px',
      background: t.bg2, border: `1px solid ${t.glassBorder}`,
      borderRadius: 12, fontFamily: t.fontSans,
    }}>
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'transparent', border: 0, padding: 0,
          textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0,
          color: t.text0, fontFamily: t.fontSans,
        }}
      >
        <AgentGlyph size={36} state="idle" letter={bubbleLetter(bubble.title)} accent={bubble.accent}/>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: t.text0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bubble.title}
          </div>
          <div style={{ fontSize: 11, color: t.text3, fontFamily: t.fontMono,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bubble.workspace || '—'}
          </div>
          <div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>
            {stamp}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onUnarchive}
        title={tr('archived.unarchive_tooltip')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', borderRadius: 6,
          background: 'transparent', color: t.ok,
          border: `1px solid ${t.ok}`,
          fontFamily: t.fontSans, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}
      >
        <IconResume size={11}/>
        {tr('archived.unarchive')}
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={tr('archived.delete_permanent_tooltip')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', borderRadius: 6,
          background: 'transparent', color: t.err,
          border: `1px solid ${t.err}`,
          fontFamily: t.fontSans, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}
      >
        <IconTrash size={11}/>
        {tr('archived.delete_permanent')}
      </button>
    </div>
  );
}

function ConfirmDeleteDialog({ bubble, onCancel, onConfirm }: {
  bubble: Bubble;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 230,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        maxWidth: 440, width: '90%', padding: 22,
        background: t.windowBg, border: `1px solid ${t.glassBorder}`,
        borderRadius: t.r3, color: t.text0, fontFamily: t.fontSans,
        boxShadow: t.shadowLg,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `color-mix(in oklch, ${t.err} 15%, transparent)`,
            color: t.err, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconTrash size={16}/>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {tr('archived.delete_confirm_title')}
          </div>
          <span style={{ flex: 1 }}/>
          <button
            type="button"
            onClick={onCancel}
            aria-label="cancel"
            style={{
              background: 'transparent', border: 0, color: t.text3,
              cursor: 'pointer', padding: 4,
            }}
          ><IconX size={14}/></button>
        </div>
        <div style={{ fontSize: 13, color: t.text1, marginBottom: 6 }}>
          «{bubble.title}»
        </div>
        <div style={{ fontSize: 12.5, color: t.text2, marginBottom: 18, lineHeight: 1.55 }}>
          {tr('archived.delete_confirm_body')}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: 'transparent', color: t.text1,
              border: `1px solid ${t.glassBorder}`,
              cursor: 'pointer', fontSize: 13, fontFamily: t.fontSans,
            }}
          >{tr('common.cancel')}</button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: t.err, color: '#fff', border: 0,
              cursor: 'pointer', fontSize: 13, fontFamily: t.fontSans, fontWeight: 600,
            }}
          >{tr('archived.delete_permanent')}</button>
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
