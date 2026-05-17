import { useState } from 'react';
import { useTokens } from '@/design/theme';
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
      setErr(e instanceof Error ? e.message : 'Error');
      setBusy(false);
    }
  }

  if (err) {
    return (
      <button
        type="button"
        title="Click para reintentar"
        onClick={() => setErr(null)}
        style={{
          maxWidth: 260,
          fontSize: 11, color: t.err, fontFamily: t.fontMono,
          padding: '4px 10px', borderRadius: 6,
          background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
          border: `1px solid ${t.err}`,
          cursor: 'pointer', textAlign: 'left',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{err}</button>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title={change === 'created'
          ? tr('detail.git.discard.title_delete', { path })
          : tr('detail.git.discard.title_revert', { path })}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 7,
          border: `1px solid ${t.glassBorder}`,
          background: 'transparent', color: t.text2,
          fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = t.err; e.currentTarget.style.borderColor = t.err; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = t.text2; e.currentTarget.style.borderColor = t.glassBorder; }}>
        <IconTrash size={11}/>
        {tr('detail.git.discard.button')}
      </button>
    );
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 6px 4px 10px', borderRadius: 7,
      background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
      border: `1px solid ${t.err}`,
    }}>
      <span style={{ fontSize: 11, color: t.err, fontWeight: 500 }}>
        {change === 'created' ? tr('detail.git.discard.confirm_delete') : tr('detail.git.discard.confirm_revert')}
      </span>
      <button type="button"
        onClick={() => void discard()}
        disabled={busy}
        style={{
          padding: '3px 9px', borderRadius: 5, border: 0,
          background: t.err, color: '#fff',
          fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}>{busy ? '…' : tr('detail.git.button.yes')}</button>
      <button type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        style={{
          padding: '3px 9px', borderRadius: 5, border: 0,
          background: 'transparent', color: t.text2,
          fontSize: 11, cursor: 'pointer',
        }}>{tr('detail.git.button.no')}</button>
    </div>
  );
}
