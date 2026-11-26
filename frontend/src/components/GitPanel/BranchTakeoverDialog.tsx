import { createPortal } from 'react-dom';
import { vw } from '@/lib/ui-zoom';
import { useTokens } from '@/design/theme';
import { scrimStyle, dialogSurface } from '@/design/primitives';
import { IconAlert } from '@/design/icons';
import { useT } from '@/hooks/useI18n';

// Lo que devuelve el backend con code 'checkout.branch_in_other_worktree'.
export type BranchHolderInfo = {
  path: string;
  branch?: string;
  bubbleId?: string;
  dirty: boolean;
  title?: string;
  archived?: boolean;
};

/** Respuesta de /git/checkout o /git/pr/checkout → holder, si la rama la tiene otro worktree. */
export function branchHolderFrom(d: unknown): BranchHolderInfo | null {
  if (!d || typeof d !== 'object') return null;
  const r = d as { code?: unknown; holder?: BranchHolderInfo; holderTitle?: string; holderArchived?: boolean };
  if (r.code !== 'checkout.branch_in_other_worktree' || !r.holder?.path) return null;
  return { ...r.holder, title: r.holderTitle, archived: r.holderArchived };
}

export function BranchTakeoverDialog({ holder, busy, onCancel, onConfirm }: {
  holder: BranchHolderInfo;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const where = holder.bubbleId
    ? (holder.title || holder.bubbleId)
    : holder.path;
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      ...scrimStyle(t),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={busy ? undefined : onCancel}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{
        width: 500, maxWidth: vw(92), padding: 20, borderRadius: 12,
        ...dialogSurface(t, { border: t.accent }),
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text0 }}>
          {holder.branch
            ? tr('git.takeover.title', { branch: holder.branch })
            : tr('git.takeover.title_nobranch')}
        </div>
        <div style={{ fontSize: 12.5, color: t.text1, lineHeight: 1.55 }}>
          {tr(holder.bubbleId ? 'git.takeover.held_by_bubble' : 'git.takeover.held_by_path')}{' '}
          <span style={{ fontWeight: 600, color: t.text0, wordBreak: 'break-all' }}>{where}</span>
          {holder.archived && (
            <span style={{ color: t.text3 }}> {tr('git.takeover.archived')}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5 }}>
          {tr(holder.bubbleId ? 'git.takeover.body_bubble' : 'git.takeover.body_detach')}
        </div>
        {holder.dirty && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '8px 10px', borderRadius: 8,
            background: `color-mix(in oklab, ${t.warn} 14%, transparent)`,
            border: `1px solid color-mix(in oklab, ${t.warn} 35%, transparent)`,
            color: t.text1, fontSize: 12, lineHeight: 1.5,
          }}>
            <span style={{ color: t.warn, flexShrink: 0, marginTop: 2, display: 'flex' }}>
              <IconAlert size={14}/>
            </span>
            <span>{tr('git.takeover.dirty')}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{
              height: 28, padding: '0 14px', borderRadius: 7,
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.glassBorder}`,
              fontFamily: t.fontSans, fontSize: 12,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}>{tr('common.cancel')}</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            style={{
              height: 28, padding: '0 14px', borderRadius: 7, border: 0,
              background: t.accent, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
            }}>{busy ? tr('git.takeover.moving') : tr('git.takeover.confirm')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
