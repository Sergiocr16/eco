import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTokens } from '@/design/theme';
import { IconBranch, IconMore, IconResume, IconGlobe, IconEdit, IconTrash, IconCheck, IconSearch, IconAgent } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useBranches, type BranchInfo } from '@/hooks/useBranches';
import { useT } from '@/hooks/useI18n';

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
  const t = useTokens();
  const tr = useT();
  const { data, refresh: refreshBranches } = useBranches(workspace, bubbleId);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(id);
  }, [msg]);

  const current = data?.branches.find((b) => b.isCurrent) ?? null;
  const branchName = data?.current ?? '—';
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
  let syncAction: 'fetch' | 'pull' | 'push' | 'sync' | 'publish' = 'fetch';
  if (!hasRemote && !detached) syncAction = 'publish';
  else if (ahead > 0 && behind > 0) syncAction = 'sync';
  else if (ahead > 0) syncAction = 'push';
  else if (behind > 0) syncAction = 'pull';
  const syncLabel = syncAction === 'fetch' ? tr('detail.git.sync.fetch')
    : syncAction === 'publish' ? tr('detail.git.sync.publish')
    : syncAction === 'sync' ? tr('detail.git.sync.sync')
    : syncAction === 'push' ? tr('detail.git.sync.push')
    : tr('detail.git.sync.pull');

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
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }

  async function doSync() {
    setBusy('sync'); setMsg(null);
    try {
      if (syncAction === 'fetch') {
        const r = await callBackend('/git/fetch', {});
        setMsg(r.ok ? { kind: 'ok', text: r.message ?? tr('detail.git.sync.fetch') + ' OK' } : { kind: 'err', text: r.error ?? 'Error' });
      } else if (syncAction === 'pull') {
        const r = await callBackend('/git/pull', {});
        setMsg(r.ok ? { kind: 'ok', text: r.message ?? tr('detail.git.sync.pull') + ' OK' } : { kind: 'err', text: r.error ?? 'Error' });
      } else if (syncAction === 'push' || syncAction === 'publish') {
        const r = await callBackend('/git/push', {});
        setMsg(r.ok ? { kind: 'ok', text: r.message ?? tr('detail.git.push.ok') } : { kind: 'err', text: r.error ?? 'Error' });
      } else if (syncAction === 'sync') {
        const pullR = await callBackend('/git/pull', {});
        if (!pullR.ok) { setMsg({ kind: 'err', text: `${tr('detail.git.sync.pull')}: ${pullR.error}` }); return; }
        const pushR = await callBackend('/git/push', {});
        setMsg(pushR.ok ? { kind: 'ok', text: tr('detail.git.sync.ok') } : { kind: 'err', text: `${tr('detail.git.push.error')}: ${pushR.error}` });
      }
      ecoEmit('eco:git_refresh', { bubbleId });
      refreshBranches();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 16px',
      borderBottom: `1px solid ${t.glassBorder}`,
      background: t.bg1,
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
        <div style={{
          padding: '4px 10px', borderRadius: 6,
          background: `color-mix(in oklch, ${msg.kind === 'ok' ? t.ok : t.err} 14%, transparent)`,
          color: msg.kind === 'ok' ? t.ok : t.err,
          fontFamily: t.fontMono, fontSize: 11,
          maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={msg.text}>{msg.text}</div>
      )}

      {/* Botón dedicado: renombrar agente con el nombre de la rama actual */}
      {onRenameAgent && branchName && !detached && (
        <button type="button"
          onClick={() => onRenameAgent(branchName)}
          title={tr('detail.git.topbar.use_as_agent_name_title', { branch: branchName })}
          style={{
            height: 28, padding: '0 10px', borderRadius: 7,
            border: `1px solid ${t.glassBorder}`,
            background: t.bg2, color: t.text1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.glassBorder; e.currentTarget.style.color = t.text1; }}>
          <IconAgent size={12}/>
          <span>{tr('detail.git.topbar.use_as_agent_name')}</span>
        </button>
      )}

      {/* Menú "⋯" */}
      <div style={{ position: 'relative' }}>
        <button type="button"
          onClick={() => setMoreMenuOpen((v) => !v)}
          style={{
            height: 28, width: 28, padding: 0, borderRadius: 7,
            border: `1px solid ${t.glassBorder}`,
            background: t.bg2, color: t.text1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
          <IconMore size={14}/>
        </button>
        {moreMenuOpen && (
          <MoreMenu
            t={t}
            onClose={() => setMoreMenuOpen(false)}
            onRename={() => { setMoreMenuOpen(false); setRenameOpen(true); }}
            onMerge={() => { setMoreMenuOpen(false); setMergeOpen(true); }}
            onPRs={() => { setMoreMenuOpen(false); onOpenPRs(); }}
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
  const isSync = action === 'sync';

  return (
    <button type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={disabled ? tr('detail.git.sync.detached_disabled') : `${tr('detail.git.sync.action_title')}: ${label}`}
      style={{
        marginLeft: 10,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        height: 34, padding: '0 14px',
        borderRadius: 9,
        border: actionable
          ? `1px solid ${t.accent}`
          : `1px solid ${t.glassBorder}`,
        background: actionable
          ? `linear-gradient(180deg, ${t.accent}, color-mix(in oklch, ${t.accent} 86%, black))`
          : t.bg2,
        color: actionable ? t.accentOn : t.text1,
        fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 700,
        letterSpacing: 0.1,
        cursor: busy ? 'wait' : (disabled ? 'not-allowed' : 'pointer'),
        opacity: disabled ? 0.45 : 1,
        // Sombra solo cuando hay acción real — atrae el ojo.
        boxShadow: actionable
          ? `0 1px 0 color-mix(in oklch, ${t.accent} 60%, black) inset, 0 4px 12px color-mix(in oklch, ${t.accent} 30%, transparent)`
          : 'none',
        // Pulso sutil cuando es Sync (la acción "más urgente" con ambos lados).
        animation: isSync && !busy ? 'eco-shimmer 2s ease-in-out infinite' : undefined,
        transition: 'transform 80ms, box-shadow 120ms',
      }}
      onMouseDown={(e) => { if (!busy && !disabled) e.currentTarget.style.transform = 'translateY(1px)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}>
      {busy ? (
        <span style={{
          width: 14, height: 14, borderRadius: '50%',
          border: `2px solid color-mix(in oklch, ${actionable ? t.accentOn : t.text2} 40%, transparent)`,
          borderTopColor: actionable ? t.accentOn : t.text1,
          animation: 'eco-spin 0.7s linear infinite',
          display: 'inline-block',
        }}/>
      ) : (
        <span style={{ fontSize: 15, lineHeight: 1, fontWeight: 800 }}>{icon}</span>
      )}
      <span>{label}</span>
      {/* Badges ahead/behind cuando hay algo */}
      {(behind > 0 || ahead > 0) && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          marginLeft: 2, paddingLeft: 8,
          borderLeft: `1px solid ${actionable ? 'rgba(255,255,255,0.25)' : t.glassBorder}`,
        }}>
          {behind > 0 && (
            <span title={behind === 1 ? tr('detail.git.sync.commits_behind_one') : tr('detail.git.sync.commits_behind_many', { n: behind })}
              style={{
                fontFamily: t.fontMono, fontSize: 11, fontWeight: 700,
                padding: '1px 6px', borderRadius: 4,
                background: actionable
                  ? 'rgba(0,0,0,0.18)'
                  : `color-mix(in oklch, ${t.warn} 18%, transparent)`,
                color: actionable ? '#fff' : t.warn,
              }}>↓{behind}</span>
          )}
          {ahead > 0 && (
            <span title={ahead === 1 ? tr('detail.git.sync.commits_ahead_one') : tr('detail.git.sync.commits_ahead_many', { n: ahead })}
              style={{
                fontFamily: t.fontMono, fontSize: 11, fontWeight: 700,
                padding: '1px 6px', borderRadius: 4,
                background: actionable
                  ? 'rgba(0,0,0,0.18)'
                  : `color-mix(in oklch, ${t.ok} 18%, transparent)`,
                color: actionable ? '#fff' : t.ok,
              }}>↑{ahead}</span>
          )}
        </span>
      )}
    </button>
  );
}

function BranchChip({ branchName, detached, isOpen, onToggle }: {
  branchName: string;
  detached: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  return (
    <button type="button"
      onClick={onToggle}
      title={detached ? tr('detail.git.topbar.detached_title', { branch: branchName }) : tr('detail.git.topbar.current_branch_title', { branch: branchName })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 28, padding: '0 10px',
        borderRadius: 7,
        background: isOpen ? t.accentFaint : t.bg2,
        border: `1px solid ${isOpen ? t.accent : t.glassBorder}`,
        color: t.text0,
        cursor: 'pointer',
        maxWidth: 260,
      }}>
      <IconBranch size={12}/>
      <code style={{
        fontFamily: t.fontMono, fontSize: 12,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        flex: 1, minWidth: 0, textAlign: 'left',
      }}>{detached ? `(detached) ${branchName}` : branchName}</code>
      <span style={{ color: t.text2, fontSize: 10 }}>▾</span>
    </button>
  );
}

function MoreMenu({ t, onClose, onRename, onMerge, onPRs }: {
  t: ReturnType<typeof useTokens>;
  onClose: () => void;
  onRename: () => void;
  onMerge: () => void;
  onPRs: () => void;
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
    { icon: IconResume, label: tr('detail.git.topbar.merge_to_current'), onClick: onMerge },
    { icon: IconEdit, label: tr('detail.git.topbar.rename_current_branch'), onClick: onRename },
    { icon: IconGlobe, label: tr('detail.git.topbar.view_prs'), onClick: onPRs },
  ];

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 4,
      minWidth: 240, padding: 4, borderRadius: 8,
      background: t.bg1, border: `1px solid ${t.glassBorder}`,
      boxShadow: `0 8px 24px ${t.glassBorder}`,
      zIndex: 20,
    }}>
      {items.map((it, i) => (
        <button key={i} type="button"
          onClick={it.onClick}
          style={{
            width: '100%', padding: '7px 10px', textAlign: 'left',
            border: 0, background: 'transparent', borderRadius: 6,
            color: t.text1,
            fontFamily: t.fontSans, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          <it.icon size={12}/>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function BranchDropdown({ branches, workspace, bubbleId, onClose, onCheckoutDone }: {
  branches: BranchInfo[];
  workspace: string;
  bubbleId: string;
  onClose: () => void;
  onCheckoutDone: () => void;
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
      if (!r.ok || !d.ok) {
        const hint = d.code === 'checkout.dirty_working_tree'
          ? tr('detail.git.checkout.dirty_hint')
          : '';
        setErr((d.error || `HTTP ${r.status}`) + hint);
        return;
      }
      onCheckoutDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80,
      background: 'rgba(0,0,0,0.25)',
    }} onClick={onClose}>
      <div ref={ref} onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)',
        width: 460, maxWidth: '92vw', maxHeight: '70vh',
        background: t.bg1, border: `1px solid ${t.glassBorder}`,
        borderRadius: 12, boxShadow: `0 16px 48px rgba(0,0,0,0.4)`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Buscador */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px',
          borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          <IconSearch size={12}/>
          <input
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('detail.git.branches.search_placeholder')}
            style={{
              flex: 1, background: 'transparent', border: 0,
              fontFamily: t.fontMono, fontSize: 12.5, color: t.text0,
              outline: 'none',
            }}/>
        </div>

        {/* Tabs local/remote */}
        <div style={{
          display: 'flex', gap: 4, padding: '6px 10px',
          borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          {(['local', 'remote'] as const).map((k) => (
            <button key={k} type="button"
              onClick={() => setTab(k)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 0,
                background: tab === k ? t.accentDim : 'transparent',
                color: tab === k ? t.accentOn : t.text2,
                fontFamily: t.fontSans, fontSize: 11.5, fontWeight: tab === k ? 600 : 500,
                cursor: 'pointer',
              }}>
              {k === 'local' ? tr('detail.git.branches.local') : tr('detail.git.branches.remote')}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, color: t.text3, fontSize: 12, textAlign: 'center' }}>
              {query ? tr('detail.git.branches.no_matches') : tr('detail.git.branches.no_branches')}
            </div>
          ) : (
            filtered.map((b) => (
              <button key={b.name} type="button"
                onClick={() => void checkout(b.name)}
                disabled={!!busy || b.isCurrent}
                style={{
                  width: '100%', padding: '8px 12px', textAlign: 'left',
                  border: 0, background: 'transparent',
                  borderBottom: `1px solid ${t.glassBorder}`,
                  cursor: b.isCurrent ? 'default' : (busy ? 'wait' : 'pointer'),
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => { if (!b.isCurrent) e.currentTarget.style.background = t.bg2; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                {b.isCurrent ? (
                  <IconCheck size={12}/>
                ) : (
                  <span style={{ width: 12 }}/>
                )}
                <code style={{
                  flex: 1, fontFamily: t.fontMono, fontSize: 12,
                  color: b.isCurrent ? t.accent : t.text0,
                  fontWeight: b.isCurrent ? 600 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{b.name}</code>
                {(b.ahead !== undefined && b.ahead > 0) && (
                  <span style={{ fontSize: 10.5, color: t.ok, fontFamily: t.fontMono }}>↑{b.ahead}</span>
                )}
                {(b.behind !== undefined && b.behind > 0) && (
                  <span style={{ fontSize: 10.5, color: t.warn, fontFamily: t.fontMono }}>↓{b.behind}</span>
                )}
                {b.lastCommit && (
                  <span style={{
                    fontSize: 10, color: t.text3,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: 140,
                  }}>{b.lastCommit.relTime}</span>
                )}
              </button>
            ))
          )}
        </div>

        {err && (
          <div style={{
            padding: '8px 12px', borderTop: `1px solid ${t.err}`,
            background: `color-mix(in oklch, ${t.err} 10%, transparent)`,
            color: t.err, fontSize: 11.5,
          }}>{err}</div>
        )}

        <div style={{
          padding: '6px 12px', borderTop: `1px solid ${t.glassBorder}`,
          fontSize: 10.5, color: t.text3,
        }}>
          {tr('detail.git.branches.dropdown_tip')}
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
  const t = useTokens();
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
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 420, maxWidth: '92vw', padding: 20, borderRadius: 12,
        background: t.bg1, border: `1px solid ${t.glassBorder}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text0 }}>{tr('detail.git.rename.title')}</div>
        <div style={{ fontSize: 12, color: t.text2 }}>
          {tr('detail.git.rename.label')} <code style={{ fontFamily: t.fontMono }}>{current}</code>:
        </div>
        <input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          style={{
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 6, padding: '8px 10px',
            fontFamily: t.fontMono, fontSize: 13, color: t.text0, outline: 'none',
          }}/>
        {err && (
          <div style={{
            fontSize: 11.5, color: t.err, fontFamily: t.fontMono,
            padding: '4px 6px', borderRadius: 4, background: t.bg2,
          }}>{err}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={ghostBtn(t)}>{tr('detail.git.button.cancel')}</button>
          <button type="button" onClick={() => void submit()}
            disabled={!name.trim() || name === current || busy}
            style={primaryBtn(t, !name.trim() || name === current || busy)}>
            {busy ? '…' : tr('detail.git.rename.button')}
          </button>
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
  const t = useTokens();
  const tr = useT();
  const [source, setSource] = useState('');
  const [noFf, setNoFf] = useState(false);
  const [squash, setSquash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const options = branches.filter((b) => !b.isRemote && !b.isCurrent).map((b) => b.name);

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
        const conflictMsg = d.conflict ? tr('detail.git.merge.conflict_hint', { n: d.conflict.files.length }) : '';
        setMsg({ kind: 'err', text: (d.error || `HTTP ${r.status}`) + conflictMsg });
      } else {
        setMsg({ kind: 'ok', text: d.message || tr('detail.git.merge.ok') });
        setTimeout(onDone, 800);
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: '92vw', padding: 20, borderRadius: 12,
        background: t.bg1, border: `1px solid ${t.glassBorder}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text0 }}>{tr('detail.git.merge.title')}</div>
        <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5 }}>
          {tr('detail.git.merge.description', { branch: currentBranch })}
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={busy}
          autoFocus
          style={{
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 6, padding: '8px 10px',
            fontFamily: t.fontMono, fontSize: 13, color: t.text0, outline: 'none',
          }}>
          <option value="">{tr('detail.git.merge.choose_source')}</option>
          {options.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.text2, cursor: 'pointer' }}>
            <input type="checkbox" checked={noFf} onChange={(e) => setNoFf(e.target.checked)} disabled={squash || busy} style={{ margin: 0 }}/>
            --no-ff
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.text2, cursor: 'pointer' }}>
            <input type="checkbox" checked={squash} onChange={(e) => setSquash(e.target.checked)} disabled={busy} style={{ margin: 0 }}/>
            --squash
          </label>
        </div>
        {msg && (
          <div style={{
            padding: '6px 10px', borderRadius: 6,
            background: `color-mix(in oklch, ${msg.kind === 'ok' ? t.ok : t.err} 12%, transparent)`,
            color: msg.kind === 'ok' ? t.ok : t.err,
            fontFamily: t.fontMono, fontSize: 11,
          }}>{msg.text}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={ghostBtn(t)}>{tr('detail.git.button.cancel')}</button>
          <button type="button" onClick={() => void submit()} disabled={!source || busy}
            style={primaryBtn(t, !source || busy)}>
            {busy ? '…' : tr('detail.git.merge.button')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ghostBtn(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    height: 28, padding: '0 14px', borderRadius: 7,
    background: 'transparent', color: t.text2,
    border: `1px solid ${t.glassBorder}`,
    fontFamily: t.fontSans, fontSize: 12, cursor: 'pointer',
  };
}
function primaryBtn(t: ReturnType<typeof useTokens>, disabled: boolean): React.CSSProperties {
  return {
    height: 28, padding: '0 14px', borderRadius: 7, border: 0,
    background: disabled ? t.bg3 : t.accent,
    color: disabled ? t.text3 : t.accentOn,
    fontFamily: t.fontSans, fontSize: 12, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

void IconTrash;
