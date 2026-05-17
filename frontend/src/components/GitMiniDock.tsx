import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconBranch } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit, on as ecoOn } from '@/lib/eco-bus';
import { useBranches } from '@/hooks/useBranches';
import { useGitOpStatus } from '@/hooks/useGitOpStatus';
import { useT } from '@/hooks/useI18n';

type Props = {
  workspace: string;
  bubbleId: string;
  baseBranch?: string | null;
  // Abre el tab Git (todas las acciones reales — commit, push, fetch,
  // historial, etc. — viven ahí adentro).
  onGoToGit: () => void;
};


type CurrentPr = {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
  url: string;
};

type CurrentPrResult =
  | { ok: true; pr: CurrentPr | null }
  | { ok: false; error: string };

const STATE_COLOR: Record<string, string> = {
  OPEN: '#22c55e',
  MERGED: '#a855f7',
  CLOSED: '#ef4444',
};

export function GitMiniDock({ workspace, bubbleId, baseBranch, onGoToGit }: Props) {
  const t = useTokens();
  const tr = useT();
  const opLabelConflict = (op: 'cherry-pick' | 'merge' | 'revert') =>
    op === 'cherry-pick' ? tr('detail.git.ops.cherry_pick_conflicting')
      : op === 'merge' ? tr('detail.git.ops.merge_conflicting')
      : tr('detail.git.ops.revert_conflicting');
  const { data: branchesData } = useBranches(workspace, bubbleId);
  const op = useGitOpStatus(workspace, bubbleId);
  const [hover, setHover] = useState(false);
  const [hoverPr, setHoverPr] = useState(false);
  const [currentPr, setCurrentPr] = useState<CurrentPr | null>(null);

  const branchName = branchesData?.current ?? '—';
  const detached = branchesData?.detached ?? false;

  // Detección de PR asociado a la rama actual. Se refetch cuando cambia
  // el branch (eco:git_refresh tras checkout) o al recibir eventos del bus.
  useEffect(() => {
    if (!workspace || !bubbleId) { setCurrentPr(null); return; }
    let cancelled = false;
    const fetchPr = async () => {
      try {
        const params = new URLSearchParams({ workspace, bubbleId });
        const r = await apiFetch(`/git/pr/current?${params}`);
        if (!r.ok) return;
        const data = await r.json() as CurrentPrResult;
        if (cancelled) return;
        if (data.ok) setCurrentPr(data.pr); else setCurrentPr(null);
      } catch { /* gh puede no estar disponible — silenciamos */ }
    };
    void fetchPr();
    // Refetch cuando algo cambia el estado git (checkout, commit, etc.).
    const offBus = ecoOn('eco:git_refresh', (e) => {
      if (e.bubbleId !== bubbleId) return;
      void fetchPr();
    });
    return () => { cancelled = true; offBus(); };
  }, [workspace, bubbleId, branchesData?.current]);

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
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onGoToGit}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGoToGit(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={tr('detail.git.minidock.open_git_title')}
      style={{ cursor: 'pointer' }}>
      <div style={{
        padding: 10, borderRadius: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        background: t.bg2,
        border: hover ? `1px solid ${t.accent}` : '1px solid transparent',
        transition: 'border-color 120ms',
      }}>
        {/* Rama actual */}
        <div
          title={op.inProgress
            ? opLabelConflict(op.inProgress)
            : (detached ? tr('detail.git.topbar.detached_title', { branch: branchName }) : tr('detail.git.minidock.current_branch_title', { branch: branchName }))}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 8,
            background: t.bg3,
            ...(op.inProgress ? { border: `1px solid ${t.err}` } : {}),
            color: t.text0,
          }}>
          <IconBranch size={12}/>
          <code style={{
            fontFamily: t.fontMono, fontSize: 11.5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            flex: 1, minWidth: 0,
          }}>{detached ? `(detached) ${branchName}` : branchName}</code>
          {op.inProgress && (
            <span style={{
              padding: '1px 5px', borderRadius: 4,
              background: t.err, color: '#fff',
              fontSize: 9.5, fontWeight: 700,
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
            onMouseEnter={(e) => { e.stopPropagation(); setHoverPr(true); }}
            onMouseLeave={() => setHoverPr(false)}
            title={tr('detail.git.minidock.pr_detail_title', { n: currentPr.number, title: currentPr.title })}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 8px', borderRadius: 8,
              background: hoverPr ? t.accentFaint : t.bg3,
              border: `1px solid ${hoverPr ? t.accent : t.glassBorder}`,
              color: t.text0,
              cursor: 'pointer',
              transition: 'background 120ms, border-color 120ms',
            }}>
            <span style={{
              fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 700,
              color: STATE_COLOR[currentPr.state] ?? t.accent,
              flexShrink: 0,
            }}>#{currentPr.number}</span>
            <span style={{
              flex: 1, minWidth: 0, fontSize: 11.5, color: t.text0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{currentPr.title}</span>
            <span style={{
              padding: '1px 5px', borderRadius: 4,
              background: `color-mix(in oklch, ${STATE_COLOR[currentPr.state] ?? t.accent} 18%, transparent)`,
              color: STATE_COLOR[currentPr.state] ?? t.accent,
              fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
              flexShrink: 0,
            }}>{currentPr.isDraft ? 'DRAFT' : currentPr.state}</span>
          </div>
        )}

        {/* baseBranch (de dónde salió el worktree) */}
        {baseBranch && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 7,
            background: t.bg3,
            fontSize: 10.5, color: t.text3,
          }}
          title={tr('detail.git.minidock.worktree_origin', { branch: baseBranch })}>
            <span>{tr('detail.git.minidock.worktree_label')}</span>
            <code style={{
              fontFamily: t.fontMono, fontSize: 10.5, color: t.text2,
              padding: '0 4px', borderRadius: 3,
              background: t.bg2,
            }}>{baseBranch}</code>
          </div>
        )}
      </div>
    </div>
  );
}
