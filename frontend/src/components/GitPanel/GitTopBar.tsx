import { vh, vw } from '@/lib/ui-zoom';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTokens } from '@/design/theme';
import { IconBtn, Segmented } from '@/design/primitives';
import { IconBranch, IconMore, IconResume, IconGlobe, IconEdit, IconTrash, IconCheck, IconSearch, IconAgent, IconChevD, IconRotateCw, IconX } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useBranches, type BranchInfo } from '@/hooks/useBranches';
import { useT } from '@/hooks/useI18n';
import { useIsPhone } from '@/hooks/useMediaQuery';
import { BranchTakeoverDialog, branchHolderFrom, type BranchHolderInfo } from './BranchTakeoverDialog';

type Props = {
  workspace: string;
  bubbleId: string;
  onOpenPRs: () => void;
  onRenameAgent?: (name: string) => void;
};

// Top bar persistente del tab Git. Vive ADENTRO del GitPanel — solo se ve
// cuando estás en ese tab. Tres bloques:
//  - Branch dropdown (izq): chip rama actual, click abre selector buscable
//    con local + remote. Click sobre una hace checkout (reuso /git/checkout).
//  - Sync button (centro): muestra ahead/behind. Click hace pull+push según
//    corresponda. Si solo hay ahead → Push. Solo behind → Pull. Ambos → Sync
//    (fetch + pull + push).
//  - Menú "⋯" (der): Renombrar rama, Borrar rama, Merge into current, abrir PRs.
export function GitTopBar({ workspace, bubbleId, onOpenPRs, onRenameAgent }: Props) {
  const tr = useT();
  const isPhone = useIsPhone();
  const { data, refresh: refreshBranches } = useBranches(workspace, bubbleId);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // La rama elegida en el dropdown la tiene otro worktree: preguntamos si traerla.
  const [takeover, setTakeover] = useState<{ branch: string; holder: BranchHolderInfo } | null>(null);
  const [takeoverBusy, setTakeoverBusy] = useState(false);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(id);
  }, [msg]);

  const current = data?.branches.find((b) => b.isCurrent) ?? null;
  const branchName = data?.current ?? tr('common.empty_dash');
  const detached = data?.detached ?? false;
  const ahead = current?.ahead ?? 0;
  const behind = current?.behind ?? 0;
  const hasRemote = !!current?.upstream;

  // Etiqueta + acción del sync button según ahead/behind.
  // - sin upstream: "Publish" (push --set-upstream)
  // - ahead solo: "Push" (push)
  // - behind solo: "Pull" (pull --ff-only)
  // - ambos: "Sync" (pull → push)
  // - en sync: "Fetch" (refresca info remota)
  let syncLabel = tr('git.action.label_fetch');
  let syncAction: 'fetch' | 'pull' | 'push' | 'sync' | 'publish' = 'fetch';
  if (!hasRemote && !detached) { syncLabel = tr('git.action.label_publish'); syncAction = 'publish'; }
  else if (ahead > 0 && behind > 0) { syncLabel = tr('git.action.label_sync'); syncAction = 'sync'; }
  else if (ahead > 0) { syncLabel = tr('git.action.label_push'); syncAction = 'push'; }
  else if (behind > 0) { syncLabel = tr('git.action.label_pull'); syncAction = 'pull'; }

  async function callBackend(path: string, body: object): Promise<{ ok: boolean; error?: string; message?: string }> {
    try {
      const r = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, ...body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return { ok: false, error: d.error || `HTTP ${r.status}` };
      return { ok: true, message: d.message };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : tr('common.error') };
    }
  }

  async function doSync() {
    setBusy('sync'); setMsg(null);
    // Etiqueta del toast global según la acción real que se va a ejecutar.
    const busyLabel = syncAction === 'fetch' ? tr('git.action.label_fetch')
      : syncAction === 'pull' ? tr('git.action.label_pull')
      : syncAction === 'push' ? tr('git.action.label_push')
      : syncAction === 'sync' ? tr('git.action.label_sync')
      : tr('git.action.label_publish');
    ecoEmit('eco:git_busy', { bubbleId, busy: true, kind: syncAction, label: busyLabel });
    try {
      if (syncAction === 'fetch') {
        const r = await callBackend('/git/fetch', {});
        setMsg(r.ok ? { kind: 'ok', text: r.message ?? tr('git.topbar.sync.fetch_ok') } : { kind: 'err', text: r.error ?? tr('common.error') });
      } else if (syncAction === 'pull') {
        const r = await callBackend('/git/pull', {});
        setMsg(r.ok ? { kind: 'ok', text: r.message ?? tr('git.topbar.sync.pull_ok') } : { kind: 'err', text: r.error ?? tr('common.error') });
      } else if (syncAction === 'push' || syncAction === 'publish') {
        const r = await callBackend('/git/push', {});
        setMsg(r.ok ? { kind: 'ok', text: r.message ?? tr('git.topbar.sync.push_ok') } : { kind: 'err', text: r.error ?? tr('common.error') });
      } else if (syncAction === 'sync') {
        const pullR = await callBackend('/git/pull', {});
        if (!pullR.ok) { setMsg({ kind: 'err', text: tr('git.topbar.sync.pull_fail', { err: pullR.error ?? '' }) }); return; }
        const pushR = await callBackend('/git/push', {});
        setMsg(pushR.ok ? { kind: 'ok', text: tr('git.topbar.sync.sync_ok') } : { kind: 'err', text: tr('git.topbar.sync.push_fail', { err: pushR.error ?? '' }) });
      }
      ecoEmit('eco:git_refresh', { bubbleId });
      refreshBranches();
    } finally {
      setBusy(null);
      ecoEmit('eco:git_busy', { bubbleId, busy: false, kind: syncAction });
    }
  }

  async function takeOverBranch(branch: string, holderPath: string) {
    setTakeoverBusy(true);
    try {
      const r = await apiFetch('/git/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, branch, takeOverFrom: holderPath }),
      });
      const d = await r.json().catch(() => ({}));
      const holder = branchHolderFrom(d);
      if (holder) { setTakeover({ branch, holder }); return; }
      setTakeover(null);
      if (!r.ok || !d.ok) {
        const hint = d.code === 'checkout.dirty_working_tree' ? tr('git.cherry.dirty_hint') : '';
        setMsg({ kind: 'err', text: (d.error || `HTTP ${r.status}`) + hint });
        return;
      }
      ecoEmit('eco:git_refresh', { bubbleId });
      refreshBranches();
    } catch (e) {
      setTakeover(null);
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setTakeoverBusy(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: isPhone ? '8px 10px' : '12px 16px 8px',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Branch dropdown */}
      <BranchChip
        branchName={branchName}
        detached={detached}
        isOpen={branchMenuOpen}
        onToggle={() => setBranchMenuOpen((v) => !v)}
      />

      {/* Sync button — botón prominente con icono + label + ahead/behind badges */}
      <SyncButton
        action={syncAction}
        label={syncLabel}
        ahead={ahead}
        behind={behind}
        busy={busy === 'sync'}
        disabled={detached}
        onClick={() => void doSync()}
      />

      <div style={{ flex: 1 }}/>

      {/* Mensaje transitorio */}
      {msg && (
        <span className={`eco-chip eco-mono ${msg.kind === 'ok' ? 'eco-chip--ok' : 'eco-chip--err'}`}
          style={{ fontSize: 11.5, maxWidth: 360, flexShrink: 1, minWidth: 0 }} title={msg.text}>
          <span className="eco-truncate">{msg.text}</span>
        </span>
      )}

      {/* Botón dedicado: renombrar agente con el nombre de la rama actual.
          En móvil se esconde: la misma acción está en el menú "⋯" y la fila
          solo tiene lugar para chip de rama + sync + menú. */}
      {!isPhone && onRenameAgent && branchName && !detached && (
        <button type="button"
          className="eco-btn eco-btn--sm eco-btn--raised"
          onClick={() => onRenameAgent(branchName)}
          title={tr('git.topbar.rename_agent_tooltip', { name: branchName })}>
          <IconAgent size={14}/>
          <span>{tr('git.topbar.rename_agent_btn')}</span>
        </button>
      )}

      {/* Menú "⋯" */}
      <div style={{ position: 'relative' }}>
        <button type="button"
          className={`eco-iconbtn eco-iconbtn--raised${moreMenuOpen ? ' is-on' : ''}`}
          onClick={() => setMoreMenuOpen((v) => !v)}>
          <IconMore size={16}/>
        </button>
        {moreMenuOpen && (
          <MoreMenu
            onClose={() => setMoreMenuOpen(false)}
            onRename={() => { setMoreMenuOpen(false); setRenameOpen(true); }}
            onMerge={() => { setMoreMenuOpen(false); setMergeOpen(true); }}
            onPRs={() => { setMoreMenuOpen(false); onOpenPRs(); }}
            onRenameAgent={isPhone && onRenameAgent && branchName && !detached
              ? () => { setMoreMenuOpen(false); onRenameAgent(branchName); }
              : undefined}
          />
        )}
      </div>

      {/* Branch dropdown — portal */}
      {branchMenuOpen && (
        <BranchDropdown
          branches={data?.branches ?? []}
          workspace={workspace}
          bubbleId={bubbleId}
          onClose={() => setBranchMenuOpen(false)}
          onCheckoutDone={() => {
            ecoEmit('eco:git_refresh', { bubbleId });
            refreshBranches();
          }}
          onBranchHeld={(branch, holder) => {
            setBranchMenuOpen(false);
            setTakeover({ branch, holder });
          }}
        />
      )}

      {takeover && (
        <BranchTakeoverDialog
          holder={takeover.holder}
          busy={takeoverBusy}
          onCancel={() => setTakeover(null)}
          onConfirm={() => void takeOverBranch(takeover.branch, takeover.holder.path)}
        />
      )}

      {/* Rename branch modal */}
      {renameOpen && (
        <RenameBranchModal
          current={branchName}
          onCancel={() => setRenameOpen(false)}
          onDone={() => { setRenameOpen(false); ecoEmit('eco:git_refresh', { bubbleId }); refreshBranches(); }}
          workspace={workspace}
          bubbleId={bubbleId}
        />
      )}

      {/* Merge into current modal */}
      {mergeOpen && (
        <MergeModal
          branches={data?.branches ?? []}
          currentBranch={branchName}
          onCancel={() => setMergeOpen(false)}
          onDone={() => { setMergeOpen(false); ecoEmit('eco:git_refresh', { bubbleId }); refreshBranches(); }}
          workspace={workspace}
          bubbleId={bubbleId}
        />
      )}
    </div>
  );
}

