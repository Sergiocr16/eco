import { useEffect, useState, type ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import { IconGithub, IconLayers, IconGlobe } from '@/design/icons';
import { on as ecoOn } from '@/lib/eco-bus';
import type { Bubble } from '@/lib/types';
import { ChangesView, type FileChange } from './ChangesView';
import { HistoryView } from './HistoryView';
import { PRsView } from './PRsView';
import { OpInProgressBanner } from './OpInProgressBanner';
import { GitTopBar } from './GitTopBar';

export type GitSubtab = 'changes' | 'history' | 'prs';

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
    // Migración: 'branches' viejo → 'changes' (las ramas viven en el top bar).
    if (raw === 'branches') return 'changes';
    if (raw === 'history' || raw === 'changes' || raw === 'prs') return raw;
  } catch { /* noop */ }
  return 'changes';
}

function saveSubtab(bubbleId: string, sub: GitSubtab) {
  try { localStorage.setItem(STORAGE_PREFIX + bubbleId, sub); } catch { /* noop */ }
}

export function GitPanel({ bubble, workspace, bubbleId, filesChanged, gitChangesLoading, onRename }: Props) {
  const t = useTokens();
  const [sub, setSub] = useState<GitSubtab>(() => loadSubtab(bubbleId));

  // Reaccionar a voice commands tipo "Eco historial".
  useEffect(() => {
    return ecoOn('eco:switch_git_subtab', (e) => {
      if (e.bubbleId && e.bubbleId !== bubbleId) return;
      // Migración: 'branches' del bus viejo → 'changes' (no hay sub-tab Ramas).
      const next = e.sub === 'changes' || e.sub === 'history' || e.sub === 'prs' ? e.sub : 'changes';
      setSub(next);
    });
  }, [bubbleId]);

  useEffect(() => { saveSubtab(bubbleId, sub); }, [bubbleId, sub]);

  const pending = filesChanged.filter((f) => f.unstaged !== false).length;

  const subnav: { id: GitSubtab; label: string; icon: typeof IconGithub; badge?: number }[] = [
    { id: 'changes', label: 'Cambios', icon: IconGithub, badge: pending || undefined },
    { id: 'history', label: 'Historial', icon: IconLayers },
    { id: 'prs', label: 'PRs', icon: IconGlobe },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Top bar persistente (branch + sync + ⋯) */}
      <GitTopBar
        workspace={workspace}
        bubbleId={bubbleId}
        onOpenPRs={() => setSub('prs')}
        onRenameAgent={onRename}
      />

      {/* Sub-nav */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 16px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg0,
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
        padding: '5px 12px', borderRadius: 7,
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
