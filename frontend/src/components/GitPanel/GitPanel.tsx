import { useEffect, useState, type ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import { IconBranch, IconFile, IconLayers, IconGlobe } from '@/design/icons';
import { on as ecoOn } from '@/lib/eco-bus';
import type { Bubble } from '@/lib/types';
import { BranchesView } from './BranchesView';
import { ChangesView, type FileChange } from './ChangesView';
import { HistoryView } from './HistoryView';
import { PRsView } from './PRsView';
import { OpInProgressBanner } from './OpInProgressBanner';

export type GitSubtab = 'branches' | 'history' | 'changes' | 'prs';

type Props = {
  bubble: Bubble;
  workspace: string;
  bubbleId: string;
  filesChanged: FileChange[];
  gitChangesLoading: boolean;
  onRename?: (name: string) => void;
};

const STORAGE_PREFIX = 'eco.git.subtab.';

function loadSubtab(bubbleId: string): GitSubtab {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + bubbleId);
    if (raw === 'branches' || raw === 'history' || raw === 'changes' || raw === 'prs') {
      return raw;
    }
  } catch { /* noop */ }
  return 'changes';
}

function saveSubtab(bubbleId: string, sub: GitSubtab) {
  try { localStorage.setItem(STORAGE_PREFIX + bubbleId, sub); } catch { /* noop */ }
}

export function GitPanel({ bubble, workspace, bubbleId, filesChanged, gitChangesLoading, onRename }: Props) {
  const t = useTokens();
  const [sub, setSub] = useState<GitSubtab>(() => loadSubtab(bubbleId));

  // Reaccionar a voice commands tipo "Eco historial" / "Eco ramas".
  useEffect(() => {
    return ecoOn('eco:switch_git_subtab', (e) => {
      if (e.bubbleId && e.bubbleId !== bubbleId) return;
      setSub(e.sub);
    });
  }, [bubbleId]);

  // Persistir cuando cambia.
  useEffect(() => { saveSubtab(bubbleId, sub); }, [bubbleId, sub]);

  const pending = filesChanged.filter((f) => f.unstaged !== false).length;

  const subnav: { id: GitSubtab; label: string; icon: typeof IconBranch; badge?: number }[] = [
    { id: 'changes', label: 'Cambios', icon: IconFile, badge: pending || undefined },
    { id: 'history', label: 'Historial', icon: IconLayers },
    { id: 'branches', label: 'Ramas', icon: IconBranch },
    { id: 'prs', label: 'PRs', icon: IconGlobe },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Sub-nav */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '8px 20px', borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg1,
        flexShrink: 0, overflowX: 'auto',
      }}>
        {subnav.map((s) => (
          <SubtabBtn
            key={s.id}
            active={sub === s.id}
            label={s.label}
            icon={<s.icon size={13}/>}
            badge={s.badge}
            onClick={() => setSub(s.id)}
          />
        ))}
      </div>

      {/* Banner sticky de op en progreso */}
      <OpInProgressBanner
        workspace={workspace}
        bubbleId={bubbleId}
        onGoChanges={() => setSub('changes')}
      />

      {/* Contenido */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {sub === 'changes' && (
          <ChangesView
            files={filesChanged}
            workspace={workspace}
            bubbleId={bubbleId}
            bubble={bubble}
            loading={gitChangesLoading}
          />
        )}
        {sub === 'history' && (
          <HistoryView workspace={workspace} bubbleId={bubbleId} />
        )}
        {sub === 'branches' && (
          <BranchesView workspace={workspace} bubbleId={bubbleId} onRenameAgent={onRename} />
        )}
        {sub === 'prs' && (
          <PRsView workspace={workspace} bubbleId={bubbleId} />
        )}
      </div>
    </div>
  );
}

function SubtabBtn({
  active, label, icon, badge, onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  badge?: number;
  onClick: () => void;
}) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8,
        border: 0,
        background: active ? t.accentDim : 'transparent',
        color: active ? t.accentOn : t.text1,
        fontFamily: t.fontSans, fontSize: 12, fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}>
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span style={{
          minWidth: 18, height: 18, padding: '0 5px',
          borderRadius: 9,
          background: active ? t.accentOn : t.accent,
          color: active ? t.accentDim : t.accentOn,
          fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</span>
      )}
    </button>
  );
}
