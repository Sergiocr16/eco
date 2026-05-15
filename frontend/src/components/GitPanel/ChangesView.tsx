import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, Pill, SectionLabel } from '@/design/primitives';
import { IconCheck, IconFile } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { DiffPane } from '@/components/DiffViewer';
import { DiscardFileButton } from '@/components/DiscardFileButton';
import { CommitWithAI } from '@/components/CommitWithAI';
import { useReviewState, isReviewModeEnabled } from '@/hooks/useReviewState';
import { useT } from '@/hooks/useI18n';
import type { Bubble } from '@/lib/types';

export type FileChange = {
  path: string;
  change: string;
  unstaged?: boolean;
};

type Props = {
  files: FileChange[];
  workspace: string;
  bubbleId: string;
  bubble: Bubble;
  loading?: boolean;
};

export function ChangesView({ files, workspace, bubbleId, bubble, loading }: Props) {
  const t = useTokens();
  const tr = useT();
  const review = useReviewState(bubbleId);
  const reviewMode = isReviewModeEnabled();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  async function acceptAllFiles() {
    const paths = files.map((f) => f.path);
    const results = await Promise.all(paths.map(async (p) => {
      try {
        const r = await apiFetch('/file/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p, workspace, bubbleId }),
        });
        const data = await r.json().catch(() => ({}));
        return { path: p, ok: r.ok && data.ok === true };
      } catch { return { path: p, ok: false }; }
    }));
    const okPaths = results.filter((r) => r.ok).map((r) => r.path);
    if (okPaths.length > 0) review.acceptAll(okPaths);
    ecoEmit('eco:git_refresh', { bubbleId });
  }

  // Si el agente edita un archivo DESPUÉS de que el user lo aceptó,
  // desmarcamos automáticamente. Comparamos createdAt del message contra
  // acceptedAt(path). Sobrevive re-mounts y re-entradas porque ambos
  // viven en localStorage.
  useEffect(() => {
    let sawNewEdit = false;
    for (const m of bubble.messages) {
      for (const tc of m.toolCalls ?? []) {
        if (tc.status !== 'success') continue;
        if (tc.name !== 'Write' && tc.name !== 'Edit' && tc.name !== 'MultiEdit' && tc.name !== 'NotebookEdit') continue;
        const filePath = (tc.input as { file_path?: unknown }).file_path;
        if (typeof filePath !== 'string' || !filePath) continue;
        const acceptedAt = review.acceptedAt(filePath);
        if (acceptedAt === 0) continue;
        if (m.createdAt > acceptedAt) {
          review.unaccept(filePath);
          sawNewEdit = true;
        }
      }
    }
    if (sawNewEdit) ecoEmit('eco:git_refresh', { bubbleId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubble.messages]);

  if (files.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32, color: t.text2, fontSize: 13,
        flexDirection: 'column', gap: 10,
      }}>
        {loading ? (
          <>
            <span style={{
              width: 18, height: 18, borderRadius: '50%',
              border: `2px solid ${t.glassBorder}`,
              borderTopColor: t.accent,
              animation: 'eco-spin 0.8s linear infinite',
              display: 'inline-block',
            }}/>
            <span>Buscando archivos modificados…</span>
          </>
        ) : (
          tr('detail.files.empty')
        )}
      </div>
    );
  }

  // Pendiente = hay unstaged en git. Es la fuente de verdad: el review
  // local (acceptedAt) solo es hint visual cuando no hay unstaged.
  const pending = reviewMode
    ? files.filter((f) => f.unstaged !== false).length
    : 0;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <CommitWithAI workspace={workspace} bubbleId={bubbleId} />
      </div>

      {reviewMode && pending > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', marginBottom: 12,
          borderRadius: 10,
          background: `color-mix(in oklch, ${t.warn} 8%, transparent)`,
          border: `1px solid color-mix(in oklch, ${t.warn} 50%, transparent)`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: t.warn,
            boxShadow: `0 0 6px ${t.warn}`,
            flexShrink: 0,
          }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: t.text0, fontWeight: 600 }}>
              {pending} {pending === 1 ? 'cambio pendiente' : 'cambios pendientes'} de revisión
            </div>
            <div style={{ fontSize: 11, color: t.text2, marginTop: 2 }}>
              Click en un archivo para ver el diff y aceptar/rechazar inline.
            </div>
          </div>
          <Btn kind="primary" size="sm" icon={IconCheck} onClick={() => void acceptAllFiles()}>
            Aceptar todos
          </Btn>
        </div>
      )}
      <SectionLabel count={files.length}>{tr('detail.files.modified')}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.map((f, i) => {
          const hasUnstaged = f.unstaged !== false;
          const accepted = reviewMode && !hasUnstaged && review.isAccepted(f.path);
          const dotColor = accepted ? t.ok : t.warn;
          const isOpen = expanded.has(f.path);
          return (
            <div key={i} style={{
              borderRadius: 12,
              border: `1px solid ${isOpen ? t.accent : t.glassBorder}`,
              background: t.bg2,
              overflow: 'hidden',
              transition: 'border-color 140ms',
            }}>
              <button type="button"
                onClick={() => toggleExpand(f.path)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 14, border: 0,
                  background: 'transparent',
                  color: t.text0, cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{
                  width: 18, height: 18,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: t.text2,
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 160ms ease',
                  flexShrink: 0,
                  fontFamily: 'monospace', fontSize: 14, fontWeight: 600,
                }}>›</span>
                {reviewMode && (
                  <span
                    title={accepted ? 'Aceptado' : 'Pendiente de revisión'}
                    style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: dotColor,
                      boxShadow: accepted ? 'none' : `0 0 6px ${dotColor}`,
                      flexShrink: 0,
                    }}/>
                )}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: t.bg3, color: t.text1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}><IconFile size={16}/></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: t.fontMono, fontSize: 13, color: t.text0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{f.path}</div>
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Pill color={f.change === 'created' ? t.ok : t.accent}>
                      {f.change === 'created' ? tr('detail.files.created') : tr('detail.files.modified_one')}
                    </Pill>
                    {accepted && (
                      <Pill color={t.ok}>Revisado</Pill>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}>
                  <DiscardFileButton
                    path={f.path}
                    workspace={workspace}
                    bubbleId={bubbleId}
                    change={f.change}
                  />
                </div>
              </button>

              {isOpen && (
                <div style={{
                  borderTop: `1px solid ${t.glassBorder}`,
                  maxHeight: '70vh',
                  display: 'flex', flexDirection: 'column',
                  background: t.bg0,
                }}>
                  <DiffPane
                    path={f.path}
                    workspace={workspace}
                    bubbleId={bubbleId}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
