import { cssZoom } from '@/lib/ui-zoom';
// Banner sticky en la parte superior del chat que indica si la rama
// actual del worktree del agente está asociada a un Pull Request. Si lo
// está, ofrece acciones: ver en GitHub, mergear (con dropdown de método)
// y cerrar el PR sin merge.
//
// El PR sale del store compartido `useCurrentPr` (mismo fetch que el bloque
// Git del sidebar): se refresca con `eco:git_refresh`, cuando el PTY del
// agente se aquieta (`gh pr create` desde la terminal) y por poll.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import { IconBtn } from '@/design/primitives';
import { IconBranch, IconCheck, IconX, IconAlert, IconExt, IconChevD, IconGithub } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useT } from '@/hooks/useI18n';
import { useCurrentPr, type CurrentPr } from '@/hooks/useCurrentPr';

type MergeMethod = 'merge' | 'squash' | 'rebase';

type Props = {
  workspace: string;
  bubbleId: string;
  /** Cuando se pasa, el número y el título del PR abren su detalle. */
  onOpenDetail?: (prNumber: number) => void;
};

export function CurrentPrBanner({ workspace, bubbleId, onOpenDetail }: Props) {
  const t = useTokens();
  const tr = useT();
  const { pr, loading, refresh: fetchCurrent } = useCurrentPr(workspace, bubbleId);
  const [busy, setBusy] = useState<'merging' | 'closing' | 'readying' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showMergeMenu, setShowMergeMenu] = useState(false);
  const [confirming, setConfirming] = useState<'close' | 'ready' | { method: MergeMethod } | null>(null);
  const mergeBtnRef = useRef<HTMLDivElement | null>(null);
  const mergeMenuRef = useRef<HTMLDivElement | null>(null);

  // Cerrar el dropdown de merge al hacer click afuera.
  useEffect(() => {
    if (!showMergeMenu) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      // El menú se portalea a <body>, así que cuenta como "dentro" tanto el
      // botón como el menú mismo.
      if (mergeBtnRef.current?.contains(target)) return;
      if (mergeMenuRef.current?.contains(target)) return;
      setShowMergeMenu(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showMergeMenu]);

  // Auto-clear feedback después de 4s.
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(id);
  }, [msg]);

  async function doMerge(method: MergeMethod) {
    if (!pr) return;
    setShowMergeMenu(false);
    setBusy('merging');
    setMsg(null);
    ecoEmit('eco:git_busy', { bubbleId, busy: true, kind: 'pr_merge', label: tr('prs.banner.merging') });
    try {
      const r = await apiFetch('/git/pr/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: pr.number, method }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ kind: 'ok', text: d.message || tr('prs.merge.ok', { n: pr.number }) });
        // Tras merge: refrescar — gh ya hace pull del base, así que la rama
        // actual podría cambiar a `main`/`master`.
        ecoEmit('eco:git_refresh', { bubbleId });
        await fetchCurrent();
        // Segundo refresh ~1.5 s después: GitHub a veces tarda en propagar el
        // merge a su API y la primera respuesta de `gh pr view` queda con
        // state=OPEN. El segundo intento captura state=MERGED.
        setTimeout(() => {
          ecoEmit('eco:git_refresh', { bubbleId });
          void fetchCurrent();
        }, 1500);
      } else {
        setMsg({ kind: 'err', text: d.error || tr('prs.merge.fail') });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusy(null);
      ecoEmit('eco:git_busy', { bubbleId, busy: false, kind: 'pr_merge' });
    }
  }

  async function doReady() {
    if (!pr) return;
    setConfirming(null);
    setBusy('readying');
    setMsg(null);
    ecoEmit('eco:git_busy', { bubbleId, busy: true, kind: 'pr_ready', label: tr('prs.banner.readying') });
    try {
      const r = await apiFetch('/git/pr/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: pr.number }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ kind: 'ok', text: d.message || tr('prs.ready.ok', { n: pr.number }) });
        ecoEmit('eco:git_refresh', { bubbleId });
        await fetchCurrent();
      } else {
        setMsg({ kind: 'err', text: d.error || tr('prs.ready.fail') });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusy(null);
      ecoEmit('eco:git_busy', { bubbleId, busy: false, kind: 'pr_ready' });
    }
  }

  async function doClose() {
    if (!pr) return;
    setConfirming(null);
    setBusy('closing');
    setMsg(null);
    ecoEmit('eco:git_busy', { bubbleId, busy: true, kind: 'pr_close', label: tr('prs.banner.closing') });
    try {
      const r = await apiFetch('/git/pr/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: pr.number }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ kind: 'ok', text: d.message || tr('prs.close.ok', { n: pr.number }) });
        ecoEmit('eco:git_refresh', { bubbleId });
        await fetchCurrent();
      } else {
        setMsg({ kind: 'err', text: d.error || tr('prs.close.fail') });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusy(null);
      ecoEmit('eco:git_busy', { bubbleId, busy: false, kind: 'pr_close' });
    }
  }

  // Nada que mostrar — no hay PR asociado a la rama actual.
  if (!loading && !pr && !msg) return null;

  // Caso edge: PR existió pero ahora está merged/closed — mantenemos el
  // banner para mostrar el estado en colores distintos hasta que el user
  // cambie de rama.
  const state = pr?.state ?? 'OPEN';
  const stateColor =
    state === 'MERGED' ? t.info
    : state === 'CLOSED' ? t.err
    : pr?.isDraft ? t.text2
    : t.ok;
  const stateLabel =
    state === 'MERGED' ? tr('prs.banner.state.merged')
    : state === 'CLOSED' ? tr('prs.banner.state.closed')
    : pr?.isDraft ? tr('prs.banner.state.draft')
    : tr('prs.banner.state.open');

  const conflicting = pr?.mergeable === 'CONFLICTING';
  const canMerge = !!pr && pr.state === 'OPEN' && !pr.isDraft && !conflicting && !busy;
  const canClose = !!pr && pr.state === 'OPEN' && !busy;
  const isDraft = !!pr?.isDraft;
  const canReady = !!pr && pr.state === 'OPEN' && isDraft && !busy;

  // La tarjeta se usa sobre la hoja (móvil): fondo `card`, piezas en `raised`.
  const shell = { padding: 14, borderRadius: 16, background: t.card } as const;

  if (!pr) {
    // Sin PR asociado a la rama actual — sólo mostramos un mensaje
    // transitorio si hay feedback pendiente (ej. tras un close).
    return msg ? (
      <div style={shell}>
        <FeedbackInline msg={msg} onClose={() => setMsg(null)}/>
      </div>
    ) : null;
  }

  const openDetailProps = onOpenDetail ? {
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onOpenDetail(pr.number),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(pr.number); }
    },
  } : {};

  return (
    <div style={{ ...shell, position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header: pill estado + ver en github */}
      <div className="eco-hstack" style={{ gap: 8 }}>
        <span
          {...openDetailProps}
          {...(onOpenDetail ? { title: tr('prs.banner.open_detail') } : {})}
          className="eco-chip eco-chip--on-card eco-mono"
          style={{ fontSize: 12, ...(onOpenDetail ? { cursor: 'pointer' } : {}) }}>
          <IconBranch size={12}/>
          PR #{pr.number}
        </span>
        <span style={{
          fontSize: 11.5, fontWeight: 500,
          padding: '1px 8px', borderRadius: 8, flexShrink: 0,
          color: stateColor,
          background: `color-mix(in oklab, ${stateColor} 13%, transparent)`,
        }}>{stateLabel}</span>
        <span className="eco-spacer"/>
        <a href={pr.url} target="_blank" rel="noopener noreferrer"
          title={tr('prs.banner.view_github_tooltip')}
          aria-label={tr('prs.banner.view_github_tooltip')}
          className="eco-iconbtn eco-iconbtn--xs">
          <IconExt size={13}/>
        </a>
      </div>

      {/* Título del PR */}
      <div
        {...openDetailProps}
        style={{
          fontWeight: 500, lineHeight: 1.4, color: t.text0,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden', textOverflow: 'ellipsis',
          wordBreak: 'break-word', textWrap: 'pretty',
          ...(onOpenDetail ? { cursor: 'pointer' } : {}),
        }} title={onOpenDetail ? tr('prs.banner.open_detail') : pr.title}>
        {pr.title}
      </div>

      {/* Ramas y conflictos */}
      <div className="eco-num" style={{
        display: 'flex', alignItems: 'center', gap: 6,
        flexWrap: 'wrap', rowGap: 4,
      }}>
        <span className="eco-truncate" style={{ maxWidth: '100%' }}
          title={`${pr.headRefName} → ${pr.baseRefName}`}>
          {pr.headRefName} → {pr.baseRefName}
        </span>
        {conflicting && (
          <span className="eco-chip eco-chip--err" style={{ fontSize: 11.5, padding: '1px 8px' }}>
            <IconAlert size={11}/> {tr('prs.banner.conflicts')}
          </span>
        )}
      </div>

      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16 }}
            style={{ overflow: 'hidden' }}>
            <FeedbackInline msg={msg} onClose={() => setMsg(null)}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Acciones — sólo PR abierto */}
      {pr.state === 'OPEN' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          {/* Mientras el PR es borrador, el merge está bloqueado por GitHub: en su
              lugar ofrecemos sacarlo de borrador (el sidebar no da para 3 botones). */}
          {isDraft && (
            <button type="button"
              onClick={() => setConfirming('ready')}
              disabled={!canReady}
              title={tr('prs.banner.ready_tooltip')}
              className="eco-btn eco-btn--xs eco-btn--solid"
              style={{ flex: 1, minWidth: 0 }}>
              <IconCheck size={13}/>
              <span className="eco-truncate">
                {busy === 'readying' ? tr('prs.banner.readying') : tr('prs.banner.ready_btn')}
              </span>
            </button>
          )}

          {/* Merge split button */}
          {!isDraft && (
            <div ref={mergeBtnRef} style={{ position: 'relative', display: 'inline-flex', gap: 1, flex: 1, minWidth: 0 }}>
              <button type="button"
                onClick={() => setConfirming({ method: 'merge' })}
                disabled={!canMerge}
                title={conflicting ? tr('prs.banner.conflict_tooltip') : tr('prs.banner.merge_tooltip')}
                className="eco-btn eco-btn--xs eco-btn--primary"
                style={{ flex: 1, minWidth: 0, borderRadius: '999px 0 0 999px' }}>
                <IconCheck size={13}/>
                <span className="eco-truncate">
                  {busy === 'merging' ? tr('prs.banner.merging') : tr('prs.banner.merge_btn')}
                </span>
              </button>
              <button type="button"
                onClick={() => setShowMergeMenu((v) => !v)}
                disabled={!canMerge}
                title={tr('prs.banner.merge_method_tooltip')}
                aria-label={tr('prs.banner.merge_method_tooltip')}
                className="eco-btn eco-btn--xs eco-btn--primary"
                style={{ padding: '0 9px 0 7px', borderRadius: '0 999px 999px 0' }}>
                <IconChevD size={13}/>
              </button>
              {/* Menú porteado a <body>. Sin AnimatePresence: un portal como
                  hijo directo de AnimatePresence no se trackea bien y el menú
                  no llegaba a montarse. */}
              {showMergeMenu && (() => {
                const r = mergeBtnRef.current?.getBoundingClientRect();
                // Px visuales → px CSS (zoom CSS en web).
                const z = cssZoom();
                return createPortal(
                    <div
                      ref={mergeMenuRef}
                      className="eco-menu"
                      style={{
                        position: 'fixed', zIndex: 400,
                        top: r ? r.bottom / z + 4 : 0,
                        right: r ? Math.max(8, (window.innerWidth - r.right) / z) : 8,
                        minWidth: 220,
                      }}>
                      {(['merge', 'squash', 'rebase'] as const).map((m) => (
                        <button key={m} type="button"
                          onClick={() => { setShowMergeMenu(false); setConfirming({ method: m }); }}
                          className="eco-menu__item"
                          style={{ height: 'auto', padding: '8px 10px', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                          <span className="eco-label">{m === 'merge' ? tr('prs.banner.method.merge.label') : m === 'squash' ? tr('prs.banner.method.squash.label') : tr('prs.banner.method.rebase.label')}</span>
                          <span className="eco-sub">
                            {m === 'merge' ? tr('prs.banner.method.merge.desc') : m === 'squash' ? tr('prs.banner.method.squash.desc') : tr('prs.banner.method.rebase.desc')}
                          </span>
                        </button>
                      ))}
                    </div>,
                    document.body,
                  );
              })()}
            </div>
          )}

          <button type="button"
            onClick={() => setConfirming('close')}
            disabled={!canClose}
            title={tr('prs.banner.close_tooltip')}
            className="eco-btn eco-btn--xs eco-btn--danger">
            <IconX size={13}/>
            {busy === 'closing' ? tr('prs.banner.closing') : tr('prs.banner.close_btn')}
          </button>
        </div>
      )}

      <AnimatePresence>
        {confirming === 'ready' && pr && (
          <ConfirmReadyDialog
            pr={pr}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void doReady()}/>
        )}
        {confirming === 'close' && pr && (
          <ConfirmCloseDialog
            pr={pr}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void doClose()}/>
        )}
        {confirming && confirming !== 'close' && confirming !== 'ready' && pr && (
          <ConfirmMergeDialog
            pr={pr}
            method={confirming.method}
            onCancel={() => setConfirming(null)}
            onConfirm={() => {
              const m = confirming.method;
              setConfirming(null);
              void doMerge(m);
            }}/>
        )}
      </AnimatePresence>
    </div>
  );
}

