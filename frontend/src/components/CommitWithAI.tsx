import { useState } from 'react';
import { Btn, IconTile } from '@/design/primitives';
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

  const cantCommit = phase === 'committing' || !title.trim();

  return (
    <div className="eco-vstack" style={{ gap: 8 }}>
      <div className="eco-hstack">
        <IconTile icon={IconBolt} size="sm" accent/>
        <div className="eco-grow">
          <div className="eco-label">{tr('commit.title')}</div>
          <div className="eco-sub">{tr('commit.sub')}</div>
        </div>
      </div>

      {phase === 'done' && commitResult && (
        <div className="eco-banner eco-banner--ok eco-mono" style={{
          display: 'block', fontSize: 11.5, whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto',
        }}>{commitResult}</div>
      )}
      {phase === 'error' && err && (
        <div className="eco-banner eco-banner--err eco-mono" style={{
          display: 'block', fontSize: 11.5, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto',
        }}>{err}</div>
      )}

      <input
        className="eco-field eco-field--sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={tr('commit.field.title')}
        disabled={phase === 'committing'}
        style={{ fontWeight: 500 }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void commit(); }}
      />
      <textarea
        className="eco-field eco-field--mono"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={tr('commit.field.body')}
        rows={5}
        disabled={phase === 'committing'}
        style={{ minHeight: 64 }}
      />
      <div className="eco-hstack" style={{ gap: 8 }}>
        <Btn kind="raised" size="sm" onClick={() => void suggest()} disabled={busy}
          icon={phase === 'suggesting' ? undefined : IconBolt}
          style={{ flex: 1, minWidth: 0 }}>
          {phase === 'suggesting' ? (
            <>
              <span className="eco-dot eco-dot--accent" style={{ animation: 'eco-shimmer 0.9s ease-in-out infinite' }}/>
              {tr('commit.analyzing')}
            </>
          ) : tr('commit.btn.generate')}
        </Btn>
        <Btn kind="primary" size="sm" onClick={() => void commit()} disabled={cantCommit}
          style={{ flex: 1.3, minWidth: 0 }}>
          {phase === 'committing' ? tr('commit.committing') : tr('commit.btn.commit')}
        </Btn>
      </div>
    </div>
  );
}
