import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { IconTrash } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useT } from '@/hooks/useI18n';

type Props = {
  path: string;
  workspace: string;
  bubbleId: string;
  change: string;
};

export function DiscardFileButton({ path, workspace, bubbleId, change }: Props) {
  const t = useTokens();
  const tr = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function discard() {
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch('/file/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, path }),
      });
      const data = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok || data?.ok === false) {
        setErr(data?.error || `HTTP ${r.status}`);
        setBusy(false);
        return;
      }
      ecoEmit('eco:git_refresh', { bubbleId });
      setConfirming(false);
      setBusy(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('common.error'));
      setBusy(false);
    }
  }

  if (err) {
    return (
      <button
        type="button"
        title={tr('discard.retry_tooltip')}
        onClick={() => setErr(null)}
        className="eco-chip eco-chip--err eco-chip--btn eco-mono"
        style={{ maxWidth: 260, height: 'var(--h-xs)', fontSize: 11.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{err}</button>
    );
  }

  if (!confirming) {
    return (
      <Btn
        kind="danger" size="sm" icon={IconTrash}
        onClick={() => setConfirming(true)}
        title={change === 'created'
          ? tr('discard.tooltip.delete', { path })
          : tr('discard.tooltip.revert', { path })}>
        {tr('discard.btn')}
      </Btn>
    );
  }

  return (
    <div className="eco-hstack" style={{
      display: 'inline-flex', gap: 6, padding: '3px 4px 3px 12px', borderRadius: 999,
      background: `color-mix(in oklab, ${t.err} 13%, transparent)`,
    }}>
      <span style={{ fontSize: 12.5, color: t.err, fontWeight: 500 }}>
        {change === 'created' ? tr('discard.confirm.delete') : tr('discard.confirm.revert')}
      </span>
      <button type="button" className="eco-btn eco-btn--xs eco-btn--danger-solid"
        onClick={() => void discard()} disabled={busy}
        style={busy ? { cursor: 'wait' } : undefined}>
        {busy ? '…' : tr('common.yes')}
      </button>
      <Btn kind="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
        {tr('common.no')}
      </Btn>
    </div>
  );
}
