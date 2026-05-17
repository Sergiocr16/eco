import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useGitOpStatus } from '@/hooks/useGitOpStatus';
import { useT } from '@/hooks/useI18n';

type Props = {
  workspace: string;
  bubbleId: string;
  onGoChanges: () => void;
};

const LABEL_KEYS = {
  'cherry-pick': 'git.op.cherry_pick',
  merge: 'git.op.merge',
  revert: 'git.op.revert',
} as const;

export function OpInProgressBanner({ workspace, bubbleId, onGoChanges }: Props) {
  const t = useTokens();
  const tr = useT();
  const status = useGitOpStatus(workspace, bubbleId);
  const [busy, setBusy] = useState<'continue' | 'abort' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!status.inProgress) return null;
  const opLabel = tr(LABEL_KEYS[status.inProgress]);

  async function callOp(action: 'continue' | 'abort') {
    if (!status.inProgress) return;
    setBusy(action); setErr(null);
    try {
      const r = await apiFetch(`/git/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, op: status.inProgress }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        setErr(d.error || `HTTP ${r.status}`);
      } else {
        // Refrescar: el status se vuelve a fetchear, el banner desaparece.
        ecoEmit('eco:git_refresh', { bubbleId });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('common.error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{
      padding: '10px 20px',
      background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
      borderBottom: `1px solid ${t.err}`,
      display: 'flex', flexDirection: 'column', gap: 6,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: t.err, boxShadow: `0 0 6px ${t.err}`,
          flexShrink: 0,
        }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: t.text0, fontWeight: 600 }}>
            {tr('git.op.in_progress', { op: opLabel })}
          </div>
          {status.conflictedFiles.length > 0 && (
            <div style={{ fontSize: 11, color: t.text2, marginTop: 2 }}>
              {status.conflictedFiles.length === 1
                ? tr('git.op.conflict_files_one', { n: 1, list: status.conflictedFiles.slice(0, 3).join(', ') + (status.conflictedFiles.length > 3 ? '…' : '') })
                : tr('git.op.conflict_files_many', { n: status.conflictedFiles.length, list: status.conflictedFiles.slice(0, 3).join(', ') + (status.conflictedFiles.length > 3 ? '…' : '') })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onGoChanges}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6,
              background: 'transparent', border: `1px solid ${t.glassBorder}`,
              color: t.text1, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
            }}>
            {tr('git.op.resolve_in_changes')}
          </button>
          <button
            type="button"
            onClick={() => void callOp('continue')}
            disabled={!!busy}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6,
              background: t.accent, border: 0, color: t.accentOn,
              fontSize: 11.5, fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}>
            {busy === 'continue' ? '…' : tr('git.op.continue')}
          </button>
          <button
            type="button"
            onClick={() => void callOp('abort')}
            disabled={!!busy}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6,
              background: t.err, border: 0, color: '#fff',
              fontSize: 11.5, fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}>
            {busy === 'abort' ? '…' : tr('git.op.abort')}
          </button>
        </div>
      </div>
      {err && (
        <div style={{
          fontSize: 11, color: t.err, fontFamily: t.fontMono,
          padding: '4px 6px', borderRadius: 4,
          background: t.bg2,
        }}>{err}</div>
      )}
    </div>
  );
}