function FeedbackInline({
  msg, onClose,
}: {
  msg: { kind: 'ok' | 'err'; text: string };
  onClose: () => void;
}) {
  const tr = useT();
  return (
    <div className={`eco-banner eco-banner--${msg.kind} eco-mono`} style={{
      flexWrap: 'nowrap', alignItems: 'flex-start', gap: 8, padding: '8px 12px',
      fontSize: 11.5, maxHeight: 90, overflow: 'auto', wordBreak: 'break-word',
    }}>
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        {msg.kind === 'ok' ? <IconCheck size={12}/> : <IconAlert size={12}/>}
      </span>
      <span style={{ flex: 1, whiteSpace: 'pre-wrap', minWidth: 0 }}>{msg.text}</span>
      <button type="button" onClick={onClose} aria-label={tr('common.close')}
        style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'inline-flex' }}>
        <IconX size={12}/>
      </button>
    </div>
  );
}

// Marco común de los tres diálogos de confirmación. Portal a <body> para que
// ningún ancestro con transform atrape el position:fixed.
function ConfirmShell({
  title, prTitle, children, onCancel, confirm, danger,
}: {
  title: string;
  prTitle: string;
  children: ReactNode;
  onCancel: () => void;
  confirm: ReactNode;
  danger?: boolean;
}) {
  const t = useTokens();
  const tr = useT();
  return createPortal((
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="eco-scrim"
      style={{ zIndex: 9999 }}
      onClick={onCancel}>
      <div className={`eco-dialog${danger ? ' eco-dialog--danger' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className={`eco-dialog__tile${danger ? ' eco-dialog__tile--danger' : ''}`}>
            {danger ? <IconAlert size={20}/> : <IconGithub size={20}/>}
          </span>
          <h2 className="eco-dialog__title">{title}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__section">
          <div><code style={codeChip(t)}>{prTitle}</code></div>
          <div className="eco-dialog__body">{children}</div>
        </div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            {confirm}
          </div>
        </div>
      </div>
    </motion.div>
  ), document.body);
}

function codeChip(t: ReturnType<typeof useTokens>) {
  return {
    fontFamily: t.fontMono, fontSize: 12,
    padding: '2px 9px', borderRadius: 8,
    background: t.card, color: t.text0,
    overflowWrap: 'anywhere',
  } as const;
}

function ConfirmMergeDialog({
  pr, method, onCancel, onConfirm,
}: {
  pr: CurrentPr;
  method: MergeMethod;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const methodLabel = method === 'merge' ? tr('prs.banner.confirm_merge.method_merge.label')
    : method === 'squash' ? tr('prs.banner.confirm_merge.method_squash.label')
    : tr('prs.banner.confirm_merge.method_rebase.label');
  const methodDesc = method === 'merge' ? tr('prs.banner.confirm_merge.method_merge.desc')
    : method === 'squash' ? tr('prs.banner.confirm_merge.method_squash.desc')
    : tr('prs.banner.confirm_merge.method_rebase.desc');
  return (
    <ConfirmShell
      title={tr('prs.banner.confirm_merge.title', { n: pr.number })}
      prTitle={pr.title}
      onCancel={onCancel}
      confirm={<button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={onConfirm}>{tr('prs.banner.merge_btn')}</button>}>
      {tr('prs.banner.confirm_merge.method')}: <strong style={{ color: t.text0 }}>{methodLabel}</strong> — {methodDesc}
    </ConfirmShell>
  );
}

function ConfirmReadyDialog({
  pr, onCancel, onConfirm,
}: {
  pr: CurrentPr;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tr = useT();
  return (
    <ConfirmShell
      title={tr('prs.banner.confirm_ready.title', { n: pr.number })}
      prTitle={pr.title}
      onCancel={onCancel}
      confirm={<button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={onConfirm}>{tr('prs.ready_confirm.confirm')}</button>}>
      {tr('prs.banner.confirm_ready.body')}
    </ConfirmShell>
  );
}

function ConfirmCloseDialog({
  pr, onCancel, onConfirm,
}: {
  pr: CurrentPr;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  return (
    <ConfirmShell
      title={tr('prs.banner.confirm_close.title', { n: pr.number })}
      prTitle={pr.title}
      onCancel={onCancel}
      danger
      confirm={<button type="button" className="eco-btn eco-btn--lg eco-btn--danger-solid" onClick={onConfirm}>{tr('prs.detail.close_btn')}</button>}>
      {tr('prs.banner.confirm_close.body_pre')}
      <code style={{ ...codeChip(t), margin: '0 4px' }}>{pr.headRefName}</code>
      {tr('prs.banner.confirm_close.body_post')}
    </ConfirmShell>
  );
}
