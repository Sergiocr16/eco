import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { IconCheck, IconFile } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { DiffPane } from '@/components/DiffViewer';
import { DiscardFileButton } from '@/components/DiscardFileButton';
import { CommitWithAI } from '@/components/CommitWithAI';
import { useReviewState, isReviewModeEnabled } from '@/hooks/useReviewState';
import { useT } from '@/hooks/useI18n';
import type { Bubble } from '@/lib/types';
import { EmptyState } from './shared';
import { ResizableSplit } from './ResizableSplit';

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

// Layout estilo GitHub Desktop:
//  - Columna izquierda (~300px): lista de archivos (compacta, 1 línea/item),
//    seguida del CommitWithAI sticky abajo.
//  - Columna derecha (resto): diff persistente del archivo seleccionado.
//    Al cambiar de archivo solo se actualiza el contenido, no se cierra.
export function ChangesView({ files, workspace, bubbleId, bubble, loading }: Props) {
  const t = useTokens();
  const tr = useT();
  const review = useReviewState(bubbleId);
  const reviewMode = isReviewModeEnabled();

  // Default: primer archivo modificado. Se preserva entre renders si sigue
  // existiendo; si no, cae al primero disponible.
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (files.length === 0) { setSelected(null); return; }
    if (selected && files.some((f) => f.path === selected)) return;
    setSelected(files[0]!.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

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

  // Auto-invalidación del review state cuando el agente vuelve a editar
  // después de un accept (mismo comportamiento que el FilesPanel viejo).
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

  const pending = reviewMode ? files.filter((f) => f.unstaged !== false).length : 0;

  const splitKey = `eco.git.splitter.changes.${bubbleId}`;

  if (files.length === 0) {
    return (
      <ResizableSplit
        storageKey={splitKey}
        defaultLeft={300}
        minLeft={220}
        left={
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: t.bg1, minHeight: 0 }}>
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              <EmptyState
                message={loading ? 'Cargando…' : tr('detail.files.empty')}
                hint={loading ? undefined : 'No hay archivos modificados en el worktree.'}
              />
            </div>
            <CommitFormColumn workspace={workspace} bubbleId={bubbleId}/>
          </div>
        }
        right={
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.text3, fontSize: 12, background: t.bg0 }}>
            {loading ? 'Buscando archivos modificados…' : 'Worktree limpio'}
          </div>
        }
      />
    );
  }

  return (
    <ResizableSplit
      storageKey={splitKey}
      defaultLeft={300}
      minLeft={220}
      left={
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
          background: t.bg0,
        }}>
          {/* Header con conteo + accept all */}
          <div style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${t.glassBorder}`,
            display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <div style={{ flex: 1, fontSize: 11.5, color: t.text2, minWidth: 0 }}>
              <strong style={{ color: t.text0 }}>{files.length}</strong> {files.length === 1 ? 'archivo' : 'archivos'}
              {reviewMode && pending > 0 && (
                <span style={{ marginLeft: 6, color: t.warn }}>
                  · {pending} pendiente{pending === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {reviewMode && pending > 0 && (
              <Btn kind="ghost" size="sm" icon={IconCheck} onClick={() => void acceptAllFiles()}>
                Aceptar todos
              </Btn>
            )}
          </div>

          {/* Lista compacta */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {files.map((f) => {
              const hasUnstaged = f.unstaged !== false;
              const accepted = reviewMode && !hasUnstaged && review.isAccepted(f.path);
              const isSelected = selected === f.path;
              return (
                <FileRow
                  key={f.path}
                  file={f}
                  accepted={accepted}
                  reviewMode={reviewMode}
                  isSelected={isSelected}
                  onClick={() => setSelected(f.path)}
                  workspace={workspace}
                  bubbleId={bubbleId}
                />
              );
            })}
          </div>

          <CommitFormColumn workspace={workspace} bubbleId={bubbleId}/>
        </div>
      }
      right={
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: t.bg0 }}>
          {selected ? (
            <DiffPane
              key={selected}
              path={selected}
              workspace={workspace}
              bubbleId={bubbleId}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.text3, fontSize: 12,
            }}>
              Seleccioná un archivo
            </div>
          )}
        </div>
      }
    />
  );
}

function FileRow({ file, accepted, reviewMode, isSelected, onClick, workspace, bubbleId }: {
  file: FileChange;
  accepted: boolean;
  reviewMode: boolean;
  isSelected: boolean;
  onClick: () => void;
  workspace: string;
  bubbleId: string;
}) {
  const t = useTokens();
  const hasUnstaged = file.unstaged !== false;
  const dotColor = accepted ? t.ok : t.warn;
  // Acorta el path: si es muy largo, mostramos solo el último componente +
  // dir padre. El path completo está en el tooltip.
  const parts = file.path.split('/');
  const display = parts.length > 1
    ? <><span style={{ color: t.text3 }}>{parts.slice(0, -1).join('/')}/</span><span>{parts[parts.length - 1]}</span></>
    : file.path;

  return (
    <div
      onClick={onClick}
      title={file.path}
      style={{
        padding: '7px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        background: isSelected ? t.accentFaint : 'transparent',
        borderLeft: isSelected ? `3px solid ${t.accent}` : '3px solid transparent',
        borderBottom: `1px solid ${t.glassBorder}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = t.bg1; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
      {reviewMode && (
        <span
          title={accepted ? 'Aceptado' : 'Pendiente'}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: dotColor,
            boxShadow: accepted ? 'none' : `0 0 5px ${dotColor}`,
            flexShrink: 0,
          }}/>
      )}
      <IconFile size={12}/>
      <code style={{
        flex: 1, fontFamily: t.fontMono, fontSize: 11.5,
        color: t.text0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        minWidth: 0,
      }}>{display}</code>
      {hasUnstaged && file.change === 'created' && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: t.ok,
          padding: '1px 5px', borderRadius: 3,
          background: `color-mix(in oklch, ${t.ok} 14%, transparent)`,
        }}>+</span>
      )}
      <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
        <DiscardFileButton
          path={file.path}
          workspace={workspace}
          bubbleId={bubbleId}
          change={file.change}
        />
      </div>
    </div>
  );
}

// Commit form sticky abajo en la columna izquierda. Tiene padding extra y
// borde superior para separar visualmente.
function CommitFormColumn({ workspace, bubbleId }: { workspace: string; bubbleId: string }) {
  const t = useTokens();
  return (
    <div style={{
      padding: 10,
      borderTop: `1px solid ${t.glassBorder}`,
      background: t.bg1,
      flexShrink: 0,
    }}>
      <CommitWithAI workspace={workspace} bubbleId={bubbleId}/>
    </div>
  );
}
