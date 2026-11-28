// Lista de Pull Requests abiertos del repo del workspace del agente.
// Vive en el sidebar Git, debajo del BranchPicker. Usa `gh pr list` en el
// backend — requiere `gh auth login` previo del user (no almacenamos token).
//
// Click en un PR → modal de confirmación → `gh pr checkout <num>` en el
// worktree del agente. Al éxito, emite `eco:git_refresh` para que el
// BranchPicker recargue su lista de branches.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import { IconBtn, IconTile } from '@/design/primitives';
import { IconBranch, IconChevR, IconChevD, IconCheck, IconX, IconAlert, IconResume, IconExt } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';

type PullRequest = {
  number: number;
  title: string;
  author: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  url: string;
  isFork: boolean;
  additions?: number;
  deletions?: number;
};

type ListResult =
  | { ok: true; prs: PullRequest[] }
  | { ok: false; error: string; code?: string };

type Props = {
  workspace: string;
  bubbleId: string;
};

export function PullRequestsList({ workspace, bubbleId }: Props) {
  const t = useTokens();
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<PullRequest | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refresh = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      const r = await apiFetch(`/git/prs?${params}`);
      const d = (await r.json()) as ListResult;
      setData(d);
    } catch (e) {
      setData({ ok: false, error: e instanceof Error ? e.message : 'Error' });
    } finally {
      setLoading(false);
    }
  };

  // Cargamos sólo cuando se expande la sección — sin esto, todos los
  // sidebars de todos los agentes harían `gh pr list` (red + spawn) al boot.
  useEffect(() => {
    if (!expanded || data) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Reload manual desde el botón refresh + cuando cambia la burbuja activa.
  useEffect(() => {
    if (!expanded) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, bubbleId]);

  async function doCheckout(pr: PullRequest) {
    setConfirming(null);
    setActionMsg(null);
    try {
      const r = await apiFetch('/git/pr/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: pr.number }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setActionMsg({ kind: 'ok', text: d.message || `En la rama del PR #${pr.number}` });
        ecoEmit('eco:git_refresh', { bubbleId });
      } else {
        setActionMsg({ kind: 'err', text: d.error || 'Checkout falló' });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  }

  const prs = data?.ok ? data.prs : [];
  const count = prs.length;

  return (
    <div style={{ padding: 12, borderRadius: 16, background: t.card }}>
      <div className="eco-hstack" style={{ gap: 8 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="eco-hstack eco-grow"
          style={{
            gap: 10, padding: 0, border: 0, background: 'transparent', font: 'inherit',
            cursor: 'pointer', color: t.text0, textAlign: 'left',
          }}>
          <IconTile icon={IconBranch} size="sm"/>
          <span className="eco-grow">
            <span className="eco-label" style={{ display: 'block' }}>Pull Requests</span>
            <span className="eco-sub" style={{ display: 'block' }}>
              {data?.ok === false
                ? 'no disponible'
                : loading && !data
                ? 'cargando…'
                : `${count} abierto${count === 1 ? '' : 's'}`}
            </span>
          </span>
          <span style={{ display: 'inline-flex', color: t.text1, flexShrink: 0 }}>
            {expanded ? <IconChevD size={16}/> : <IconChevR size={16}/>}
          </span>
        </button>
        {expanded && data?.ok && (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); void refresh(); }}
            title="Refrescar"
            className="eco-iconbtn eco-iconbtn--xs">
            <IconResume size={14}/>
          </button>
        )}
      </div>

      <AnimatePresence>
        {actionMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.16 }}
            style={{ overflow: 'hidden' }}>
            <div className={`eco-banner eco-banner--${actionMsg.kind} eco-mono`} style={{
              flexWrap: 'nowrap', alignItems: 'flex-start', gap: 8, padding: '8px 12px',
              fontSize: 11.5, maxHeight: 90, overflow: 'auto', wordBreak: 'break-word',
            }}>
              <span style={{ flexShrink: 0, marginTop: 2 }}>
                {actionMsg.kind === 'ok' ? <IconCheck size={12}/> : <IconAlert size={12}/>}
              </span>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap', minWidth: 0 }}>{actionMsg.text}</span>
              <button type="button" onClick={() => setActionMsg(null)}
                style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'inline-flex' }}>
                <IconX size={12}/>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}>
            <div style={{
              marginTop: 8,
              borderTop: `1px solid ${t.line}`,
              paddingTop: 8,
            }}>
              {loading && !data ? (
                <div className="eco-empty" style={{ padding: 12 }}>Cargando…</div>
              ) : data?.ok === false ? (
                <ErrorBlock error={data.error} code={data.code}/>
              ) : prs.length === 0 ? (
                <div className="eco-empty" style={{ padding: 12 }}>
                  Sin PRs abiertos
                </div>
              ) : (
                <div style={{
                  maxHeight: 360, overflow: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {prs.map((p) => (
                    <PrRow key={p.number} pr={p}
                      onClick={() => setConfirming(p)}/>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirming && (
          <CheckoutConfirmDialog
            pr={confirming}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void doCheckout(confirming)}/>
        )}
      </AnimatePresence>
    </div>
  );
}

function ErrorBlock({ error, code }: { error: string; code?: string }) {
  const t = useTokens();
  // Mensajes amigables para los códigos conocidos del backend.
  const friendly =
    code === 'pr.gh_missing' ? (
      <>
        Necesitás <code style={mono(t)}>gh</code> (GitHub CLI) instalado.<br/>
        En la terminal: <code style={mono(t)}>brew install gh</code>
      </>
    ) : code === 'pr.gh_unauthenticated' ? (
      <>
        <code style={mono(t)}>gh</code> no está autenticado.<br/>
        En la terminal: <code style={mono(t)}>gh auth login</code>
      </>
    ) : code === 'pr.no_github_remote' ? (
      <>Este repo no tiene un remote de GitHub. Agregá uno con <code style={mono(t)}>git remote add origin …</code></>
    ) : null;
  return (
    <div className="eco-banner eco-banner--warn" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', lineHeight: 1.5 }}>
      <span style={{ marginTop: 2, flexShrink: 0 }}><IconAlert size={13}/></span>
      <div style={{ flex: 1, minWidth: 0, color: t.text1 }}>
        {friendly ?? error}
      </div>
    </div>
  );
}

// Formatea números grandes (1234 → "1.2k", 12345 → "12k") para que las
// metricas de +adds/-dels no desborden el row en PRs grandes.
function compactNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}

function PrRow({ pr, onClick }: { pr: PullRequest; onClick: () => void }) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      className="eco-nav-item"
      style={{
        height: 'auto', flex: 'none', padding: '11px 12px', borderRadius: 14,
        flexDirection: 'column', alignItems: 'stretch', gap: 4, color: t.text0,
      }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span className="eco-mono" style={{ flex: 'none', fontSize: 12, color: t.text3 }}>#{pr.number}</span>
        <span style={{
          flex: 1, minWidth: 0, fontWeight: 500, lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          wordBreak: 'break-word',
        }}>
          {pr.title}
        </span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12.5, color: t.text3,
        flexWrap: 'wrap', rowGap: 4, minWidth: 0,
      }}>
        <span className="eco-truncate" style={{ maxWidth: '100%' }}>{pr.author || '—'}</span>
        {pr.isDraft && (
          <span className="eco-mono" style={{
            fontSize: 11.5, padding: '0 7px', borderRadius: 7,
            background: t.sheet, color: t.text1, flexShrink: 0,
          }}>draft</span>
        )}
        {pr.isFork && (
          <span className="eco-mono" style={{
            fontSize: 11.5, padding: '0 7px', borderRadius: 7,
            background: t.warnSoft, color: t.warn, flexShrink: 0,
          }}>fork</span>
        )}
        {pr.additions != null && <span className="eco-mono" style={{ color: t.ok }}>+{compactNum(pr.additions)}</span>}
        {pr.deletions != null && <span className="eco-mono" style={{ color: t.err }}>−{compactNum(pr.deletions)}</span>}
      </div>
    </button>
  );
}

