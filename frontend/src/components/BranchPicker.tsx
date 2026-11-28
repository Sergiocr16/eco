import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import { IconBtn, IconTile } from '@/design/primitives';
import { IconAlert, IconBranch, IconSearch, IconX, IconCheck, IconResume, IconEdit, IconAgent, IconChevR } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { useT } from '@/hooks/useI18n';
import type { JSX } from 'react';

type BranchInfo = {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommit?: { sha: string; subject: string; author: string; relTime: string };
};

type BranchListResult = {
  current: string | null;
  detached: boolean;
  branches: BranchInfo[];
  worktree: string;
};

type Props = {
  workspace: string;
  bubbleId: string;
  // Renombra el AGENTE (la burbuja) — distinto de renombrar la rama git.
  // Lo usa el botón "usar nombre de la rama como nombre del agente".
  onRenameAgent?: (name: string) => void;
};

export function BranchPicker({ workspace, bubbleId, onRenameAgent }: Props) {
  const t = useTokens();
  const tr = useT();
  const [data, setData] = useState<BranchListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'local' | 'remote'>('local');
  const [busyBranch, setBusyBranch] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'fetch' | 'pull' | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  // Cuando el backend devuelve checkout.dirty_working_tree, abrimos este diálogo
  // para preguntar al usuario qué hacer con los cambios locales.
  const [dirtyPrompt, setDirtyPrompt] = useState<{
    branch: string;
    create: boolean;
    files: string[];
  } | null>(null);

  const refresh = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      const r = await apiFetch(`/git/branches?${params}`);
      if (r.ok) {
        const d = await r.json() as BranchListResult;
        setData(d);
      } else {
        setActionMsg({ kind: 'err', text: `HTTP ${r.status}` });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, bubbleId]);

  // Refresh externo cuando algo cambia el estado git por fuera del picker
  // (ej. checkout de un PR desde PullRequestsList).
  useEffect(() => {
    return ecoOn('eco:git_refresh', (e) => {
      if (e.bubbleId !== bubbleId) return;
      void refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleId]);

  useEffect(() => {
    if (!expanded) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
    };
    const iv = setInterval(tick, 20_000);
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function doRename() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setActionMsg(null);
    try {
      const r = await apiFetch('/git/rename-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, newName: trimmed }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setActionMsg({ kind: 'ok', text: d.message || tr('branch.rename_ok') });
        setRenaming(false); setNewName('');
        await refresh();
      } else {
        setActionMsg({ kind: 'err', text: d.error || tr('branch.rename_fail') });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    }
  }

  async function run(action: 'checkout' | 'pull' | 'fetch', branch?: string, create = false, mode: 'plain' | 'carry' | 'discard' = 'plain') {
    if (action === 'checkout' && !branch) return;
    setActionMsg(null);
    if (action === 'checkout' && branch) setBusyBranch(branch);
    else setBusyAction(action as 'fetch' | 'pull');
    try {
      const body: Record<string, unknown> = { workspace, bubbleId };
      if (action === 'checkout') { body.branch = branch; body.create = create; body.mode = mode; }
      const r = await apiFetch(`/git/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setActionMsg({ kind: 'ok', text: d.message || tr('common.ok') });
        await refresh();
        // Notificamos a CurrentPrBanner + PullRequestsList + FilesPanel etc.
        // que el estado git cambió: rama nueva implica posiblemente otro PR
        // asociado y otra lista de cambios. Sin esto, el banner del PR no se
        // refresca hasta que el user colapse/expanda la sección Git.
        ecoEmit('eco:git_refresh', { bubbleId });
      } else if (action === 'checkout' && d.code === 'checkout.dirty_working_tree' && branch) {
        // No mostramos el error: abrimos el diálogo para que el user decida.
        setDirtyPrompt({
          branch,
          create,
          files: Array.isArray(d.files) ? d.files : [],
        });
      } else {
        setActionMsg({ kind: 'err', text: d.error || tr('branch.action_fail', { action }) });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusyBranch(null);
      setBusyAction(null);
    }
  }

  const filtered = useMemo(() => {
    const list = data?.branches ?? [];
    const wantRemote = tab === 'remote';
    const base = list.filter((b) => b.isRemote === wantRemote);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((b) =>
      b.name.toLowerCase().includes(q) ||
      (b.lastCommit?.subject ?? '').toLowerCase().includes(q),
    );
  }, [data, tab, query]);

  const currentBranch = data?.current ?? null;
  const currentInfo = data?.branches.find((b) => b.isCurrent);
  const noRepo = !!data && data.branches.length === 0 && !data.current;

  return (
    <div className="eco-card eco-card--sm" style={{ padding: 12 }}>
      {/* Header compacto */}
      {renaming && !noRepo ? (
        <div className="eco-hstack" style={{ gap: 6 }}>
          <IconTile icon={IconBranch} size="sm" accent/>
          <input
            autoFocus
            className="eco-field eco-field--sm eco-field--mono"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={tr('branch.placeholder_new')}
            style={{ flex: 1, minWidth: 0, width: 'auto' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doRename();
              if (e.key === 'Escape') { setRenaming(false); setNewName(''); }
            }}
          />
          <button type="button" className="eco-iconbtn eco-iconbtn--raised" onClick={() => void doRename()}
            title={tr('branch.save_tooltip')} style={{ color: t.accent }}>
            <IconCheck size={14}/>
          </button>
          <button type="button" className="eco-iconbtn" onClick={() => { setRenaming(false); setNewName(''); }}
            title={tr('branch.cancel_tooltip')}>
            <IconX size={14}/>
          </button>
        </div>
      ) : (
        <div className="eco-hstack" style={{ gap: 4 }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            disabled={noRepo}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              padding: 0, border: 0, background: 'transparent',
              cursor: noRepo ? 'default' : 'pointer',
              color: t.text0, textAlign: 'left', minWidth: 0, font: 'inherit',
            }}>
            <IconTile icon={IconBranch} size="sm" accent/>
            <div className="eco-grow">
              <div className="eco-mono eco-truncate" style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>
                {loading && !data ? '…' : (currentBranch ?? (noRepo ? tr('branch.no_repo') : tr('common.empty_dash')))}
              </div>
              {(currentInfo || (data && data.branches.length > 0)) && (
                <div className="eco-sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {currentInfo?.ahead != null && currentInfo.ahead > 0 && (
                    <span className="eco-mono" style={{ color: t.ok }}>↑{currentInfo.ahead}</span>
                  )}
                  {currentInfo?.behind != null && currentInfo.behind > 0 && (
                    <span className="eco-mono" style={{ color: t.warn }}>↓{currentInfo.behind}</span>
                  )}
                  <span>{tr('branch.branches_count', { n: data!.branches.length })}</span>
                </div>
              )}
            </div>
            {!noRepo && (
              <span style={{
                color: t.text2, display: 'inline-flex', flexShrink: 0,
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 180ms ease',
              }}><IconChevR size={15}/></span>
            )}
          </button>
          {!noRepo && currentBranch && (
            <>
              {/* Renombrar el AGENTE con el nombre de la rama actual. Útil
                  para que el título de la burbuja matchee su branch sin
                  tipear. Distinto del lápiz de al lado (renombra la rama). */}
              {onRenameAgent && (
                <button
                  type="button"
                  className="eco-iconbtn"
                  onClick={() => onRenameAgent(currentBranch)}
                  title={tr('branch.rename_agent_tooltip', { name: currentBranch })}>
                  <IconAgent size={14}/>
                </button>
              )}
              <button
                type="button"
                className="eco-iconbtn"
                onClick={() => { setNewName(currentBranch); setRenaming(true); }}
                title={tr('branch.rename_branch_tooltip')}>
                <IconEdit size={14}/>
              </button>
            </>
          )}
        </div>
      )}

      {/* Acciones Fetch / Pull en un toolbar compacto */}
      {!noRepo && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <ToolbarBtn icon={IconResume} loading={busyAction === 'fetch'} onClick={() => void run('fetch')}>
            {tr('branch.fetch')}
          </ToolbarBtn>
          <ToolbarBtn primary loading={busyAction === 'pull'} onClick={() => void run('pull')}>
            {tr('branch.pull')}
          </ToolbarBtn>
        </div>
      )}

      {/* Mensaje de acción */}
      <AnimatePresence>
        {actionMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.16 }}
            style={{
              overflow: 'hidden',
            }}>
            <div className={`eco-banner eco-mono ${actionMsg.kind === 'ok' ? 'eco-banner--ok' : 'eco-banner--err'}`} style={{
              flexWrap: 'nowrap', alignItems: 'flex-start', gap: 6, fontSize: 11.5,
              maxHeight: 90, overflow: 'auto',
              wordBreak: 'break-word',
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                {actionMsg.kind === 'ok' ? <IconCheck size={12}/> : '!'}
              </span>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap', minWidth: 0 }}>{actionMsg.text}</span>
              <button type="button" onClick={() => setActionMsg(null)}
                style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex' }}>
                <IconX size={12}/>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel expandido */}
      <AnimatePresence initial={false}>
        {expanded && !noRepo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}>
            <div style={{
              marginTop: 10,
              borderTop: `1px solid ${t.line}`,
              paddingTop: 10,
            }}>
              {/* Búsqueda */}
              <div className="eco-inputbar eco-inputbar--sm" style={{ marginBottom: 8 }}>
                <IconSearch size={14}/>
                <input
                  className="eco-input-bare eco-mono"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tr('branch.search_placeholder')}
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')}
                    style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <IconX size={13}/>
                  </button>
                )}
              </div>
              {/* Tabs local / remoto */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <SubTab active={tab === 'local'} onClick={() => setTab('local')}>
                  {tr('branch.tab.local')} {data ? `· ${data.branches.filter((b) => !b.isRemote).length}` : ''}
                </SubTab>
                <SubTab active={tab === 'remote'} onClick={() => setTab('remote')}>
                  {tr('branch.tab.remote')} {data ? `· ${data.branches.filter((b) => b.isRemote).length}` : ''}
                </SubTab>
              </div>
              {/* Lista */}
              <div style={{
                maxHeight: 220, overflow: 'auto',
                display: 'flex', flexDirection: 'column', gap: 1,
              }}>
                {loading && !data ? (
                  <div className="eco-empty" style={{ padding: 12 }}>{tr('common.loading')}</div>
                ) : filtered.length === 0 ? (
                  <div className="eco-empty" style={{ padding: 12 }}>
                    {query ? tr('branch.list.empty_match') : (tab === 'local' ? tr('branch.list.empty_local') : tr('branch.list.empty_remote'))}
                  </div>
                ) : (
                  filtered.map((b) => (
                    <BranchRow
                      key={b.name}
                      branch={b}
                      busy={busyBranch === b.name}
                      onClick={() => void run('checkout', b.name)}
                    />
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diálogo de conflicto: cambios sin commitear bloquean el checkout. */}
      <AnimatePresence>
        {dirtyPrompt && (
          <DirtyChangesDialog
            branch={dirtyPrompt.branch}
            files={dirtyPrompt.files}
            onCancel={() => setDirtyPrompt(null)}
            onCarry={async () => {
              const p = dirtyPrompt;
              setDirtyPrompt(null);
              await run('checkout', p.branch, p.create, 'carry');
            }}
            onDiscard={async () => {
              const p = dirtyPrompt;
              setDirtyPrompt(null);
              await run('checkout', p.branch, p.create, 'discard');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DirtyChangesDialog({
  branch, files, onCancel, onCarry, onDiscard,
}: {
  branch: string;
  files: string[];
  onCancel: () => void;
  onCarry: () => void;
  onDiscard: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Portal a <body> para esquivar contenedores con transform/filter que
  // capturarían el position:fixed y lo posicionarían respecto a ellos en
  // lugar del viewport.
  return createPortal((
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="eco-scrim"
      style={{ zIndex: 9999 }}
      onClick={onCancel}>
      <motion.div
        initial={{ scale: 0.96, y: 6 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 6 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="eco-dialog"
        style={{ maxWidth: 520, animation: 'none' }}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile" style={{
            background: `color-mix(in oklab, ${t.warn} 16%, transparent)`, color: t.warn,
          }}><IconAlert size={20}/></span>
          <h2 className="eco-dialog__title">{tr('branch.dirty.title')}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body">{tr('branch.dirty.body', { branch })}</div>

        {files.length > 0 && (
          <div className="eco-dialog__section">
            <div className="eco-field-label">
              {files.length === 1 ? tr('branch.dirty.files_count_one', { n: files.length }) : tr('branch.dirty.files_count_many', { n: files.length })}
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 14,
              background: t.card,
              maxHeight: 140, overflowY: 'auto',
            }}>
              {files.map((f) => (
                <div key={f} className="eco-mono eco-truncate eco-muted" style={{ fontSize: 12, padding: '2px 0' }}>{f}</div>
              ))}
            </div>
          </div>
        )}

        <div className="eco-optlist">
          {/* Opción: llevar */}
          <button type="button" onClick={onCarry} className="eco-option">
            <span className="eco-option__text">
              <span style={{ fontWeight: 500, color: t.accent }}>
                {tr('branch.dirty.carry.title', { branch })}
              </span>
              <span className="eco-sub">{tr('branch.dirty.carry.desc')}</span>
            </span>
          </button>

          {/* Opción: descartar (con doble confirmación) */}
          <button type="button"
            onClick={() => {
              if (confirmDiscard) { onDiscard(); return; }
              setConfirmDiscard(true);
            }}
            className="eco-option"
            style={confirmDiscard ? {
              borderColor: t.err, background: `color-mix(in oklab, ${t.err} 13%, transparent)`,
            } : undefined}>
            <span className="eco-option__text">
              <span style={{ fontWeight: 500, color: confirmDiscard ? t.err : t.text0 }}>
                {confirmDiscard ? tr('branch.dirty.discard.title_confirm') : tr('branch.dirty.discard.title', { branch })}
              </span>
              <span className="eco-sub">
                {confirmDiscard
                  ? tr('branch.dirty.discard.desc_confirm')
                  : tr('branch.dirty.discard.desc')}
              </span>
            </span>
          </button>
        </div>

        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  ), document.body);
}

function ToolbarBtn({
  icon: Icon, primary, loading, onClick, children,
}: {
  icon?: (p: { size?: number }) => JSX.Element;
  primary?: boolean;
  loading?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`eco-btn eco-btn--xs ${primary ? 'eco-btn--primary' : 'eco-btn--raised'}`}
      style={{ flex: 1, ...(loading ? { cursor: 'wait' } : null) }}>
      {Icon && !loading && <Icon size={13}/>}
      {loading && <span className="eco-spinner" style={{ width: 10, height: 10, borderColor: 'currentColor', borderTopColor: 'transparent' }}/>}
      <span>{children}</span>
    </button>
  );
}

function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`eco-subtab${active ? ' is-on' : ''}`}
      style={{ fontSize: 12.5 }}>{children}</button>
  );
}

function BranchRow({
  branch, busy, onClick,
}: {
  branch: BranchInfo;
  busy: boolean;
  onClick: () => void;
}) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={branch.isCurrent || busy}
      className={`eco-nav-item eco-nav-item--sm${branch.isCurrent ? ' is-on' : ''}`}
      style={{
        flex: 'none', gap: 8, padding: '0 8px',
        cursor: (branch.isCurrent || busy) ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}>
      <span style={{
        width: 14, flexShrink: 0, display: 'flex', justifyContent: 'center',
        color: branch.isCurrent ? t.accent : t.text3,
      }}>
        {branch.isCurrent ? <IconCheck size={13}/> : <IconBranch size={13}/>}
      </span>
      <span className="eco-mono eco-truncate" style={{ flex: 1, fontSize: 12, fontWeight: branch.isCurrent ? 500 : 400 }}>{branch.name}</span>
      {branch.ahead != null && branch.ahead > 0 && (
        <span className="eco-mono" style={{ fontSize: 11.5, color: t.ok, flexShrink: 0 }}>↑{branch.ahead}</span>
      )}
      {branch.behind != null && branch.behind > 0 && (
        <span className="eco-mono" style={{ fontSize: 11.5, color: t.warn, flexShrink: 0 }}>↓{branch.behind}</span>
      )}
    </button>
  );
}
