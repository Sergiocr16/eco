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
import { Glass } from '@/design/primitives';
import {
  IconBranch, IconChevR, IconChevD, IconCheck, IconX,
  IconAlert, IconResume, IconExt, IconUser,
} from '@/design/icons';
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
    <Glass radius={10} style={{ padding: 8 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '2px 0', border: 0, background: 'transparent',
          cursor: 'pointer', color: t.text0, textAlign: 'left',
        }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: t.accentFaint, color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IconBranch size={11}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: t.fontMono, fontSize: 11.5, color: t.text0, fontWeight: 500,
            lineHeight: 1.3,
          }}>
            Pull Requests
          </div>
          <div style={{ fontSize: 10, color: t.text3, marginTop: 0 }}>
            {data?.ok === false
              ? 'no disponible'
              : loading && !data
              ? 'cargando…'
              : `${count} abierto${count === 1 ? '' : 's'}`}
          </div>
        </div>
        {expanded && data?.ok && (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); void refresh(); }}
            title="Refrescar"
            style={{
              width: 22, height: 22, border: 0, borderRadius: 5, padding: 0,
              background: 'transparent', color: t.text3, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
            <IconResume size={11}/>
          </button>
        )}
        <span style={{
          color: t.text1, fontSize: 16, fontFamily: t.fontMono,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22,
          transition: 'transform 180ms ease',
          flexShrink: 0,
        }}>
          {expanded ? <IconChevD size={16}/> : <IconChevR size={16}/>}
        </span>
      </button>

      <AnimatePresence>
        {actionMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.16 }}
            style={{ overflow: 'hidden' }}>
            <div style={{
              padding: '5px 7px',
              borderRadius: 6,
              background: actionMsg.kind === 'ok'
                ? `color-mix(in oklch, ${t.ok} 14%, transparent)`
                : `color-mix(in oklch, ${t.err} 14%, transparent)`,
              color: actionMsg.kind === 'ok' ? t.ok : t.err,
              fontFamily: t.fontMono, fontSize: 10.5,
              display: 'flex', alignItems: 'flex-start', gap: 5,
              maxHeight: 90, overflow: 'auto', wordBreak: 'break-word',
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                {actionMsg.kind === 'ok' ? <IconCheck size={9}/> : '!'}
              </span>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap', minWidth: 0 }}>{actionMsg.text}</span>
              <button type="button" onClick={() => setActionMsg(null)}
                style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                <IconX size={9}/>
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
              borderTop: `1px solid ${t.glassBorder}`,
              paddingTop: 8,
            }}>
              {loading && !data ? (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: t.text3 }}>Cargando…</div>
              ) : data?.ok === false ? (
                <ErrorBlock error={data.error} code={data.code}/>
              ) : prs.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: t.text3 }}>
                  Sin PRs abiertos
                </div>
              ) : (
                <div style={{
                  maxHeight: 360, overflow: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  paddingRight: 2,
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
    </Glass>
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
    <div style={{
      padding: '10px 10px', borderRadius: 8,
      background: `color-mix(in oklch, ${t.warn} 10%, transparent)`,
      color: t.text1,
      fontSize: 11, lineHeight: 1.5,
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <span style={{ color: t.warn, marginTop: 1 }}><IconAlert size={11}/></span>
      <div style={{ flex: 1, minWidth: 0 }}>
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
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 12px',
        // `bg1` es sólido — sin esto el fondo del card es translúcido igual
        // que el Glass envolvente y visualmente no hay límite.
        background: h ? t.bg3 : t.bg1,
        border: `1px solid ${h ? t.accent : t.glassBorderHi}`,
        borderRadius: 10,
        boxShadow: h ? '0 4px 12px rgba(0,0,0,0.25)' : '0 1px 2px rgba(0,0,0,0.15)',
        color: t.text1, cursor: 'pointer', textAlign: 'left',
        minHeight: 72,
        // Clip cualquier hijo que se intente desbordar — defensa de profundidad.
        overflow: 'hidden',
        boxSizing: 'border-box',
        transition: 'background 120ms, border-color 120ms, box-shadow 120ms',
      }}>
      <span style={{
        flexShrink: 0, marginTop: 2,
        fontFamily: t.fontMono, fontSize: 10.5,
        color: pr.isDraft ? t.text3 : t.accent,
        fontWeight: 600,
      }}>
        #{pr.number}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11.5, color: t.text0, fontWeight: 500,
          lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          wordBreak: 'break-word',
        }}>
          {pr.title}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
          fontSize: 9.5, color: t.text3, fontFamily: t.fontMono,
          flexWrap: 'wrap', rowGap: 4,
          minWidth: 0,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            minWidth: 0, maxWidth: '100%',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flexShrink: 1,
          }}>
            <IconUser size={8}/>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pr.author || '—'}</span>
          </span>
          {pr.isDraft && (
            <span style={{
              padding: '0 4px', borderRadius: 3,
              background: t.bg3, color: t.text2,
              fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.4,
              flexShrink: 0,
            }}>draft</span>
          )}
          {pr.isFork && (
            <span style={{
              padding: '0 4px', borderRadius: 3,
              background: `color-mix(in oklch, ${t.warn} 18%, transparent)`,
              color: t.warn,
              fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.4,
              flexShrink: 0,
            }}>fork</span>
          )}
          {(pr.additions != null || pr.deletions != null) && (
            <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
              {pr.additions != null && <span style={{ color: t.ok }}>+{compactNum(pr.additions)}</span>}
              {pr.deletions != null && <span style={{ color: t.err }}>−{compactNum(pr.deletions)}</span>}
            </span>
          )}
        </div>
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
          width: 'min(520px, 100%)',
          background: t.bg1,
          border: `1px solid ${t.glassBorder}`,
          borderRadius: 16,
          padding: 20,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: t.accentFaint, color: t.accent,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconBranch size={14}/>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              margin: 0, fontSize: 15, fontWeight: 600, color: t.text0, letterSpacing: -0.2,
            }}>
              Ir a la rama del PR #{pr.number} para revisar
            </h3>
            <div style={{ fontSize: 12, color: t.text2, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {pr.title}
            </div>
          </div>
        </div>

        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55 }}>
            Eco va a hacer <code style={mono(t)}>gh pr checkout {pr.number}</code> en el worktree de este agente.
            La rama actual (<code style={mono(t)}>{'eco/<id>'}</code>) queda al margen — podés volver desde el BranchPicker después.
            {pr.isFork && (
              <div style={{
                marginTop: 6, padding: '4px 8px', borderRadius: 6,
                background: `color-mix(in oklch, ${t.warn} 14%, transparent)`,
                color: t.warn, fontSize: 10.5, fontFamily: t.fontMono,
              }}>
                Este PR viene de un fork. <code style={mono(t)}>gh</code> creará un remote temporal y una rama local prefijada con el fork.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <a href={pr.url} target="_blank" rel="noopener noreferrer"
            style={{
              padding: '9px 14px', borderRadius: 9,
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.glassBorder}`,
              fontSize: 12.5, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
            <IconExt size={10}/> Ver en GitHub
          </a>
          <button type="button" onClick={onCancel}
            style={{
              padding: '9px 14px', borderRadius: 9,
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.glassBorder}`,
              fontSize: 12.5, cursor: 'pointer',
            }}>Cancelar</button>
          <button type="button" onClick={onConfirm}
            style={{
              padding: '9px 14px', borderRadius: 9,
              background: t.accent, color: t.accentOn, border: 0,
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}>Ir a la rama</button>
        </div>
      </motion.div>
    </motion.div>
  ), document.body);
}

function mono(t: ReturnType<typeof useTokens>) {
  return {
    fontFamily: t.fontMono, fontSize: 10.5,
    padding: '1px 5px', borderRadius: 4,
    background: t.bg3, color: t.text1,
  };
}
