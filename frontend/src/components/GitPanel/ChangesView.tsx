import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, IconBtn } from '@/design/primitives';
import { IconCheck, IconFile, IconFolderOpen, IconTrash, IconAlert, IconX } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { DiffPane } from '@/components/DiffViewer';
import { DiscardFileButton } from '@/components/DiscardFileButton';
import { CommitWithAI } from '@/components/CommitWithAI';
import { useReviewState, isReviewModeEnabled } from '@/hooks/useReviewState';
import { useT } from '@/hooks/useI18n';
import { useIsPhone } from '@/hooks/useMediaQuery';
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
  loading?: boolean;
};

// Layout estilo GitHub Desktop:
//  - Columna izquierda (~300px): lista de archivos (compacta, 1 línea/item),
//    seguida del CommitWithAI sticky abajo.
//  - Columna derecha (resto): diff persistente del archivo seleccionado.
//    Al cambiar de archivo solo se actualiza el contenido, no se cierra.
export function ChangesView({ files, workspace, bubbleId, loading }: Props) {
  const t = useTokens();
  const tr = useT();
  const review = useReviewState(bubbleId);
  const reviewMode = isReviewModeEnabled();

  // Persistimos el archivo seleccionado por bubble — al volver al tab Git
  // arranca con el último archivo que estabas viendo. Si ese archivo ya no
  // está en la lista actual (porque se commiteó/descartó), cae al primero.
  const [selected, setSelected] = useState<string | null>(() => {
    try { return localStorage.getItem(`eco.git.selected_file.${bubbleId}`); }
    catch { return null; }
  });
  useEffect(() => {
    try {
      if (selected) localStorage.setItem(`eco.git.selected_file.${bubbleId}`, selected);
      else localStorage.removeItem(`eco.git.selected_file.${bubbleId}`);
    } catch { /* noop */ }
  }, [selected, bubbleId]);
  useEffect(() => {
    // Mientras cargamos no tocamos `selected` — si lo resetábamos a null
    // acá durante el primer fetch (files arranca vacío) borrábamos la
    // persistencia del archivo que el user estaba viendo al volver al tab.
    if (loading) return;
    if (files.length === 0) { setSelected(null); return; }
    if (selected && files.some((f) => f.path === selected)) return;
    setSelected(files[0]!.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, loading]);

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

  // Discard all: descarta TODOS los cambios sin commit del worktree. No es
  // reversible — el confirm dialog lo hace explícito antes de ejecutar.
  const [discardAllOpen, setDiscardAllOpen] = useState(false);
  async function discardAllFiles() {
    const paths = files.map((f) => f.path);
    await Promise.all(paths.map(async (p) => {
      try {
        await apiFetch('/file/discard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p, workspace, bubbleId }),
        });
      } catch { /* noop — el refresh trae el estado real */ }
    }));
    review.clearAll();
    ecoEmit('eco:git_refresh', { bubbleId });
  }

  // La auto-invalidación por `bubble.messages` (tool-calls Write/Edit del chat)
  // se removió con el tab de Conversación. No hace falta: el dot verde exige
  // `accepted ∧ ¬hasUnstaged`, y `git status --porcelain` vuelve a marcar el
  // archivo como unstaged apenas el agente lo re-edita desde el PTY.

  const pending = reviewMode ? files.filter((f) => f.unstaged !== false).length : 0;

  const splitKey = `eco.git.splitter.changes.${bubbleId}`;

  if (files.length === 0) {
    // Sin archivos modificados: NO usamos el split (esa columnita de 300 px
    // hacía que el mensaje quedara visualmente descentrado contra el resto
    // del panel). Mostramos el EmptyState ocupando todo el ancho del tab.
    // Tampoco mostramos el commit form — sin diff no hay nada para commitear.
    return (
      <div className="eco-vstack eco-muted" style={{
        flex: 1, alignItems: 'center', justifyContent: 'center',
        minHeight: 0, padding: 40, gap: 10,
      }}>
        {loading ? (
          <>
            <span className="eco-spinner" style={{ width: 22, height: 22 }}/>
            <div>{tr('git.changes.searching')}</div>
          </>
        ) : (
          <>
            <div className="eco-label eco-muted">{tr('detail.files.empty')}</div>
            <div className="eco-sub" style={{ maxWidth: 380, textAlign: 'center' }}>
              {tr('git.changes.empty_detail')}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
    <ResizableSplit
      storageKey={splitKey}
      defaultLeft={300}
      minLeft={220}
      mobileShow={selected ? 'right' : 'left'}
      left={
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Header con conteo + accept all */}
          <div className="eco-hstack eco-hstack--wrap" style={{ padding: '12px 16px 8px', gap: '6px 8px', flexShrink: 0 }}>
            <div className="eco-muted" style={{ flex: '1 1 120px', minWidth: 0 }}>
              <strong style={{ color: t.text0, fontWeight: 600 }}>{files.length}</strong> {files.length === 1 ? tr('git.changes.file_one') : tr('git.changes.file_many')}
            </div>
            {files.length > 0 && (
              <Btn kind="danger" size="sm" icon={IconTrash} onClick={() => setDiscardAllOpen(true)}>
                {tr('git.changes.discard_all')}
              </Btn>
            )}
          </div>
          {reviewMode && pending > 0 && (
            <div className="eco-banner eco-banner--warn" style={{ margin: '0 12px 8px', flexShrink: 0 }}>
              <span className="eco-dot eco-dot--warn"/>
              <span style={{ flex: 1, minWidth: 0 }}>
                {pending} {pending === 1 ? tr('git.changes.pending_one') : tr('git.changes.pending_many')}
              </span>
              <Btn kind="raised" size="sm" icon={IconCheck} onClick={() => void acceptAllFiles()}>
                {tr('git.changes.accept_all')}
              </Btn>
            </div>
          )}

          {/* Lista compacta */}
          <div style={{
            flex: 1, overflow: 'auto', minHeight: 0, padding: '0 8px 8px',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {selected ? (
            <DiffPane
              key={selected}
              path={selected}
              workspace={workspace}
              bubbleId={bubbleId}
            />
          ) : (
            <div className="eco-sub" style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {tr('git.changes.pick_file')}
            </div>
          )}
        </div>
      }
    />
    {discardAllOpen && (
      <DiscardAllDialog
        count={files.length}
        onCancel={() => setDiscardAllOpen(false)}
        onConfirm={async () => { setDiscardAllOpen(false); await discardAllFiles(); }}
      />
    )}
    </>
  );
}

function DiscardAllDialog({ count, onCancel, onConfirm }: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tr = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="eco-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="eco-dialog eco-dialog--sm eco-dialog--danger">
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile eco-dialog__tile--danger"><IconAlert size={20}/></span>
          <h2 className="eco-dialog__title">{tr('git.changes.discard_all_title')}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body">
          {count === 1
            ? tr('git.changes.discard_all_body_one')
            : tr('git.changes.discard_all_body_many', { n: count })}
        </div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--danger-solid" onClick={onConfirm}>
              {tr('git.changes.discard_all')}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const tr = useT();
  const isPhone = useIsPhone();
  const hasUnstaged = file.unstaged !== false;
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
      className={`eco-nav-item${isSelected ? ' is-on' : ''}`}
      style={{ flex: 'none', gap: 8, padding: '0 6px 0 12px', userSelect: 'none', fontWeight: 400 }}>
      {reviewMode && (
        <span
          title={accepted ? tr('git.changes.dot.accepted') : tr('git.changes.dot.pending')}
          className={`eco-dot eco-dot--lg ${accepted ? 'eco-dot--ok' : 'eco-dot--warn'}`}/>
      )}
      <IconFile size={13}/>
      <code className="eco-mono eco-truncate" style={{ flex: 1, fontSize: 12, color: t.text0 }}>{display}</code>
      {hasUnstaged && file.change === 'created' && (
        <span className="eco-chip eco-chip--ok eco-mono" style={{ padding: '0 7px', fontSize: 11.5, fontWeight: 600 }}>+</span>
      )}
      {/* En teléfono se esconde abrir-en-editor: queda un toque más lejos,
          desde el propio panel de Files. */}
      {!isPhone && (
        <button
          type="button"
          className="eco-iconbtn eco-iconbtn--xs"
          onClick={(e) => {
            e.stopPropagation();
            ecoEmit('eco:switch_tab', { tab: 'files', bubbleId });
            ecoEmit('eco:files:open_path', { bubbleId, path: file.path });
          }}
          title={tr('files.open_in_editor')}
          aria-label={tr('files.open_in_editor')}
        >
          <IconFolderOpen size={13}/>
        </button>
      )}
      <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex' }}>
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
    <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${t.line}`, flexShrink: 0 }}>
      <CommitWithAI workspace={workspace} bubbleId={bubbleId}/>
    </div>
  );
}
