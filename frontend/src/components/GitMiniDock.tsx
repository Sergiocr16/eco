import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { Glass } from '@/design/primitives';
import { IconBranch, IconBolt } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useBranches } from '@/hooks/useBranches';
import { useGitOpStatus } from '@/hooks/useGitOpStatus';
import { CurrentPrBanner } from '@/components/CurrentPrBanner';
import { CommitWithAI } from '@/components/CommitWithAI';
import { PushButton } from '@/components/PushButton';

type Props = {
  workspace: string;
  bubbleId: string;
  baseBranch?: string | null;
  // Cuando el user clickea "Abrir Git" o el chip de rama, navegamos al tab Git.
  onGoToGit: (sub?: 'branches' | 'changes' | 'history' | 'prs') => void;
};

const OP_LABEL = {
  'cherry-pick': 'Cherry-pick en conflicto',
  merge: 'Merge en conflicto',
  revert: 'Revert en conflicto',
} as const;

export function GitMiniDock({ workspace, bubbleId, baseBranch, onGoToGit }: Props) {
  const t = useTokens();
  const { data: branchesData } = useBranches(workspace, bubbleId);
  const op = useGitOpStatus(workspace, bubbleId);
  const [showCommit, setShowCommit] = useState(false);

  const current = branchesData?.branches.find((b) => b.isCurrent);
  const branchName = branchesData?.current ?? '—';
  const detached = branchesData?.detached ?? false;
  const ahead = current?.ahead ?? 0;
  const behind = current?.behind ?? 0;

  async function pull() {
    try {
      await apiFetch('/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId }),
      });
      ecoEmit('eco:git_refresh', { bubbleId });
    } catch { /* noop */ }
  }

  return (
    <Glass radius={12} style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Chip rama + ahead/behind + open Git */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => onGoToGit('branches')}
          title="Abrir tab Git → Ramas"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 8,
            background: t.bg2, border: `1px solid ${op.inProgress ? t.err : t.glassBorder}`,
            color: t.text0, cursor: 'pointer',
            flex: 1, minWidth: 0,
          }}>
          <IconBranch size={12}/>
          <code style={{
            fontFamily: t.fontMono, fontSize: 11.5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            flex: 1, textAlign: 'left',
          }}>{detached ? `(detached) ${branchName}` : branchName}</code>
          {op.inProgress && (
            <span title={OP_LABEL[op.inProgress]} style={{
              padding: '1px 5px', borderRadius: 4,
              background: t.err, color: '#fff',
              fontSize: 9.5, fontWeight: 700,
            }}>!</span>
          )}
        </button>
      </div>

      {/* Ahead/behind quick actions */}
      {(ahead > 0 || behind > 0) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {ahead > 0 && (
            <button type="button" onClick={() => onGoToGit('changes')} title="Tenés commits sin pushear"
              style={pillBtn(t, t.ok)}>
              ↑{ahead}
            </button>
          )}
          {behind > 0 && (
            <button type="button" onClick={() => void pull()} title="Tenés commits remotos sin traer — click para pull"
              style={pillBtn(t, t.warn)}>
              ↓{behind}
            </button>
          )}
          <div style={{ flex: 1 }}/>
        </div>
      )}

      {/* PR banner contextual */}
      <CurrentPrBanner workspace={workspace} bubbleId={bubbleId}/>

      {/* baseBranch info (sigue siendo útil ver de dónde salió el worktree) */}
      {baseBranch && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', borderRadius: 7,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
          fontSize: 10.5, color: t.text3,
        }}
        title={`El worktree de esta burbuja salió de la rama "${baseBranch}" del repo padre.`}>
          <span>worktree de</span>
          <code style={{
            fontFamily: t.fontMono, fontSize: 10.5, color: t.text2,
            padding: '0 4px', borderRadius: 3,
            background: t.bg3,
          }}>{baseBranch}</code>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => setShowCommit((v) => !v)}
          style={dockBtn(t, t.accentDim, t.accentOn)}>
          <IconBolt size={11}/>
          Commit
        </button>
        <PushButtonCompact workspace={workspace} bubbleId={bubbleId}/>
      </div>

      {showCommit && (
        <CommitWithAI
          workspace={workspace}
          bubbleId={bubbleId}
          onCommitted={() => setShowCommit(false)}
        />
      )}

      <button
        type="button"
        onClick={() => onGoToGit()}
        style={{
          height: 24, padding: '0 8px', borderRadius: 6, border: 0,
          background: 'transparent',
          color: t.text2, fontFamily: t.fontSans, fontSize: 10.5,
          cursor: 'pointer', textAlign: 'center',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = t.accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = t.text2; }}>
        Abrir tab Git completo →
      </button>
    </Glass>
  );
}

function pillBtn(t: ReturnType<typeof useTokens>, color: string): React.CSSProperties {
  return {
    height: 22, padding: '0 8px', borderRadius: 5, border: 0,
    background: `color-mix(in oklch, ${color} 18%, transparent)`,
    color, fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
    cursor: 'pointer',
  };
}

function dockBtn(t: ReturnType<typeof useTokens>, bg: string, fg: string): React.CSSProperties {
  return {
    flex: 1, height: 26, padding: '0 8px', borderRadius: 6, border: 0,
    background: bg, color: fg,
    fontFamily: t.fontSans, fontSize: 11, fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  };
}

// Push wrapper compacto — el original tiene padding/title/etc. que ocupa
// mucho espacio en el dock. Reusamos la lógica via el componente original
// pero envuelto en un container que limita altura.
function PushButtonCompact({ workspace, bubbleId }: { workspace: string; bubbleId: string }) {
  return (
    <div style={{ flex: 1 }}>
      <PushButton workspace={workspace} bubbleId={bubbleId}/>
    </div>
  );
}