function CheckoutConfirmDialog({
  pr, onCancel, onConfirm,
}: {
  pr: PullRequest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  // Portal a <body> para esquivar contenedores con transform/filter que
  // capturarían el position:fixed.
  return createPortal((
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="eco-scrim"
      style={{ zIndex: 9999 }}
      onClick={onCancel}>
      <div className="eco-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconBranch size={20}/></span>
          <h2 className="eco-dialog__title">
            Ir a la rama del PR #{pr.number} para revisar
          </h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title="Cerrar"/>
        </div>
        <div className="eco-dialog__body" style={{
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
        }}>
          {pr.title}
        </div>

        <div style={{
          padding: '12px 16px', borderRadius: 14,
          background: t.card, color: t.text2, lineHeight: 1.7,
        }}>
          Eco va a hacer <code style={mono(t)}>gh pr checkout {pr.number}</code> en el worktree de este agente.
          La rama actual (<code style={mono(t)}>{'eco/<id>'}</code>) queda al margen — podés volver desde el BranchPicker después.
          {pr.isFork && (
            <div className="eco-banner eco-banner--warn" style={{ marginTop: 8 }}>
              <span>Este PR viene de un fork. <code style={mono(t)}>gh</code> creará un remote temporal y una rama local prefijada con el fork.</span>
            </div>
          )}
        </div>

        <div className="eco-dialog__foot">
          <a href={pr.url} target="_blank" rel="noopener noreferrer"
            className="eco-btn eco-btn--lg eco-btn--ghost"
            style={{ textDecoration: 'none' }}>
            <IconExt size={15}/> Ver en GitHub
          </a>
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>Cancelar</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={onConfirm}>Ir a la rama</button>
          </div>
        </div>
      </div>
    </motion.div>
  ), document.body);
}

function mono(t: ReturnType<typeof useTokens>) {
  return {
    fontFamily: t.fontMono, fontSize: 12,
    padding: '1px 7px', borderRadius: 7,
    background: t.raised, color: t.text0,
  };
}
