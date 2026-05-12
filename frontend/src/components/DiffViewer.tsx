import { useEffect, useMemo, useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconX, IconDiff, IconSearch } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { useT } from '@/hooks/useI18n';
import { translateBackendError } from '@/lib/backend-errors';

type DiffResult = {
  mode: 'git' | 'created' | 'plain' | 'not_found';
  diff: string;
  hasChanges: boolean;
  message?: string;
};

type Props = {
  open: boolean;
  path: string | null;
  workspace: string;
  bubbleId?: string;
  onClose: () => void;
};

export function DiffViewer({ open, path, workspace, bubbleId, onClose }: Props) {
  const t = useTokens();
  const tr = useT();
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open, path]);

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    apiFetch('/file/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, workspace, ...(bubbleId ? { bubbleId } : {}) }),
    })
      .then(async (r) => {
        if (cancelled) return;
        const data = await r.json().catch(() => ({}));
        if (!r.ok) setError(translateBackendError(data, `HTTP ${r.status}`));
        else setResult(data as DiffResult);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, path, workspace]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !path) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 160,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 100%)', maxHeight: '88vh',
          background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
          borderRadius: 18, boxShadow: t.shadowLg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconDiff size={13}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: t.fontMono, fontSize: 12.5, color: t.text0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{path}</div>
            <div style={{ fontSize: 11, color: t.text2, marginTop: 1 }}>
              {result?.mode === 'git' ? tr('diff.git') :
                result?.mode === 'created' ? tr('diff.created') :
                result?.mode === 'plain' ? tr('diff.plain') :
                result?.mode === 'not_found' ? tr('diff.not_found') :
                loading ? tr('diff.loading') : ''}
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 8,
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            color: t.text2,
          }}>
            <IconSearch size={12}/>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('diff.search')}
              spellCheck={false}
              autoCorrect="off"
              style={{
                background: 'transparent', border: 0, outline: 'none',
                fontFamily: t.fontMono, fontSize: 12, color: t.text0,
                width: 180,
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}
                style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
                <IconX size={12}/>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 0,
              background: 'transparent', color: t.text2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconX size={14}/>
          </button>
        </div>

        <div style={{
          flex: 1, overflow: 'auto', padding: 0,
          background: t.bg0,
        }}>
          {loading && (
            <div style={{ padding: 24, fontSize: 13, color: t.text2 }}>{tr('diff.loading')}</div>
          )}
          {error && (
            <div style={{ padding: 24, fontSize: 13, color: t.err }}>{error}</div>
          )}
          {result && !result.hasChanges && !error && (
            <div style={{ padding: 24, fontSize: 13, color: t.text2 }}>
              {result.message || tr('diff.no_changes')}
            </div>
          )}
          {result?.hasChanges && (
            <DiffRender diff={result.diff} mode={result.mode} query={query}/>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Parser de unified diff a hunks con líneas izquierda/derecha ───────────
type DiffSide = 'context' | 'added' | 'deleted';
type DiffRow = {
  oldNum: number | null;
  newNum: number | null;
  oldText: string | null;
  newText: string | null;
  side: DiffSide;
};
type DiffHunk = { header: string; rows: DiffRow[] };

function parseUnifiedDiff(diff: string): DiffHunk[] {
  const lines = diff.split('\n');
  const hunks: DiffHunk[] = [];
  let cur: { header: string; oldStart: number; newStart: number; rows: DiffRow[] } | null = null;
  let oldN = 0, newN = 0;
  const pendingDel: { num: number; text: string }[] = [];
  const flushPendingDel = () => {
    for (const d of pendingDel) {
      cur!.rows.push({ oldNum: d.num, newNum: null, oldText: d.text, newText: null, side: 'deleted' });
    }
    pendingDel.length = 0;
  };

  for (const raw of lines) {
    if (raw.startsWith('diff --git') || raw.startsWith('index ') || raw.startsWith('new file') ||
        raw.startsWith('deleted file') || raw.startsWith('--- ') || raw.startsWith('+++ ') ||
        raw.startsWith('similarity ') || raw.startsWith('rename ')) {
      continue;
    }
    if (raw.startsWith('@@')) {
      if (cur) { flushPendingDel(); hunks.push({ header: cur.header, rows: cur.rows }); }
      // formato: @@ -A,B +C,D @@ ...
      const m = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(raw);
      const oldStart = m ? Number(m[1]) : 1;
      const newStart = m ? Number(m[2]) : 1;
      oldN = oldStart; newN = newStart;
      cur = { header: raw, oldStart, newStart, rows: [] };
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith('+')) {
      // Si tenemos una deleción "espejo" en cola, las pareamos en una sola fila.
      const pair = pendingDel.shift();
      cur.rows.push({
        oldNum: pair?.num ?? null,
        newNum: newN,
        oldText: pair?.text ?? null,
        newText: raw.slice(1),
        side: pair ? 'added' /* modificada */ : 'added',
      });
      // Si fue una mod par, marcamos ambos como modificación (re-uso 'added' visualmente).
      newN += 1;
    } else if (raw.startsWith('-')) {
      pendingDel.push({ num: oldN, text: raw.slice(1) });
      oldN += 1;
    } else {
      flushPendingDel();
      const text = raw.startsWith(' ') ? raw.slice(1) : raw;
      cur.rows.push({ oldNum: oldN, newNum: newN, oldText: text, newText: text, side: 'context' });
      oldN += 1; newN += 1;
    }
  }
  if (cur) { flushPendingDel(); hunks.push({ header: cur.header, rows: cur.rows }); }
  return hunks;
}

function DiffRender({ diff, mode, query }: { diff: string; mode: DiffResult['mode']; query: string }) {
  const t = useTokens();
  const q = query.trim().toLowerCase();

  if (mode === 'plain') {
    return (
      <pre style={{
        margin: 0, padding: '14px 18px',
        fontFamily: t.fontMono, fontSize: 12, lineHeight: 1.6,
        color: t.text1, whiteSpace: 'pre',
        overflow: 'auto',
      }}>{highlightInPre(diff, q, t)}</pre>
    );
  }

  const allHunks = useMemo(() => parseUnifiedDiff(diff), [diff]);
  // Filtrar: dejamos hunks que tienen al menos una fila con match.
  const visibleHunks = useMemo(() => {
    if (!q) return allHunks;
    return allHunks
      .map((h) => ({
        ...h,
        rows: h.rows.filter((r) =>
          (r.oldText ?? '').toLowerCase().includes(q) ||
          (r.newText ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter((h) => h.rows.length > 0);
  }, [allHunks, q]);

  if (q && visibleHunks.length === 0) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: t.text2 }}>
        No hay coincidencias para «{query}».
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {visibleHunks.map((h, i) => (
        <div key={i} style={{ marginBottom: i === visibleHunks.length - 1 ? 0 : 8 }}>
          <div style={{
            padding: '6px 12px',
            background: `color-mix(in oklch, oklch(70% 0.14 240) 8%, transparent)`,
            color: 'oklch(70% 0.14 240)',
            fontFamily: t.fontMono, fontSize: 11.5,
            borderTop: `1px solid ${t.glassBorder}`,
            borderBottom: `1px solid ${t.glassBorder}`,
          }}>{h.header}</div>
          <table style={{
            width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
            fontFamily: t.fontMono, fontSize: 12, lineHeight: 1.55,
          }}>
            <colgroup>
              <col style={{ width: 44 }}/>
              <col/>
              <col style={{ width: 44 }}/>
              <col/>
            </colgroup>
            <tbody>
              {h.rows.map((r, j) => <DiffRowView key={j} row={r} query={q}/>)}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// Resalta los matches en celdas split.
function highlightMatch(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) { out.push(text.slice(i)); break; }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark key={idx} style={{
        background: 'oklch(85% 0.18 90 / 0.55)',
        color: 'inherit', padding: 0, borderRadius: 2,
      }}>{text.slice(idx, idx + q.length)}</mark>
    );
    i = idx + q.length;
  }
  return out;
}

function highlightInPre(text: string, q: string, t: ReturnType<typeof useTokens>): React.ReactNode {
  if (!q) return text;
  // Para el modo plain devolvemos los fragments.
  void t;
  return highlightMatch(text, q);
}

function DiffRowView({ row, query }: { row: DiffRow; query: string }) {
  const t = useTokens();
  const leftHas = row.oldText !== null;
  const rightHas = row.newText !== null;
  // Una fila pareada con texto a ambos lados que difieren = modificación.
  const isMod = leftHas && rightHas && row.oldText !== row.newText;
  const leftKind: DiffSide = leftHas && (row.side === 'deleted' || isMod) ? 'deleted' : 'context';
  const rightKind: DiffSide = rightHas && (row.side === 'added' || isMod) ? 'added' : 'context';

  const cellStyle = (kind: DiffSide): React.CSSProperties => {
    const bg = kind === 'added'
      ? `color-mix(in oklch, ${t.ok} 12%, transparent)`
      : kind === 'deleted'
        ? `color-mix(in oklch, ${t.err} 12%, transparent)`
        : 'transparent';
    const fg = kind === 'added' ? t.ok
      : kind === 'deleted' ? t.err
      : t.text1;
    return {
      padding: '0 10px',
      whiteSpace: 'pre',
      background: bg, color: fg,
      borderRight: `1px solid ${t.glassBorder}`,
      verticalAlign: 'top',
      overflow: 'hidden', textOverflow: 'ellipsis',
    };
  };
  const numStyle = (kind: DiffSide): React.CSSProperties => {
    const bg = kind === 'added'
      ? `color-mix(in oklch, ${t.ok} 18%, transparent)`
      : kind === 'deleted'
        ? `color-mix(in oklch, ${t.err} 18%, transparent)`
        : `color-mix(in oklch, ${t.text0} 4%, transparent)`;
    return {
      width: 44, padding: '0 6px', textAlign: 'right',
      color: t.text3, background: bg,
      borderRight: `1px solid ${t.glassBorder}`,
      userSelect: 'none', verticalAlign: 'top',
      fontVariantNumeric: 'tabular-nums',
    };
  };

  return (
    <tr>
      <td style={numStyle(leftKind)}>{row.oldNum ?? ''}</td>
      <td style={cellStyle(leftKind)}>
        {leftHas ? (
          <span style={{ display: 'inline-block', width: 14, color: t.text3 }}>
            {leftKind === 'deleted' ? '−' : ' '}
          </span>
        ) : null}
        <span>{leftHas ? highlightMatch(row.oldText ?? '', query) : ''}</span>
      </td>
      <td style={numStyle(rightKind)}>{row.newNum ?? ''}</td>
      <td style={cellStyle(rightKind)}>
        {rightHas ? (
          <span style={{ display: 'inline-block', width: 14, color: t.text3 }}>
            {rightKind === 'added' ? '+' : ' '}
          </span>
        ) : null}
        <span>{rightHas ? highlightMatch(row.newText ?? '', query) : ''}</span>
      </td>
    </tr>
  );
}

