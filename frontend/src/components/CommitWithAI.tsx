import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { Glass } from '@/design/primitives';
import { IconBolt } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useReviewState } from '@/hooks/useReviewState';
import { useT } from '@/hooks/useI18n';

type Props = {
  bubbleId: string;
  workspace: string;
  // Callback opcional al completar commit OK — útil para refrescar listas
  // o navegar a otra sub-pestaña.
  onCommitted?: () => void;
};

// Estilo GitHub Desktop: título (1 línea) + descripción (multilínea), ambos
// editables a mano. "Generar con IA" los rellena pero el user puede cambiarlos.
export function CommitWithAI({ bubbleId, workspace, onCommitted }: Props) {
  const t = useTokens();
  const tr = useT();
  const review = useReviewState(bubbleId);
  type Phase = 'idle' | 'suggesting' | 'committing' | 'done' | 'error';
  const [phase, setPhase] = useState<Phase>('idle');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<string | null>(null);

  const busy = phase === 'suggesting' || phase === 'committing';

  async function suggest() {
    if (busy) return;
    setErr(null); setCommitResult(null); setPhase('suggesting');
    try {
      const r = await apiFetch('/git/commit-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pasamos el título actual como pista para la IA (si el user escribió algo).
        body: JSON.stringify({ workspace, bubbleId, context: title.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        const msg = String(d.message ?? '').trim();
        const nl = msg.indexOf('\n');
        if (nl === -1) {
          setTitle(msg);
        } else {
          setTitle(msg.slice(0, nl).trim());
          setBody(msg.slice(nl + 1).replace(/^\n+/, '').trimEnd());
        }
        setPhase('idle');
      } else {
        setErr(d.error || tr('commit.err.generate')); setPhase('error');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('common.error')); setPhase('error');
    }
  }

  async function commit() {
    const t0 = title.trim();
    if (!t0 || busy) return;
    const message = body.trim() ? `${t0}\n\n${body.trim()}` : t0;
    setErr(null); setPhase('committing');
    ecoEmit('eco:git_busy', { bubbleId, busy: true, kind: 'commit', label: tr('commit.committing') });
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
        setTitle(''); setBody('');
        review.clearAll();
        ecoEmit('eco:git_refresh', { bubbleId });
        onCommitted?.();
      } else {
        setErr(d.error || tr('commit.err.commit')); setPhase('error');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('common.error')); setPhase('error');
    } finally {
      ecoEmit('eco:git_busy', { bubbleId, busy: false, kind: 'commit' });
    }
  }

  const fieldBase = {
    width: '100%', boxSizing: 'border-box' as const,
    background: t.bg2, border: `1px solid ${t.glassBorder}`,
    borderRadius: 6, padding: '6px 8px',
    color: t.text0, outline: 'none',
  };

  return (
    <Glass radius={10} style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: t.accentFaint, color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <IconBolt size={11}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500, color: t.text0 }}>{tr('commit.title')}</div>
          <div style={{ fontSize: 10, color: t.text3 }}>{tr('commit.sub')}</div>
        </div>
      </div>

      {phase === 'done' && commitResult && (
        <div style={{
          marginTop: 8, padding: '6px 8px', borderRadius: 6,
          background: `color-mix(in oklch, ${t.ok} 12%, transparent)`,
          color: t.ok, fontFamily: t.fontMono, fontSize: 10.5,
          whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto',
        }}>{commitResult}</div>
      )}
      {phase === 'error' && err && (
        <div style={{
          marginTop: 8, padding: '6px 8px', borderRadius: 6,
          background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
          color: t.err, fontFamily: t.fontMono, fontSize: 10.5,
          whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto',
        }}>{err}</div>
      )}

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={tr('commit.field.title')}
          disabled={phase === 'committing'}
          style={{ ...fieldBase, fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void commit(); }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={tr('commit.field.body')}
          rows={5}
          disabled={phase === 'committing'}
          style={{ ...fieldBase, fontFamily: t.fontMono, fontSize: 11, resize: 'vertical', minHeight: 64, lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => void suggest()}
            disabled={busy}
            style={{
              flex: 1, height: 26, border: 0, borderRadius: 6,
              background: t.bg3, color: t.text1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
            }}>
            {phase === 'suggesting' ? (
              <>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent, animation: 'eco-shimmer 0.9s ease-in-out infinite' }}/>
                {tr('commit.analyzing')}
              </>
            ) : (
              <><IconBolt size={11}/> {tr('commit.btn.generate')}</>
            )}
          </button>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={phase === 'committing' || !title.trim()}
            style={{
              flex: 1.3, height: 26, border: 0, borderRadius: 6,
              background: t.accent, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 600,
              cursor: (phase === 'committing' || !title.trim()) ? 'default' : 'pointer',
              opacity: (phase === 'committing' || !title.trim()) ? 0.6 : 1,
            }}>
            {phase === 'committing' ? tr('commit.committing') : tr('commit.btn.commit')}
          </button>
        </div>
      </div>
    </Glass>
  );
}
