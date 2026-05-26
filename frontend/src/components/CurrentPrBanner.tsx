// Banner sticky en la parte superior del chat que indica si la rama
// actual del worktree del agente está asociada a un Pull Request. Si lo
// está, ofrece acciones: ver en GitHub, mergear (con dropdown de método)
// y cerrar el PR sin merge.
//
// Carga vía `GET /git/pr/current` al montar + cuando se emite
// `eco:git_refresh` (típicamente tras un checkout de PR o cambio de rama
// vía BranchPicker).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import { Glass } from '@/design/primitives';
import {
  IconBranch, IconCheck, IconX, IconAlert, IconExt, IconChevD,
} from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { useT } from '@/hooks/useI18n';

type CurrentPr = {
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED' | string;
  isDraft: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | string;
  headRefName: string;
  baseRefName: string;
  author: string;
};

type CurrentResult =
  | { ok: true; pr: CurrentPr | null }
  | { ok: false; error: string };

type MergeMethod = 'merge' | 'squash' | 'rebase';

type Props = {
  workspace: string;
  bubbleId: string;
};

export function CurrentPrBanner({ workspace, bubbleId }: Props) {
  const t = useTokens();
  const tr = useT();
  const [pr, setPr] = useState<CurrentPr | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'merging' | 'closing' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showMergeMenu, setShowMergeMenu] = useState(false);
  const [confirming, setConfirming] = useState<'close' | { method: MergeMethod } | null>(null);
  const mergeBtnRef = useRef<HTMLDivElement | null>(null);
  const mergeMenuRef = useRef<HTMLDivElement | null>(null);

  const fetchCurrent = async () => {
    if (!workspace) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      const r = await apiFetch(`/git/pr/current?${params}`);
      const d = (await r.json()) as CurrentResult;
      if (d.ok) setPr(d.pr);
      else setPr(null);
    } catch {
      setPr(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, bubbleId]);

  useEffect(() => {
    return ecoOn('eco:git_refresh', (e) => {
      if (e.bubbleId !== bubbleId) return;
      void fetchCurrent();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleId]);

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
    state === 'MERGED' ? t.ok
    : state === 'CLOSED' ? t.err
    : pr?.isDraft ? t.text2
    : t.accent;
  const stateLabel =
    state === 'MERGED' ? tr('prs.banner.state.merged')
    : state === 'CLOSED' ? tr('prs.banner.state.closed')
    : pr?.isDraft ? tr('prs.banner.state.draft')
    : tr('prs.banner.state.open');

  const conflicting = pr?.mergeable === 'CONFLICTING';
  const canMerge = !!pr && pr.state === 'OPEN' && !pr.isDraft && !conflicting && !busy;
  const canClose = !!pr && pr.state === 'OPEN' && !busy;

  if (!pr) {
    // Sin PR asociado a la rama actual — sólo mostramos un mensaje
    // transitorio si hay feedback pendiente (ej. tras un close).
    return msg ? (
      <Glass radius={10} style={{ padding: 8 }}>
        <FeedbackInline msg={msg} onClose={() => setMsg(null)}/>
      </Glass>
    ) : null;
  }

  return (
    <Glass radius={10} style={{ padding: 10, borderColor: stateColor, position: 'relative' }}>
      {/* Header: pill estado + ver en github */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 999,
          background: `color-mix(in oklch, ${stateColor} 18%, transparent)`,
          color: stateColor,
          fontSize: 10, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 0.4,
          flexShrink: 0,
        }}>
          <IconBranch size={9}/>
          PR #{pr.number}
        </span>
        <span style={{
          fontSize: 10, color: stateColor, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 0.4,
          flexShrink: 0,
        }}>{stateLabel}</span>
        <span style={{ flex: 1 }}/>
        <a href={pr.url} target="_blank" rel="noopener noreferrer"
          title={tr('prs.banner.view_github_tooltip')}
          style={{
            width: 22, height: 22, borderRadius: 5,
            background: 'transparent', color: t.text3,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
          <IconExt size={11}/>
        </a>
      </div>

      {/* Título del PR */}
      <div style={{
        fontSize: 12, color: t.text0, fontWeight: 500,
        lineHeight: 1.4,
        marginBottom: 6,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden', textOverflow: 'ellipsis',
        wordBreak: 'break-word',
      }} title={pr.title}>
        {pr.title}
      </div>

      {/* Ramas y conflictos */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: t.fontMono, fontSize: 10, color: t.text3,
        marginBottom: 10,
        flexWrap: 'wrap', rowGap: 4,
      }}>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '100%',
        }} title={`${pr.headRefName} → ${pr.baseRefName}`}>
          {pr.headRefName} → {pr.baseRefName}
        </span>
        {conflicting && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 6px', borderRadius: 4,
            background: `color-mix(in oklch, ${t.err} 14%, transparent)`,
            color: t.err,
            fontSize: 9.5, fontWeight: 500,
            flexShrink: 0,
          }}>
            <IconAlert size={9}/> {tr('prs.banner.conflicts')}
          </span>
        )}
      </div>

      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.16 }}
            style={{ overflow: 'hidden' }}>
            <FeedbackInline msg={msg} onClose={() => setMsg(null)}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Acciones — sólo PR abierto */}
      {pr.state === 'OPEN' && (
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Merge split button */}
          <div ref={mergeBtnRef} style={{ position: 'relative', display: 'inline-flex', flex: 1, minWidth: 0 }}>
            <button type="button"
              onClick={() => setConfirming({ method: 'merge' })}
              disabled={!canMerge}
              title={conflicting ? tr('prs.banner.conflict_tooltip') : pr.isDraft ? tr('prs.banner.draft_tooltip') : tr('prs.banner.merge_tooltip')}
              style={{
                flex: 1, minWidth: 0,
                padding: '6px 8px',
                borderTopLeftRadius: 7, borderBottomLeftRadius: 7,
                borderTopRightRadius: 0, borderBottomRightRadius: 0,
                border: 0,
                background: canMerge ? t.ok : t.bg3,
                color: canMerge ? '#fff' : t.text3,
                fontSize: 11, fontWeight: 600, fontFamily: t.fontSans,
                cursor: canMerge ? 'pointer' : 'not-allowed',
                opacity: busy === 'merging' ? 0.7 : 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
              <IconCheck size={10}/>
              {busy === 'merging' ? tr('prs.banner.merging') : tr('prs.banner.merge_btn')}
            </button>
            <button type="button"
              onClick={() => setShowMergeMenu((v) => !v)}
              disabled={!canMerge}
              title={tr('prs.banner.merge_method_tooltip')}
              style={{
                padding: '6px 7px',
                borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
                borderTopRightRadius: 7, borderBottomRightRadius: 7,
                border: 0, borderLeft: `1px solid color-mix(in oklch, ${t.ok} 60%, black)`,
                background: canMerge ? t.ok : t.bg3,
                color: canMerge ? '#fff' : t.text3,
                cursor: canMerge ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center',
                flexShrink: 0,
              }}>
              <IconChevD size={9}/>
            </button>
            {/* Menú porteado a <body>. Sin AnimatePresence: un portal como
                hijo directo de AnimatePresence no se trackea bien y el menú
                no llegaba a montarse. La entrada igual se anima con
                initial→animate del motion.div. */}
            {showMergeMenu && (() => {
              const r = mergeBtnRef.current?.getBoundingClientRect();
              return createPortal(
                  <motion.div
                    ref={mergeMenuRef}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.12 }}
                    style={{
                      position: 'fixed', zIndex: 400,
                      top: r ? r.bottom + 4 : 0,
                      right: r ? Math.max(8, window.innerWidth - r.right) : 8,
                      background: t.bg1,
                      border: `1px solid ${t.glassBorder}`,
                      borderRadius: 8, padding: 4,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      minWidth: 200,
                    }}>
                    {(['merge', 'squash', 'rebase'] as const).map((m) => (
                      <button key={m} type="button"
                        onClick={() => { setShowMergeMenu(false); setConfirming({ method: m }); }}
                        style={{
                          width: '100%', padding: '7px 10px', borderRadius: 5,
                          border: 0, background: 'transparent', color: t.text1,
                          fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500,
                          textAlign: 'left', cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.bg3; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <div>{m === 'merge' ? tr('prs.banner.method.merge.label') : m === 'squash' ? tr('prs.banner.method.squash.label') : tr('prs.banner.method.rebase.label')}</div>
                        <div style={{ fontSize: 10, color: t.text3, marginTop: 1 }}>
                          {m === 'merge' ? tr('prs.banner.method.merge.desc') : m === 'squash' ? tr('prs.banner.method.squash.desc') : tr('prs.banner.method.rebase.desc')}
                        </div>
                      </button>
                    ))}
                  </motion.div>,
                  document.body,
                );
            })()}
          </div>

          <button type="button"
            onClick={() => setConfirming('close')}
            disabled={!canClose}
            title={tr('prs.banner.close_tooltip')}
            style={{
              padding: '6px 10px', borderRadius: 7,
              border: `1px solid ${t.glassBorder}`,
              background: 'transparent', color: t.text2,
              fontSize: 11, fontFamily: t.fontSans,
              cursor: canClose ? 'pointer' : 'not-allowed',
              opacity: busy === 'closing' ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              flexShrink: 0,
            }}>
            <IconX size={10}/>
            {busy === 'closing' ? tr('prs.banner.closing') : tr('prs.banner.close_btn')}
          </button>
        </div>
      )}

      <AnimatePresence>
        {confirming === 'close' && pr && (
          <ConfirmCloseDialog
            pr={pr}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void doClose()}/>
        )}
        {confirming && confirming !== 'close' && pr && (
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
    </Glass>
  );
}

