import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { Glass } from '@/design/primitives';
import { IconBolt } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { useReviewState } from '@/hooks/useReviewState';
import { useT } from '@/hooks/useI18n';

type Props = {
  bubbleId: string;
  workspace: string;
  // Callback opcional al completar commit OK — útil para refrescar listas
  // o navegar a otra sub-pestaña.
  onCommitted?: () => void;
};

export function CommitWithAI({ bubbleId, workspace, onCommitted }: Props) {
  const t = useTokens();
  const tr = useT();
  const review = useReviewState(bubbleId);
  type Phase = 'idle' | 'suggesting' | 'preview' | 'committing' | 'done' | 'error';
  const [phase, setPhase] = useState<Phase>('idle');
  const [extra, setExtra] = useState('');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<string | null>(null);

  async function suggest() {
    setErr(null); setCommitResult(null); setPhase('suggesting');
    try {
      const r = await apiFetch('/git/commit-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, context: extra.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) { setMessage(d.message ?? ''); setPhase('preview'); }
      else { setErr(d.error || tr('commit.err.generate')); setPhase('error'); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('common.error')); setPhase('error');
    }
  }

  async function commit() {
    if (!message.trim()) return;
    setErr(null); setPhase('committing');
    try {
      const r = await apiFetch('/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, message }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setCommitResult(d.message ?? tr('commit.success'));
        setPhase('done');
        setMessage(''); setExtra('');
        // Review estilo Cursor: tras un commit, todo lo "aceptado" ya quedó
        // en historia. Limpiamos el state local para que el banner desaparezca.
        review.clearAll();
        onCommitted?.();
      } else {
        setErr(d.error || tr('commit.err.commit')); setPhase('error');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('common.error')); setPhase('error');
    }
  }

  function reset() {
    setPhase('idle'); setMessage(''); setExtra(''); setErr(null); setCommitResult(null);
  }

  return (
    <Glass radius={10} style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: t.accentFaint, color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IconBolt size={11}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500, color: t.text0 }}>{tr('commit.title')}</div>
          <div style={{ fontSize: 10, color: t.text3, marginTop: 0 }}>
            {tr('commit.sub')}
          </div>
        </div>
      </div>

      {phase === 'idle' || phase === 'error' || phase === 'done' ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {phase === 'done' && commitResult && (
            <div style={{
              padding: '6px 8px', borderRadius: 6,
              background: `color-mix(in oklch, ${t.ok} 12%, transparent)`,
              color: t.ok, fontFamily: t.fontMono, fontSize: 10.5,
              whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto',
            }}>{commitResult}</div>
          )}
          {phase === 'error' && err && (
            <div style={{
              padding: '6px 8px', borderRadius: 6,
              background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
              color: t.err, fontFamily: t.fontMono, fontSize: 10.5,
              whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto',
            }}>{err}</div>
          )}
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder={tr('commit.placeholder')}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              borderRadius: 6, padding: '5px 8px',
              fontFamily: t.fontSans, fontSize: 11, color: t.text0,
              outline: 'none',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void suggest(); }}
          />
          <button
            type="button"
            onClick={() => void suggest()}
            style={{
              height: 26, padding: '0 8px', border: 0, borderRadius: 6,
              background: t.accentDim, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}>
            {tr('commit.btn.generate')}
          </button>
        </div>
      ) : phase === 'suggesting' ? (
        <div style={{ marginTop: 8, padding: '6px 8px', fontSize: 11, color: t.text2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: t.accent,
            animation: 'eco-shimmer 0.9s ease-in-out infinite',
          }}/>
          {tr('commit.analyzing')}
        </div>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            disabled={phase === 'committing'}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              borderRadius: 6, padding: '6px 8px',
              fontFamily: t.fontMono, fontSize: 11, color: t.text0,
              outline: 'none', resize: 'vertical', minHeight: 80,
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={reset}
              disabled={phase === 'committing'}
              style={{
                flex: 1, height: 26, border: 0, borderRadius: 6,
                background: t.bg2, color: t.text1,
                fontFamily: t.fontSans, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}>
              {tr('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void suggest()}
              disabled={phase === 'committing'}
              style={{
                flex: 1, height: 26, border: 0, borderRadius: 6,
                background: t.bg3, color: t.text1,
                fontFamily: t.fontSans, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}>
              {tr('commit.btn.regenerate')}
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={phase === 'committing' || !message.trim()}
              style={{
                flex: 1.4, height: 26, border: 0, borderRadius: 6,
                background: t.accent, color: t.accentOn,
                fontFamily: t.fontSans, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                opacity: phase === 'committing' || !message.trim() ? 0.6 : 1,
              }}>
              {phase === 'committing' ? tr('commit.committing') : tr('commit.btn.commit')}
            </button>
          </div>
        </div>
      )}
    </Glass>
  );
}
