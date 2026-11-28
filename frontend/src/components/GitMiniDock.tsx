import { useEffect } from 'react';
import { useTokens } from '@/design/theme';
import type { Tokens } from '@/design/tokens';
import { IconBranch } from '@/design/icons';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useBranches } from '@/hooks/useBranches';
import { useCurrentPr } from '@/hooks/useCurrentPr';
import { useGitOpStatus } from '@/hooks/useGitOpStatus';
import { useT } from '@/hooks/useI18n';

type GitOp = 'cherry-pick' | 'merge' | 'revert';
const OP_LABEL_KEYS: Record<GitOp, string> = {
  'cherry-pick': 'git.op.cherry_conflict',
  merge: 'git.op.merge_conflict',
  revert: 'git.op.revert_conflict',
};

type Props = {
  workspace: string;
  bubbleId: string;
  baseBranch?: string | null;
  // Abre el tab Git (todas las acciones reales — commit, push, fetch,
  // historial, etc. — viven ahí adentro).
  onGoToGit: () => void;
};

export function prStateColor(t: Tokens, state: string): string {
  return state === 'OPEN' ? t.ok : state === 'MERGED' ? t.info : state === 'CLOSED' ? t.err : t.text3;
}

// Los PR de una tarea llevan su id y nombre en el título, separados por " | "
// ("HOTFIX | PROD | TAR-1306 | Importar consumos…").
const TASK_ID_RE = /^[A-Z][A-Z0-9]{1,9}-\d+$/;

export function taskFromPrTitle(title: string): { id: string; name: string } | null {
  const parts = title.split('|').map((p) => p.trim()).filter(Boolean);
  const at = parts.findIndex((p) => TASK_ID_RE.test(p));
  if (at < 0) return null;
  return { id: parts[at]!, name: parts.slice(at + 1).join(' | ') };
}