// Botón sync prominente — adapta icono, color y badges según la acción.
// Estilo: alto (34px), font fuerte, sombra accent cuando hay algo
// accionable, glow pulsante en Sync (ambos ahead+behind).
function SyncButton({
  action, label, ahead, behind, busy, disabled, onClick,
}: {
  action: 'fetch' | 'pull' | 'push' | 'sync' | 'publish';
  label: string;
  ahead: number;
  behind: number;
  // NOTE: las labels traducidas se calculan en el caller y pasan via `label`.
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  // Icono unicode por acción.
  const icon = action === 'fetch' ? '↻'
    : action === 'pull' ? '↓'
    : action === 'push' ? '↑'
    : action === 'publish' ? '⤒'
    : '⇅';

  const actionable = action !== 'fetch';

  return (
    <button type="button"
      className={`eco-btn eco-btn--sm ${actionable ? 'eco-btn--primary' : 'eco-btn--raised'}`}
      onClick={onClick}
      disabled={busy || disabled}
      title={disabled ? tr('git.topbar.sync.detached_disabled') : tr('git.topbar.sync.action_tooltip', { label })}
      style={busy ? { cursor: 'wait' } : undefined}>
      {busy ? (
        <span className="eco-spinner" style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }}/>
      ) : action === 'fetch' ? (
        <IconRotateCw size={15}/>
      ) : (
        <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
      )}
      <span>{label}</span>
      {/* Badges ahead/behind cuando hay algo */}
      {(behind > 0 || ahead > 0) && (
        <span className="eco-mono" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          marginLeft: 2, paddingLeft: 8, fontSize: 11.5,
          borderLeft: '1px solid color-mix(in oklab, currentColor 25%, transparent)',
        }}>
          {behind > 0 && (
            <span title={behind === 1 ? tr('git.topbar.sync.behind_one', { n: behind }) : tr('git.topbar.sync.behind_many', { n: behind })}
              style={badge(actionable ? undefined : t.warn)}>↓{behind}</span>
          )}
          {ahead > 0 && (
            <span title={ahead === 1 ? tr('git.topbar.sync.ahead_one', { n: ahead }) : tr('git.topbar.sync.ahead_many', { n: ahead })}
              style={badge(actionable ? undefined : t.ok)}>↑{ahead}</span>
          )}
        </span>
      )}
    </button>
  );
}

