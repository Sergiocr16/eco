import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, IconBtn } from '@/design/primitives';
import { IconCheck, IconX, IconResume, IconCopy, IconBranch, IconAlert } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { fetchCommit, type LogEntry } from '@/hooks/useGitLog';
import { useBranches } from '@/hooks/useBranches';
import { ShaPill, SubpanelLoading, useFormatRelTime } from './shared';
import { useT } from '@/hooks/useI18n';
import { BranchTakeoverDialog, branchHolderFrom, type BranchHolderInfo } from './BranchTakeoverDialog';

type Props = {
  workspace: string;
  bubbleId: string;
  // Commit summary que ya tenemos de la lista (para mostrar mientras carga
  // el detalle completo).
  summary: LogEntry;
};

export function CommitDetailPanel({ workspace, bubbleId, summary }: Props) {
  const t = useTokens();
  const tr = useT();
  const formatRelTime = useFormatRelTime();
  const { data: branchesData } = useBranches(workspace, bubbleId);
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState<string>('');
  const [stat, setStat] = useState<string>('');
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showCherryMenu, setShowCherryMenu] = useState(false);
  const [showResetMenu, setShowResetMenu] = useState(false);
  const [resetConfirm, setResetConfirm] = useState<{ mode: 'soft' | 'mixed' | 'hard'; lostCommits?: number; lostSubjects?: string[]; phrase: string } | null>(null);
  // Confirmación previa al cherry-pick: { targetBranch } cuando el user
  // eligió rama pero aún no confirmó el "Sí, aplicar".
  const [cherryConfirm, setCherryConfirm] = useState<{ branch: string } | null>(null);
  // La rama destino del cherry-pick la tiene otro worktree: preguntamos si traerla.
  const [takeover, setTakeover] = useState<{ branch: string; holder: BranchHolderInfo } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setDiff(''); setStat(''); setTruncated(false);
    setActionMsg(null); setShowCherryMenu(false); setCherryConfirm(null); setTakeover(null); setShowResetMenu(false); setResetConfirm(null);
    void fetchCommit(workspace, bubbleId, summary.sha).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setDiff(r.diff);
        setStat(r.stat);
        setTruncated(r.truncated);
      } else {
        setError(r.error);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [workspace, bubbleId, summary.sha]);

  useEffect(() => {
    if (!actionMsg) return;
    const id = setTimeout(() => setActionMsg(null), 3000);
    return () => clearTimeout(id);
  }, [actionMsg]);

  async function postAction(path: string, body: object, label: string) {
    setBusyAction(label); setActionMsg(null);
    try {
      const r = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, ...body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        const conflictMsg = d.conflict ? tr('git.commit.conflict_files', { n: d.conflict.files.length }) : '';
        setActionMsg({ kind: 'err', text: (d.error || `HTTP ${r.status}`) + conflictMsg });
        return { ok: false, data: d };
      }
      setActionMsg({ kind: 'ok', text: d.message || tr('git.commit.action_ok') });
      ecoEmit('eco:git_refresh', { bubbleId });
      return { ok: true, data: d };
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
      return { ok: false, data: null };
    } finally {
      setBusyAction(null);
    }
  }

  // Paso 1: el user elige rama destino → mostramos la pantalla de confirmación.
  // No tocamos git todavía. Esto evita cherry-picks accidentales por click.
  function pickCherryTarget(targetBranch: string) {
    setShowCherryMenu(false);
    setCherryConfirm({ branch: targetBranch });
  }

  // Paso 2: el user confirma → hacemos checkout (si hace falta) + cherry-pick.
  async function runCherryPick(targetBranch: string, takeOverFrom?: string) {
    setCherryConfirm(null);
    const currentBranch = branchesData?.current;
    // Si el destino es distinto a la rama actual, hacemos checkout primero.
    // El usuario queda en la rama destino tras el cherry-pick (es la
    // interpretación más útil — si elegiste otra rama, querés trabajar ahí).
    if (currentBranch && targetBranch !== currentBranch) {
      setBusyAction('cherry'); setActionMsg(null);
      try {
        const r = await apiFetch('/git/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace, bubbleId, branch: targetBranch, takeOverFrom }),
        });
        const d = await r.json().catch(() => ({}));
        const holder = branchHolderFrom(d);
        setTakeover(holder ? { branch: targetBranch, holder } : null);
        if (holder) { setBusyAction(null); return; }
        if (!r.ok || !d.ok) {
          // Si hay cambios sin commitear, el backend devuelve checkout.dirty_working_tree.
          const hint = d.code === 'checkout.dirty_working_tree'
            ? tr('git.cherry.dirty_hint')
            : '';
          setActionMsg({ kind: 'err', text: tr('git.cherry.checkout_err', { branch: targetBranch, err: (d.error || `HTTP ${r.status}`) + hint }) });
          setBusyAction(null);
          return;
        }
        ecoEmit('eco:git_refresh', { bubbleId });
      } catch (e) {
        setTakeover(null);
        setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
        setBusyAction(null);
        return;
      }
    }
    await postAction('/git/cherry-pick', { shas: [summary.sha] }, 'cherry');
  }
  async function revert() {
    await postAction('/git/revert', { sha: summary.sha }, 'revert');
  }
  async function reset(mode: 'soft' | 'mixed' | 'hard', force = false) {
    setShowResetMenu(false);
    const result = await postAction('/git/reset', { ref: summary.sha, mode, force }, 'reset');
    if (!result.ok && mode === 'hard' && result.data?.code === 'reset.would_lose_commits') {
      // Pre-check disparó protección; mostramos confirm.
      setResetConfirm({
        mode: 'hard',
        lostCommits: result.data.lostCommits,
        lostSubjects: result.data.lostSubjects ?? [],
        phrase: '',
      });
    }
  }
  function copySha() {
    try { void navigator.clipboard.writeText(summary.sha); setActionMsg({ kind: 'ok', text: tr('git.commit.sha_copied') }); } catch { /* noop */ }
  }

  const localBranches = (branchesData?.branches ?? []).filter((b) => !b.isRemote);
  const block = { margin: 0, borderRadius: 14, background: t.raised } as const;

  return (
    <div style={{
      flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto',
      display: 'flex', flexDirection: 'column', gap: 14, padding: '22px 24px',
    }}>
      {/* Meta + acciones */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 12 }}><ShaPill sha={summary.sha} abbrev={summary.abbrev}/></span>
        <div style={{
          flex: '1 1 240px', minWidth: 0,
          fontSize: 22, fontWeight: 400, letterSpacing: '-.02em', lineHeight: 1.2, textWrap: 'pretty',
          overflowWrap: 'anywhere',
        }}>{summary.subject}</div>
      </div>
      <div className="eco-faint" style={{ flexShrink: 0 }}>
        {summary.author} · {formatRelTime(summary.date)}
        {summary.parents.length > 1 && <span style={{ marginLeft: 8, color: t.accent }}>{tr('git.commit.merge_of_n', { n: summary.parents.length })}</span>}
      </div>
      {summary.body && (
        <pre className="eco-mono" style={{
          ...block, padding: '12px 16px', color: t.text1, flexShrink: 0,
          fontSize: 12, lineHeight: 1.6,
          whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto',
        }}>{summary.body}</pre>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Btn kind="primary" icon={IconCheck} onClick={() => setShowCherryMenu((v) => !v)} disabled={!!busyAction}>
            {busyAction === 'cherry' ? '…' : tr('git.commit.cherry_to')}
          </Btn>
          {showCherryMenu && (
            <div className="eco-menu" style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 6,
              minWidth: 220, maxWidth: 320, maxHeight: 340, overflow: 'auto', zIndex: 10,
            }}>
              <div className="eco-menu__label eco-sub">{tr('git.commit.apply_to')}</div>
              {localBranches.map((b) => (
                <button key={b.name} type="button" className="eco-menu__item eco-mono"
                  onClick={() => pickCherryTarget(b.name)}
                  style={{ fontSize: 12.5 }}>
                  <span className="eco-truncate" style={{ flex: 1 }}>{b.name}</span>
                  {b.isCurrent && (
                    <span className="eco-chip eco-chip--accent" style={{ padding: '0 8px', fontSize: 11.5 }}>
                      {tr('git.commit.current_tag')}
                    </span>
                  )}
                </button>
              ))}
              {localBranches.length === 0 && (
                <div className="eco-menu__label eco-sub">{tr('git.commit.no_local_branches')}</div>
              )}
            </div>
          )}
        </div>
        <Btn kind="raised" icon={IconX} onClick={() => void revert()} disabled={!!busyAction}>
          {busyAction === 'revert' ? '…' : tr('git.commit.revert')}
        </Btn>
        <div style={{ position: 'relative' }}>
          <Btn kind="raised" icon={IconResume} onClick={() => setShowResetMenu((v) => !v)} disabled={!!busyAction}>
            {tr('git.commit.reset_to_here')}
          </Btn>
          {showResetMenu && (
            <div className="eco-menu" style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 6, minWidth: 240, zIndex: 10,
            }}>
              {(['soft', 'mixed', 'hard'] as const).map((m) => (
                <button key={m} type="button"
                  className={`eco-menu__item${m === 'hard' ? ' eco-menu__item--danger' : ''}`}
                  onClick={() => void reset(m)}
                  style={{ height: 'auto', padding: '8px 10px', flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
                  <span className="eco-mono" style={{ fontWeight: 500, fontSize: 12.5 }}>--{m}</span>
                  <span className="eco-sub" style={{ whiteSpace: 'normal' }}>
                    {m === 'soft' && tr('git.commit.reset.soft_desc')}
                    {m === 'mixed' && tr('git.commit.reset.mixed_desc')}
                    {m === 'hard' && tr('git.commit.reset.hard_desc')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Btn kind="raised" icon={IconCopy} onClick={copySha}>{tr('git.commit.sha_btn')}</Btn>
      </div>

      {actionMsg && (
        <div className={`eco-banner eco-banner--${actionMsg.kind === 'ok' ? 'ok' : 'err'} eco-mono`}
          style={{ flexShrink: 0, fontSize: 12 }}>{actionMsg.text}</div>
      )}

      {/* Confirm modal de cherry-pick */}
      {takeover && (
        <BranchTakeoverDialog
          holder={takeover.holder}
          busy={busyAction === 'cherry'}
          onCancel={() => setTakeover(null)}
          onConfirm={() => void runCherryPick(takeover.branch, takeover.holder.path)}
        />
      )}
      {cherryConfirm && (
        <CherryPickConfirm
          targetBranch={cherryConfirm.branch}
          currentBranch={branchesData?.current ?? null}
          commitAbbrev={summary.abbrev}
          commitSubject={summary.subject}
          onCancel={() => setCherryConfirm(null)}
          onConfirm={() => void runCherryPick(cherryConfirm.branch)}
        />
      )}

      {/* Confirm modal de reset hard */}
      {resetConfirm && (
        <ResetHardConfirm
          info={resetConfirm}
          onChange={(phrase) => setResetConfirm((r) => r ? { ...r, phrase } : r)}
          onCancel={() => setResetConfirm(null)}
          onConfirm={() => { setResetConfirm(null); void reset('hard', true); }}
        />
      )}

      {/* Diff */}
      {loading && <SubpanelLoading label={tr('git.commit.loading_diff')}/>}
      {error && (
        <div className="eco-banner eco-banner--err eco-mono" style={{ flexShrink: 0, fontSize: 12 }}>
          {error}
        </div>
      )}
      {!loading && !error && (
        <>
          {stat && (
            <pre className="eco-mono" style={{
              ...block, padding: '12px 16px', flexShrink: 0,
              color: t.text1, fontSize: 12, lineHeight: 1.7,
              whiteSpace: 'pre', overflowX: 'auto',
            }}>{stat}</pre>
          )}
          <DiffRender diff={diff}/>
          {truncated && (
            <div className="eco-banner eco-banner--warn" style={{ flexShrink: 0, justifyContent: 'center' }}>
              {tr('git.commit.diff_truncated')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CherryPickConfirm({
  targetBranch, currentBranch, commitAbbrev, commitSubject, onCancel, onConfirm,
}: {
  targetBranch: string;
  currentBranch: string | null;
  commitAbbrev: string;
  commitSubject: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const isSwitching = !!currentBranch && currentBranch !== targetBranch;
  const code = { padding: '1px 7px', borderRadius: 7, fontSize: 12 } as const;
  return (
    <div className="eco-scrim" onClick={onCancel}>
      <div className="eco-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconBranch size={20}/></span>
          <h2 className="eco-dialog__title">{tr('git.cherry.title')}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body">
          {tr('git.cherry.body_a')}{' '}
          <code className="eco-mono" style={{ ...code, background: t.card, color: t.text0 }}>{commitAbbrev}</code>
          {' '}— <em>{commitSubject}</em> — {tr('git.cherry.body_b')}{' '}
          <code className="eco-mono" style={{ ...code, background: t.accentSoft, color: t.accent, fontWeight: 500 }}>{targetBranch}</code>.
        </div>
        {isSwitching && (
          <div className="eco-banner eco-banner--warn" style={{ lineHeight: 1.5 }}>
            {tr('git.cherry.checkout_warning', { current: currentBranch ?? '', target: targetBranch })}
          </div>
        )}
        <div className="eco-sub">{tr('git.cherry.conflict_hint')}</div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={onConfirm}>{tr('git.cherry.confirm')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResetHardConfirm({
  info, onChange, onCancel, onConfirm,
}: {
  info: { mode: 'soft' | 'mixed' | 'hard'; lostCommits?: number; lostSubjects?: string[]; phrase: string };
  onChange: (phrase: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tr = useT();
  const enabled = info.phrase.trim() === 'HARD RESET';
  return (
    <div className="eco-scrim" onClick={onCancel}>
      <div className="eco-dialog eco-dialog--danger" onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile eco-dialog__tile--danger"><IconAlert size={20}/></span>
          <h2 className="eco-dialog__title">{tr('git.reset.title')}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body">
          {info.lostCommits === 1 ? tr('git.reset.lose_one') : tr('git.reset.lose_many', { n: info.lostCommits ?? 0 })}
        </div>
        {info.lostSubjects && info.lostSubjects.length > 0 && (
          <ul className="eco-muted" style={{ margin: 0, padding: '0 0 0 20px', fontSize: 12.5, lineHeight: 1.6 }}>
            {info.lostSubjects.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        )}
        <div className="eco-sub" style={{ lineHeight: 1.5 }}>{tr('git.reset.reflog_hint')}</div>
        <div className="eco-dialog__section">
          <div className="eco-field-label">{tr('git.reset.phrase_prompt')}</div>
          <input
            className="eco-field eco-field--mono"
            value={info.phrase}
            onChange={(e) => onChange(e.target.value)}
            autoFocus/>
        </div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--danger-solid"
              onClick={onConfirm}
              disabled={!enabled}>{tr('git.reset.confirm')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mini-renderer de unified diff. Sin highlight sintáctico — solo colores
// por tipo de línea. Para inspección rápida del commit alcanza.
function DiffRender({ diff }: { diff: string }) {
  const t = useTokens();
  const tr = useT();
  if (!diff.trim()) {
    return <div className="eco-sub" style={{ padding: '8px 0' }}>{tr('git.commit.empty_diff')}</div>;
  }
  const tint = (c: string) => `color-mix(in oklab, ${c} 13%, transparent)`;
  const lines = diff.split('\n');
  return (
    <pre className="eco-mono" style={{
      margin: 0, padding: '10px 0', borderRadius: 14, background: t.raised, flexShrink: 0,
      fontSize: 12, lineHeight: 1.7, overflow: 'hidden',
    }}>
      {lines.map((line, i) => {
        let color = t.text1;
        let bg = 'transparent';
        if (line.startsWith('diff --git') || line.startsWith('index ')) {
          color = t.text3;
        } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
          color = t.text2;
        } else if (line.startsWith('@@')) {
          color = t.info;
        } else if (line.startsWith('+')) {
          color = t.ok;
          bg = tint(t.ok);
        } else if (line.startsWith('-')) {
          color = t.err;
          bg = tint(t.err);
        }
        return (
          <div key={i} style={{
            padding: '0 16px',
            color, background: bg,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{line || ' '}</div>
        );
      })}
    </pre>
  );
}
