import { createPortal } from 'react-dom';
import { useTokens } from '@/design/theme';
import { IconBtn } from '@/design/primitives';
import { IconAlert, IconBranch, IconX } from '@/design/icons';
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
    <div className="eco-scrim" onClick={busy ? undefined : onCancel}>
      <div role="dialog" aria-modal="true" className="eco-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconBranch size={20}/></span>
          <h2 className="eco-dialog__title">{holder.branch
            ? tr('git.takeover.title', { branch: holder.branch })
            : tr('git.takeover.title_nobranch')}</h2>
          <IconBtn icon={IconX} size={32} onClick={busy ? undefined : onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body">
          {tr(holder.bubbleId ? 'git.takeover.held_by_bubble' : 'git.takeover.held_by_path')}{' '}
          <span style={{ fontWeight: 600, color: t.text0, wordBreak: 'break-all' }}>{where}</span>
          {holder.archived && (
            <span className="eco-faint"> {tr('git.takeover.archived')}</span>
          )}
        </div>
        <div className="eco-sub" style={{ lineHeight: 1.5 }}>
          {tr(holder.bubbleId ? 'git.takeover.body_bubble' : 'git.takeover.body_detach')}
        </div>
        {holder.dirty && (
          <div className="eco-banner eco-banner--warn" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0, marginTop: 2, display: 'flex' }}>
              <IconAlert size={14}/>
            </span>
            <span>{tr('git.takeover.dirty')}</span>
          </div>
        )}
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel} disabled={busy}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={onConfirm} disabled={busy}>
              {busy ? tr('git.takeover.moving') : tr('git.takeover.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