// Contador dentro del botón de sync: tinte del color del texto que lo rodea.
function badge(color?: string): React.CSSProperties {
  return {
    padding: '0 6px', borderRadius: 7, color,
    background: 'color-mix(in oklab, currentColor 14%, transparent)',
  };
}

function BranchChip({ branchName, detached, isOpen, onToggle }: {
  branchName: string;
  detached: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const tr = useT();
  return (
    <button type="button"
      className="eco-btn eco-btn--sm eco-btn--raised"
      onClick={onToggle}
      aria-expanded={isOpen}
      title={detached ? tr('git.topbar.branch.detached_tooltip', { name: branchName }) : tr('git.topbar.branch.current_tooltip', { name: branchName })}
      style={{ maxWidth: 260, flexShrink: 1, minWidth: 0, ...(isOpen ? { background: 'var(--hover)' } : null) }}>
      <IconBranch size={14}/>
      <code className="eco-mono eco-truncate" style={{ fontSize: 13, flex: 1, textAlign: 'left', fontWeight: 400 }}>
        {detached ? `${tr('git.topbar.branch.detached_prefix')} ${branchName}` : branchName}
      </code>
      <IconChevD size={13} style={{ color: 'var(--tx3)', flexShrink: 0 }}/>
    </button>
  );
}

function MoreMenu({ onClose, onRename, onMerge, onPRs, onRenameAgent }: {
  onClose: () => void;
  onRename: () => void;
  onMerge: () => void;
  onPRs: () => void;
  onRenameAgent?: () => void;
}) {
  const tr = useT();
  // Click fuera cierra.
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const items: { icon: typeof IconBranch; label: string; onClick: () => void }[] = [
    { icon: IconResume, label: tr('git.topbar.menu.merge'), onClick: onMerge },
    { icon: IconEdit, label: tr('git.topbar.menu.rename'), onClick: onRename },
    { icon: IconGlobe, label: tr('git.topbar.menu.prs'), onClick: onPRs },
    ...(onRenameAgent ? [{ icon: IconAgent, label: tr('git.topbar.rename_agent_btn'), onClick: onRenameAgent }] : []),
  ];

  return (
    <div ref={ref} className="eco-menu" style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 6,
      minWidth: 240, zIndex: 20,
    }}>
      {items.map((it, i) => (
        <button key={i} type="button" className="eco-menu__item" onClick={it.onClick}>
          <it.icon size={15}/>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function BranchDropdown({ branches, workspace, bubbleId, onClose, onCheckoutDone, onBranchHeld }: {
  branches: BranchInfo[];
  workspace: string;
  bubbleId: string;
  onClose: () => void;
  onCheckoutDone: () => void;
  onBranchHeld: (branch: string, holder: BranchHolderInfo) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'local' | 'remote'>('local');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const filtered = branches.filter((b) => {
    if (tab === 'local' && b.isRemote) return false;
    if (tab === 'remote' && !b.isRemote) return false;
    if (!query.trim()) return true;
    return b.name.toLowerCase().includes(query.toLowerCase().trim());
  });

  async function checkout(branch: string) {
    setBusy(branch); setErr(null);
    try {
      const r = await apiFetch('/git/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, branch }),
      });
      const d = await r.json().catch(() => ({}));
      const holder = branchHolderFrom(d);
      if (holder) { onBranchHeld(branch, holder); return; }
      if (!r.ok || !d.ok) {
        const hint = d.code === 'checkout.dirty_working_tree'
          ? tr('git.cherry.dirty_hint')
          : '';
        setErr((d.error || `HTTP ${r.status}`) + hint);
        return;
      }
      onCheckoutDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('common.error'));
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }} onClick={onClose}>
      <div ref={ref} className="eco-menu" onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)',
        width: 460, maxWidth: vw(92), maxHeight: vh(70), padding: 8,
        display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', animation: 'none',
      }}>
        {/* Buscador */}
        <div className="eco-inputbar eco-inputbar--sm" style={{ flex: 'none' }}>
          <IconSearch size={14}/>
          <input
            className="eco-input-bare eco-mono"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('git.topbar.dropdown.search')}/>
        </div>

        {/* Tabs local/remote */}
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          style={{ alignSelf: 'flex-start' }}
          options={[
            { id: 'local', label: tr('git.topbar.dropdown.local') },
            { id: 'remote', label: tr('git.topbar.dropdown.remote') },
          ]}
        />

        {/* Lista */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div className="eco-empty" style={{ padding: 20 }}>
              {query ? tr('git.topbar.dropdown.no_match') : tr('git.topbar.dropdown.no_branches')}
            </div>
          ) : (
            filtered.map((b) => (
              <button key={b.name} type="button"
                className={`eco-menu__item${b.isCurrent ? ' is-on' : ''}`}
                onClick={() => void checkout(b.name)}
                disabled={!!busy || b.isCurrent}
                style={{
                  opacity: b.isCurrent ? 1 : undefined,
                  cursor: b.isCurrent ? 'default' : (busy ? 'wait' : 'pointer'),
                }}>
                {b.isCurrent ? (
                  <IconCheck size={14}/>
                ) : (
                  <span style={{ width: 14, flexShrink: 0 }}/>
                )}
                <code className="eco-mono eco-truncate" style={{
                  flex: 1, fontSize: 12.5,
                  fontWeight: b.isCurrent ? 500 : 400,
                }}>{b.name}</code>
                {(b.ahead !== undefined && b.ahead > 0) && (
                  <span className="eco-mono" style={{ fontSize: 11.5, color: t.ok }}>↑{b.ahead}</span>
                )}
                {(b.behind !== undefined && b.behind > 0) && (
                  <span className="eco-mono" style={{ fontSize: 11.5, color: t.warn }}>↓{b.behind}</span>
                )}
                {b.lastCommit && (
                  <span className="eco-sub eco-truncate" style={{ maxWidth: 140 }}>{b.lastCommit.relTime}</span>
                )}
              </button>
            ))
          )}
        </div>

        {err && (
          <div className="eco-banner eco-banner--err" style={{ flex: 'none' }}>{err}</div>
        )}

        <div className="eco-sub" style={{ padding: '0 8px 4px', flex: 'none' }}>
          {tr('git.topbar.dropdown.tip')}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RenameBranchModal({ current, onCancel, onDone, workspace, bubbleId }: {
  current: string;
  onCancel: () => void;
  onDone: () => void;
  workspace: string;
  bubbleId: string;
}) {
  const tr = useT();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || name === current) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch('/git/rename-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, newName: name.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) setErr(d.error || `HTTP ${r.status}`);
      else onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="eco-scrim" onClick={onCancel}>
      <div className="eco-dialog eco-dialog--sm" onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconEdit size={20}/></span>
          <h2 className="eco-dialog__title">{tr('git.topbar.rename.title')}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__section">
          <div className="eco-field-label">
            {tr('git.topbar.rename.body')} <code className="eco-mono">{current}</code>:
          </div>
          <input
            className="eco-field eco-field--mono"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}/>
        </div>
        {err && (
          <div className="eco-banner eco-banner--err eco-mono">{err}</div>
        )}
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={() => void submit()}
              disabled={!name.trim() || name === current || busy}>
              {busy ? '…' : tr('git.topbar.rename.do')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MergeModal({ branches, currentBranch, onCancel, onDone, workspace, bubbleId }: {
  branches: BranchInfo[];
  currentBranch: string;
  onCancel: () => void;
  onDone: () => void;
  workspace: string;
  bubbleId: string;
}) {
  const tr = useT();
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [noFf, setNoFf] = useState(false);
  const [squash, setSquash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const options = branches.filter((b) => !b.isRemote && !b.isCurrent).map((b) => b.name);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((b) => b.toLowerCase().includes(q)) : options;

  async function submit() {
    if (!source) return;
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch('/git/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace, bubbleId, source,
          noFf: noFf && !squash,
          squash,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        const conflictMsg = d.conflict ? tr('git.topbar.merge.conflict_suffix', { n: d.conflict.files.length }) : '';
        setMsg({ kind: 'err', text: (d.error || `HTTP ${r.status}`) + conflictMsg });
      } else {
        setMsg({ kind: 'ok', text: d.message || tr('git.topbar.merge.ok') });
        setTimeout(onDone, 800);
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="eco-scrim" onClick={onCancel}>
      <div className="eco-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconBranch size={20}/></span>
          <h2 className="eco-dialog__title">{tr('git.topbar.merge.title')}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body">
          {tr('git.topbar.merge.body', { branch: currentBranch })}
        </div>
        {/* Buscador + lista filtrable de ramas locales (reemplaza el <select>
            nativo, que no permitía buscar). */}
        <div className="eco-optlist">
          <div className="eco-optlist__search">
            <IconSearch size={15}/>
            <input
              type="text"
              className="eco-input-bare eco-mono"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('branch.search_placeholder')}
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="eco-optlist__scroll" style={{ maxHeight: 220 }}>
            {filtered.length === 0 ? (
              <div className="eco-sub" style={{ padding: '10px 12px' }}>
                {tr('git.topbar.dropdown.no_branches')}
              </div>
            ) : filtered.map((b) => {
              const sel = b === source;
              return (
                <button
                  key={b} type="button"
                  className={`eco-option${sel ? ' is-on' : ''}`}
                  onClick={() => setSource(b)}
                  disabled={busy}>
                  <span className="eco-option__text">
                    <span className="eco-option__title eco-mono" style={{ fontSize: 13 }}>{b}</span>
                  </span>
                  {sel && <span className="eco-option__check" style={{ display: 'flex' }}><IconCheck size={15}/></span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
          <button type="button" aria-pressed={noFf}
            className={`eco-choice eco-choice--mono${noFf ? ' is-on' : ''}`}
            onClick={() => setNoFf(!noFf)} disabled={squash || busy}
            style={squash || busy ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
            --no-ff
          </button>
          <button type="button" aria-pressed={squash}
            className={`eco-choice eco-choice--mono${squash ? ' is-on' : ''}`}
            onClick={() => setSquash(!squash)} disabled={busy}
            style={busy ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
            --squash
          </button>
        </div>
        {msg && (
          <div className={`eco-banner eco-mono ${msg.kind === 'ok' ? 'eco-banner--ok' : 'eco-banner--err'}`}>{msg.text}</div>
        )}
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={() => void submit()} disabled={!source || busy}>
              {busy ? '…' : tr('git.topbar.merge.do')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

void IconTrash;