export function GitMiniDock({ workspace, bubbleId, baseBranch, onGoToGit }: Props) {
  const t = useTokens();
  const tr = useT();
  const { data: branchesData } = useBranches(workspace, bubbleId);
  const op = useGitOpStatus(workspace, bubbleId);
  const { pr: currentPr, refresh: refreshPr } = useCurrentPr(workspace, bubbleId);

  const branchName = branchesData?.current ?? tr('common.empty_dash');
  const detached = branchesData?.detached ?? false;
  const task = currentPr ? taskFromPrTitle(currentPr.title) : null;
  const checks = currentPr?.checks ?? { total: 0, passed: 0, failed: 0, pending: 0 };
  const conflicting = currentPr?.mergeable === 'CONFLICTING';

  // El store ya refresca con eco:git_refresh, al aquietarse el PTY y por
  // poll; acá solo cubrimos un cambio de rama detectado por useBranches.
  useEffect(() => { void refreshPr(); }, [refreshPr, branchesData?.current]);

  function openPrDetail(e: React.MouseEvent) {
    e.stopPropagation();
    if (!currentPr) return;
    // Persistimos ANTES de cambiar de tab para evitar race condition: si
    // GitPanel aún no está montado, los eventos del bus se pierden. Al
    // arrancar, GitPanel lee `eco.git.subtab.<bubbleId>` y PRsView lee
    // `eco.git.pending_pr.<bubbleId>` para preseleccionar el PR.
    try {
      localStorage.setItem(`eco.git.subtab.${bubbleId}`, 'prs');
      localStorage.setItem(`eco.git.pending_pr.${bubbleId}`, String(currentPr.number));
    } catch { /* noop */ }
    onGoToGit();
    // Emitimos también los eventos para el caso en que el tab Git ya esté
    // montado (no hay re-mount, solo cambio de sub-tab + selección de PR).
    ecoEmit('eco:switch_git_subtab', { sub: 'prs', bubbleId });
    ecoEmit('eco:open_pr', { bubbleId, prNumber: currentPr.number });
  }

  // El card entero es clickeable: abre el tab Git. El chip de PR tiene su
  // propio onClick + stopPropagation para que sólo dispare la navegación
  // al detalle del PR, no a la sub-pestaña por default.
  const stateColor = currentPr ? prStateColor(t, currentPr.state) : t.text3;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onGoToGit}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGoToGit(); } }}
      title={tr('git.minidock.tooltip')}
      className="eco-vstack"
      style={{ gap: 10, cursor: 'pointer' }}>
      {/* Rama actual */}
      <div
        className="eco-hstack eco-mono"
        title={op.inProgress ? tr(OP_LABEL_KEYS[op.inProgress]) : (detached ? tr('git.topbar.branch.detached_tooltip', { name: branchName }) : tr('git.topbar.branch.current_tooltip', { name: branchName }))}
        style={{
          gap: 8, minHeight: 36, padding: '0 14px', borderRadius: 18,
          background: t.raised, fontSize: 12.5,
          ...(op.inProgress ? { boxShadow: `inset 0 0 0 1px ${t.err}` } : {}),
        }}>
        <span className="eco-muted" style={{ display: 'inline-flex', flex: 'none' }}><IconBranch size={14}/></span>
        <span className="eco-truncate eco-grow">
          {detached ? `${tr('git.topbar.branch.detached_prefix')} ${branchName}` : branchName}
        </span>
        {op.inProgress && (
          <span style={{
            flex: 'none', padding: '1px 7px', borderRadius: 7,
            background: t.err, color: t.sheet,
            fontSize: 11, fontWeight: 600,
          }}>!</span>
        )}
      </div>

      {/* PR asociado a la rama actual (si existe) */}
      {currentPr && (
        <div
          role="button"
          tabIndex={0}
          onClick={openPrDetail}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPrDetail(e as unknown as React.MouseEvent); } }}
          title={tr('git.minidock.pr_tooltip', { n: currentPr.number, title: currentPr.title })}
          className="eco-vstack"
          style={{
            gap: 6, padding: '14px 16px', borderRadius: 16,
            background: t.raised, cursor: 'pointer',
          }}>
          <div className="eco-hstack eco-mono" style={{ gap: 8, fontSize: 12 }}>
            <span className="eco-grow eco-truncate" style={{ fontWeight: 500, color: stateColor }}>
              {task ? task.id : `#${currentPr.number}`}
            </span>
            {task && <span className="eco-faint" style={{ flex: 'none' }}>#{currentPr.number}</span>}
            <span style={{
              flex: 'none', padding: '1px 8px', borderRadius: 8,
              background: `color-mix(in oklab, ${stateColor} 14%, transparent)`,
              color: stateColor,
              fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
            }}>{(currentPr.isDraft ? 'draft' : currentPr.state).toLowerCase()}</span>
          </div>
          <span className="eco-label" style={{
            lineHeight: 1.35, textWrap: 'pretty',
            overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
          }}>{task?.name || currentPr.title}</span>
          {currentPr.state === 'OPEN' && (checks.total > 0 || conflicting) && (
            <div className="eco-hstack eco-hstack--wrap eco-muted" style={{ gap: '4px 10px', fontSize: 12.5 }}>
              {checks.total > 0 && (
                <span className="eco-hstack" style={{ gap: 8 }}>
                  <span className="eco-dot" style={{
                    width: 7, height: 7,
                    background: checks.failed > 0 ? t.err : checks.pending > 0 ? t.warn : t.ok,
                  }}/>
                  {checks.failed > 0
                    ? tr('git.minidock.checks_failed', { n: checks.failed, total: checks.total })
                    : checks.pending > 0
                      ? tr('git.minidock.checks_pending', { n: checks.passed, total: checks.total })
                      : tr('git.minidock.checks_ok', { total: checks.total })}
                </span>
              )}
              {conflicting && <span style={{ color: t.err }}>{tr('git.minidock.conflicts')}</span>}
            </div>
          )}
        </div>
      )}

      {/* baseBranch (de dónde salió el worktree) */}
      {baseBranch && (
        <div className="eco-sub eco-truncate"
          title={tr('git.minidock.worktree_from_tooltip', { branch: baseBranch })}>
          {tr('git.minidock.worktree_from_label')}{' '}
          <span className="eco-mono eco-muted">{baseBranch}</span>
        </div>
      )}
    </div>
  );
}
