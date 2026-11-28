import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
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
  const conflictCount = status.conflictedFiles.length;

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

  const conflictList = status.conflictedFiles.slice(0, 3).join(', ') + (conflictCount > 3 ? '…' : '');
  return (
    <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
      <div className="eco-banner eco-banner--err">
        <span className="eco-dot eco-dot--lg eco-dot--err"/>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div className="eco-label">
            {tr('git.op.in_progress', { op: opLabel })}
          </div>
          {conflictCount > 0 && (
            <div className="eco-sub" style={{ marginTop: 2 }}>
              {conflictCount === 1
                ? tr('git.op.conflict_files_one', { n: 1, list: conflictList })
                : tr('git.op.conflict_files_many', { n: conflictCount, list: conflictList })}
            </div>
          )}
        </div>
        <div className="eco-hstack eco-hstack--wrap" style={{ gap: 6 }}>
          <Btn kind="raised" size="sm" onClick={onGoChanges}>
            {tr('git.op.resolve_in_changes')}
          </Btn>
          <Btn kind="primary" size="sm" disabled={!!busy}
            onClick={() => void callOp('continue')}
            style={busy ? { cursor: 'wait' } : undefined}>
            {busy === 'continue' ? '…' : tr('git.op.continue')}
          </Btn>
          <Btn kind="danger-solid" size="sm" disabled={!!busy}
            onClick={() => void callOp('abort')}
            style={busy ? { cursor: 'wait' } : undefined}>
            {busy === 'abort' ? '…' : tr('git.op.abort')}
          </Btn>
        </div>
        {err && (
          <div className="eco-mono" style={{
            flexBasis: '100%', fontSize: 11.5, color: t.err,
            padding: '4px 8px', borderRadius: 8, background: t.raised,
          }}>{err}</div>
        )}
      </div>
    </div>
  );
}
