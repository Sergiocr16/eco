import type { ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import { IconBranch, IconCpu, IconGithub } from '@/design/icons';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useBubbleDevServers } from '@/hooks/useDevServers';
import { useBranches } from '@/hooks/useBranches';
import { useCurrentPr } from '@/hooks/useCurrentPr';
import { useT } from '@/hooks/useI18n';
import { taskFromPrTitle } from '@/components/GitMiniDock';
import type { Bubble } from '@/lib/types';

// Lo que ocupa el lado izquierdo libre de la franja del dock: el estado de la
// bubble abierta.

const PR_COLOR: Record<string, string> = { OPEN: '#22c55e', MERGED: '#a855f7', CLOSED: '#ef4444' };
const CHIP_HEIGHT = 28;

function Chip({ children, onClick, title, mono, wide }: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  mono?: boolean;
  wide?: boolean;
}) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        height: CHIP_HEIGHT, padding: '0 10px', borderRadius: t.r2,
        border: `1px solid ${t.glassBorder}`,
        background: t.glassBg,
        color: t.text1,
        fontFamily: mono ? t.fontMono : t.fontSans, fontSize: mono ? 12 : 12,
        whiteSpace: 'nowrap', maxWidth: wide ? 420 : 240, minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      }}>
      {children}
    </button>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }}/>;
}

export function DockBubbleStatus({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const tr = useT();
  const workspace = bubble.workspace || '';
  const { data } = useBranches(workspace, bubble.id);
  const { pr } = useCurrentPr(workspace, bubble.id);
  const dev = useBubbleDevServers(bubble.id);
  if (!workspace) return null;

  const current = data?.branches.find((b) => b.isCurrent && !b.isRemote);
  const ahead = current?.ahead ?? 0;
  const behind = current?.behind ?? 0;
  const task = pr ? taskFromPrTitle(pr.title) : null;
  const goTo = (tab: 'git' | 'server') => ecoEmit('eco:switch_tab', { tab, bubbleId: bubble.id });
  const live = Object.entries(dev).filter(([, d]) => d.status === 'running' || d.status === 'starting');

  return (
    <>
      {data?.current && (
        <Chip mono onClick={() => goTo('git')} title={tr('git.minidock.tooltip')}>
          <IconBranch size={13}/>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.current}</span>
          {(ahead > 0 || behind > 0) && (
            <span style={{ color: t.text3 }}>↑{ahead} ↓{behind}</span>
          )}
        </Chip>
      )}
      {pr && (
        <Chip wide onClick={() => {
          try {
            localStorage.setItem(`eco.git.subtab.${bubble.id}`, 'prs');
            localStorage.setItem(`eco.git.pending_pr.${bubble.id}`, String(pr.number));
          } catch { /* noop */ }
          goTo('git');
          ecoEmit('eco:switch_git_subtab', { sub: 'prs', bubbleId: bubble.id });
          ecoEmit('eco:open_pr', { bubbleId: bubble.id, prNumber: pr.number });
        }} title={tr('git.minidock.pr_tooltip', { n: pr.number, title: pr.title })}>
          <IconGithub size={13}/>
          <Dot color={PR_COLOR[pr.state] ?? t.text3}/>
          {task ? (
            <>
              <span style={{ fontFamily: t.fontMono, fontSize: 12, color: t.text2 }}>{task.id}</span>
              {task.name && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.name}</span>}
            </>
          ) : <span>#{pr.number}</span>}
        </Chip>
      )}
      {live.map(([role, d]) => (
        <Chip key={role} mono onClick={() => goTo('server')} title={d.url || undefined}>
          <IconCpu size={13}/>
          <Dot color={d.status === 'running' ? t.ok : t.warn}/>
          <span>{role}{portOf(d.url)}</span>
        </Chip>
      ))}
    </>
  );
}

function portOf(url: string): string {
  try { const p = new URL(url).port; return p ? ` :${p}` : ''; } catch { return ''; }
}