function FeedbackInline({
  msg, onClose,
}: {
  msg: { kind: 'ok' | 'err'; text: string };
  onClose: () => void;
}) {
  const t = useTokens();
  return (
    <div style={{
      padding: '5px 7px',
      borderRadius: 6,
      background: msg.kind === 'ok'
        ? `color-mix(in oklch, ${t.ok} 14%, transparent)`
        : `color-mix(in oklch, ${t.err} 14%, transparent)`,
      color: msg.kind === 'ok' ? t.ok : t.err,
      fontFamily: t.fontMono, fontSize: 10.5,
      display: 'flex', alignItems: 'flex-start', gap: 5,
      maxHeight: 90, overflow: 'auto', wordBreak: 'break-word',
    }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>
        {msg.kind === 'ok' ? <IconCheck size={9}/> : '!'}
      </span>
      <span style={{ flex: 1, whiteSpace: 'pre-wrap', minWidth: 0 }}>{msg.text}</span>
      <button type="button" onClick={onClose}
        style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
        <IconX size={9}/>
      </button>
    </div>
  );
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
  return createPortal((
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onCancel}>
      <motion.div
        initial={{ scale: 0.96, y: 6 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 6 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          background: t.bg1,
          border: `1px solid ${t.glassBorder}`,
          borderRadius: 16,
          padding: 20,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: t.text0 }}>
          {tr('prs.banner.confirm_merge.title', { n: pr.number })}
        </h3>
        <div style={{
          fontSize: 12, color: t.text2, marginTop: 6, marginBottom: 14,
          lineHeight: 1.5,
        }}>
          <code style={{
            fontFamily: t.fontMono, fontSize: 11,
            padding: '1px 5px', borderRadius: 4,
            background: t.bg3, color: t.text1,
          }}>{pr.title}</code>
          <div style={{ marginTop: 6 }}>
            {tr('prs.banner.confirm_merge.method')}: <strong style={{ color: t.text1 }}>{methodLabel}</strong> — {methodDesc}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{
              padding: '9px 14px', borderRadius: 9,
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.glassBorder}`,
              fontSize: 12.5, cursor: 'pointer',
            }}>{tr('common.cancel')}</button>
          <button type="button" onClick={onConfirm}
            style={{
              padding: '9px 14px', borderRadius: 9,
              background: t.ok, color: '#fff', border: 0,
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}>{tr('prs.banner.merge_btn')}</button>
        </div>
      </motion.div>
    </motion.div>
  ), document.body);
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
  // Portal a <body> — el sidebar tiene ancestors con backdrop-filter del
  // Glass que pueden atrapar position:fixed.
  return createPortal((
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onCancel}>
      <motion.div
        initial={{ scale: 0.96, y: 6 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 6 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          background: t.bg1,
          border: `1px solid ${t.glassBorder}`,
          borderRadius: 16,
          padding: 20,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: t.text0 }}>
          {tr('prs.banner.confirm_close.title', { n: pr.number })}
        </h3>
        <div style={{
          fontSize: 12, color: t.text2, marginTop: 6, marginBottom: 14,
          lineHeight: 1.5,
        }}>
          <code style={{
            fontFamily: t.fontMono, fontSize: 11,
            padding: '1px 5px', borderRadius: 4,
            background: t.bg3, color: t.text1,
          }}>{pr.title}</code>
          <div style={{ marginTop: 6 }}>
            {tr('prs.banner.confirm_close.body_pre')}
            <code style={{
              fontFamily: t.fontMono, fontSize: 10.5,
              padding: '1px 4px', borderRadius: 3,
              background: t.bg3, color: t.text1,
              margin: '0 4px',
            }}>{pr.headRefName}</code>
            {tr('prs.banner.confirm_close.body_post')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{
              padding: '9px 14px', borderRadius: 9,
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.glassBorder}`,
              fontSize: 12.5, cursor: 'pointer',
            }}>{tr('common.cancel')}</button>
          <button type="button" onClick={onConfirm}
            style={{
              padding: '9px 14px', borderRadius: 9,
              background: t.err, color: '#fff', border: 0,
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}>{tr('prs.detail.close_btn')}</button>
        </div>
      </motion.div>
    </motion.div>
  ), document.body);
}
