import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Glass } from '@/design/primitives';
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
      if (d.ok) { setMsg(d.message || tr('detail.git.push.ok')); setPhase('done'); }
      else { setMsg(d.error || tr('detail.git.push.error')); setPhase('error'); }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error'); setPhase('error');
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
    <Glass radius={10} style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: t.accentFaint, color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IconBranch size={11}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500, color: t.text0 }}>{tr('detail.git.push.title')}</div>
          <div style={{ fontSize: 10, color: t.text3, marginTop: 0 }}>
            {tr('detail.git.push.subtitle')}
          </div>
        </div>
        {phase !== 'confirm' && (
          <button
            type="button"
            onClick={() => setPhase('confirm')}
            disabled={phase === 'pushing'}
            style={{
              height: 26, padding: '0 12px', border: 0, borderRadius: 6,
              background: t.accent, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 600,
              cursor: phase === 'pushing' ? 'default' : 'pointer',
              opacity: phase === 'pushing' ? 0.6 : 1,
            }}>
            {phase === 'pushing' ? tr('detail.git.push.pushing') : tr('detail.git.push.button')}
          </button>
        )}
      </div>
      {phase === 'confirm' && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 8,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
        }}>
          <div style={{ fontSize: 11, color: t.text1, lineHeight: 1.5 }}>
            {tr('detail.git.push.confirm')}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setPhase('idle')}
              style={{
                height: 26, padding: '0 12px', borderRadius: 6,
                background: 'transparent', color: t.text2,
                border: `1px solid ${t.glassBorder}`,
                fontFamily: t.fontSans, fontSize: 11, cursor: 'pointer',
              }}>{tr('detail.git.button.cancel')}</button>
            <button
              type="button"
              onClick={() => void push()}
              style={{
                height: 26, padding: '0 12px', border: 0, borderRadius: 6,
                background: t.accent, color: t.accentOn,
                fontFamily: t.fontSans, fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
              }}>{tr('detail.git.push.confirm_button')}</button>
          </div>
        </div>
      )}
      {msg && (isDone || isError) && (
        <div style={{
          marginTop: 6,
          padding: '6px 8px', borderRadius: 6,
          background: `color-mix(in oklch, ${isError ? t.err : t.ok} 12%, transparent)`,
          color: isError ? t.err : t.ok,
          fontFamily: t.fontMono, fontSize: 10.5,
          whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto',
        }}>{msg}</div>
      )}
    </Glass>
  );
}
