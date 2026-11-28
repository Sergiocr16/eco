import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, IconTile } from '@/design/primitives';
import { IconBranch } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { useT } from '@/hooks/useI18n';

type Props = {
  bubbleId: string;
  workspace: string;
};

// Push de la rama actual al remoto. Auto-detecta upstream y fallback a
// --set-upstream origin <branch> si no existe.
export function PushButton({ bubbleId, workspace }: Props) {
  const t = useTokens();
  const tr = useT();
  type Phase = 'idle' | 'confirm' | 'pushing' | 'done' | 'error';
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  async function push() {
    setMsg(null); setPhase('pushing');
    try {
      const r = await apiFetch('/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) { setMsg(d.message || tr('push.ok')); setPhase('done'); }
      else { setMsg(d.error || tr('push.err')); setPhase('error'); }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tr('common.error')); setPhase('error');
    }
  }

  useEffect(() => {
    if (phase !== 'done' && phase !== 'error') return;
    const id = window.setTimeout(() => { setPhase('idle'); setMsg(null); }, 5000);
    return () => window.clearTimeout(id);
  }, [phase]);

  const isError = phase === 'error';
  const isDone = phase === 'done';

  return (
    <div className="eco-card eco-card--sm" style={{ padding: 12 }}>
      <div className="eco-hstack">
        <IconTile icon={IconBranch} size="sm" accent/>
        <div className="eco-grow">
          <div className="eco-label">{tr('push.btn')}</div>
          <div className="eco-sub">{tr('push.sub')}</div>
        </div>
        {phase !== 'confirm' && (
          <Btn kind="primary" size="sm"
            onClick={() => setPhase('confirm')}
            disabled={phase === 'pushing'}>
            {phase === 'pushing' ? tr('push.pushing') : tr('push.btn')}
          </Btn>
        )}
      </div>
      {phase === 'confirm' && (
        <div className="eco-inset" style={{ marginTop: 10 }}>
          <div className="eco-muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            {tr('push.confirm.q_pre')} <code className="eco-mono" style={{
              fontSize: 11.5, padding: '1px 7px', borderRadius: 7, background: t.card,
            }}>origin</code>{tr('push.confirm.q_post')}
          </div>
          <div className="eco-hstack" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <Btn kind="ghost" size="sm" onClick={() => setPhase('idle')}>{tr('common.cancel')}</Btn>
            <Btn kind="primary" size="sm" onClick={() => void push()}>{tr('push.confirm.do')}</Btn>
          </div>
        </div>
      )}
      {msg && (isDone || isError) && (
        <div className={`eco-banner eco-mono ${isError ? 'eco-banner--err' : 'eco-banner--ok'}`} style={{
          marginTop: 8, display: 'block', fontSize: 11.5,
          whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto',
        }}>{msg}</div>
      )}
    </div>
  );
}
