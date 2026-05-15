import { useCallback, useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { IconBranch, IconExt, IconUser, IconCheck, IconX, IconResume } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit, on as ecoOn } from '@/lib/eco-bus';
import { ResizableSplit } from './ResizableSplit';
import { EmptyState, SubpanelLoading, formatRelTime } from './shared';
import { Markdown } from './Markdown';
import { usePullRequests, type PullRequest } from '@/hooks/usePullRequests';

type PrComment = {
  author: string;
  body: string;
  createdAt: string;
  kind: 'issue' | 'review' | 'inline';
  state?: string;
  path?: string;
};

type PrDetails = {
  number: number;
  title: string;
  body: string;
  author: string;
  headRefName: string;
  baseRefName: string;
  state: string;
  isDraft: boolean;
  url: string;
  commitsCount: number;
  comments: PrComment[];
  additions?: number;
  deletions?: number;
};

type DetailsResult =
  | { ok: true; pr: PrDetails }
  | { ok: false; error: string; code?: string };

// Cache global de detalles de PR — keyed por (workspace, bubbleId, prNumber).
// Permite volver al mismo PR sin ver spinner; el viejo se muestra al instante
// y se revalida en background.
const prDetailsCache = new Map<string, DetailsResult>();

type Props = { workspace: string; bubbleId: string };

export function PRsView({ workspace, bubbleId }: Props) {
  const t = useTokens();
  const { data: list, loading: listLoading, refresh } = usePullRequests(workspace, bubbleId);
  // Lee selección al montar. Dos fuentes:
  //  1) pending_pr (one-shot): viene del GitMiniDock cuando el user clickea
  //     el chip del PR de la rama actual — intent explícito, prioridad alta.
  //     Se consume y borra en el primer mount.
  //  2) selected_pr (sticky): último PR que el user estaba viendo en este
  //     bubble. Se persiste cada vez que cambia para que volver al tab Git
  //     recuerde dónde estabas (incluso si salís a otro tab y volvés).
  const [selected, setSelected] = useState<number | null>(() => {
    try {
      const pending = localStorage.getItem(`eco.git.pending_pr.${bubbleId}`);
      if (pending) {
        localStorage.removeItem(`eco.git.pending_pr.${bubbleId}`);
        const n = Number(pending);
        if (Number.isFinite(n) && n > 0) return n;
      }
      const sticky = localStorage.getItem(`eco.git.selected_pr.${bubbleId}`);
      if (sticky) {
        const n = Number(sticky);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch { /* noop */ }
    return null;
  });
  // Persistir cuando cambia el seleccionado.
  useEffect(() => {
    try {
      if (selected != null) localStorage.setItem(`eco.git.selected_pr.${bubbleId}`, String(selected));
      else localStorage.removeItem(`eco.git.selected_pr.${bubbleId}`);
    } catch { /* noop */ }
  }, [selected, bubbleId]);

  // Escucha eco:open_pr (emitido por GitMiniDock cuando el user clickea el
  // chip del PR de la rama actual) para preseleccionar ese PR en el detalle.
  useEffect(() => {
    return ecoOn('eco:open_pr', (e) => {
      if (e.bubbleId !== bubbleId) return;
      setSelected(e.prNumber);
    });
  }, [bubbleId]);

  const prs = list?.ok ? list.prs : [];

  if (listLoading && !list) return <SubpanelLoading label="Cargando pull requests…"/>;
  if (list && !list.ok) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorBlock error={list.error} code={list.code}/>
      </div>
    );
  }
  if (prs.length === 0) {
    return <EmptyState message="Sin PRs abiertos" hint="Cuando haya pull requests abiertos en este repo de GitHub vas a verlos acá."/>;
  }

  return (
    <ResizableSplit
      storageKey={`eco.git.splitter.prs.${bubbleId}`}
      defaultLeft={360}
      minLeft={260}
      left={
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: t.bg0 }}>
          <div style={{
            padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: `1px solid ${t.glassBorder}`,
            flexShrink: 0,
          }}>
            <div style={{ flex: 1, fontSize: 11.5, color: t.text2 }}>
              <strong style={{ color: t.text0 }}>{prs.length}</strong> abierto{prs.length === 1 ? '' : 's'}
            </div>
            <button type="button"
              onClick={() => void refresh()}
              title="Refrescar"
              style={{
                width: 24, height: 24, padding: 0, borderRadius: 6,
                background: 'transparent', border: `1px solid ${t.glassBorder}`,
                color: t.text2, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <IconResume size={11}/>
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {prs.map((pr) => (
              <PrRow key={pr.number} pr={pr}
                active={selected === pr.number}
                onClick={() => setSelected(pr.number)}/>
            ))}
          </div>
        </div>
      }
      right={
        selected !== null
          ? <PrDetailPane
              workspace={workspace}
              bubbleId={bubbleId}
              prNumber={selected}
              listSummary={prs.find((p) => p.number === selected) ?? null}
              onAfterCheckout={() => { ecoEmit('eco:git_refresh', { bubbleId }); }}
            />
          : <EmptyState message="Seleccioná un PR" hint="Click sobre un pull request de la lista para ver descripción, comentarios y acciones."/>
      }
    />
  );
}

function compactNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}

function PrRow({ pr, active, onClick }: { pr: PullRequest; active: boolean; onClick: () => void }) {
  const t = useTokens();
  return (
    <button type="button"
      onClick={onClick}
      style={{
        width: '100%', padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 4,
        border: 0, background: active ? t.accentFaint : 'transparent',
        borderLeft: active ? `3px solid ${t.accent}` : '3px solid transparent',
        borderBottom: `1px solid ${t.glassBorder}`,
        textAlign: 'left', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = t.bg1; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontFamily: t.fontMono, fontSize: 11,
          color: pr.isDraft ? t.text3 : t.accent, fontWeight: 700,
          flexShrink: 0,
        }}>#{pr.number}</span>
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: 12.5, fontWeight: 500, color: t.text0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{pr.title}</div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
        fontSize: 10.5, color: t.text3, flexWrap: 'wrap',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <IconUser size={9}/>
          <span>{pr.author || '—'}</span>
        </span>
        <span>·</span>
        <span>{formatRelTime(pr.updatedAt || pr.createdAt)}</span>
        {pr.isDraft && (
          <span style={{
            padding: '0 5px', borderRadius: 3,
            background: t.bg3, color: t.text2,
            fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
          }}>draft</span>
        )}
        {pr.isFork && (
          <span style={{
            padding: '0 5px', borderRadius: 3,
            background: `color-mix(in oklch, ${t.warn} 18%, transparent)`,
            color: t.warn,
            fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
          }}>fork</span>
        )}
        {(pr.additions != null || pr.deletions != null) && (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {pr.additions != null && <span style={{ color: t.ok }}>+{compactNum(pr.additions)}</span>}
            {pr.deletions != null && <span style={{ color: t.err }}>−{compactNum(pr.deletions)}</span>}
          </span>
        )}
      </div>
    </button>
  );
}

function PrDetailPane({
  workspace, bubbleId, prNumber, listSummary, onAfterCheckout,
}: {
  workspace: string;
  bubbleId: string;
  prNumber: number;
  listSummary: PullRequest | null;
  onAfterCheckout: () => void;
}) {
  const t = useTokens();
  // Cache global del detalle del PR — al volver al MISMO PR no se ve spinner,
  // se muestra el detalle viejo y se revalida en background.
  const cacheKey = `${workspace}|${bubbleId}|${prNumber}`;
  const cached = prDetailsCache.get(cacheKey);
  const [details, setDetails] = useState<DetailsResult | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<{ method: 'merge' | 'squash' | 'rebase' } | null>(null);
  const [closeConfirm, setCloseConfirm] = useState<{ comment: string } | null>(null);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(id);
  }, [msg]);

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ workspace, bubbleId, number: String(prNumber) });
      const r = await apiFetch(`/git/pr/details?${params}`);
      const fresh = await r.json() as DetailsResult;
      setDetails(fresh);
      prDetailsCache.set(cacheKey, fresh);
    } catch (e) {
      setDetails({ ok: false, error: e instanceof Error ? e.message : 'Error' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, bubbleId, prNumber, cacheKey]);

  useEffect(() => {
    // Si tenemos cache, mostramos sin spinner y revalidamos en background.
    if (cached) void load(true); else void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function checkout() {
    setBusyAction('checkout'); setMsg(null);
    try {
      const r = await apiFetch('/git/pr/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: prNumber }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ kind: 'ok', text: d.message || `Checkout del PR #${prNumber} OK` });
        onAfterCheckout();
      } else {
        setMsg({ kind: 'err', text: d.error || 'Checkout falló' });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusyAction(null);
    }
  }

  async function doMerge(method: 'merge' | 'squash' | 'rebase') {
    setMergeConfirm(null);
    setBusyAction('merge'); setMsg(null);
    try {
      const r = await apiFetch('/git/pr/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: prNumber, method }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ kind: 'ok', text: d.message || `PR #${prNumber} mergeado` });
        ecoEmit('eco:git_refresh', { bubbleId });
        // Recargamos detalles para reflejar el nuevo state (MERGED).
        void load(true);
      } else {
        setMsg({ kind: 'err', text: d.error || 'Merge falló' });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusyAction(null);
    }
  }

  async function doClose(comment: string) {
    setCloseConfirm(null);
    setBusyAction('close'); setMsg(null);
    try {
      const r = await apiFetch('/git/pr/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace, bubbleId, number: prNumber,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ kind: 'ok', text: d.message || `PR #${prNumber} cerrado` });
        ecoEmit('eco:git_refresh', { bubbleId });
        void load(true);
      } else {
        setMsg({ kind: 'err', text: d.error || 'Cerrar falló' });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) return <SubpanelLoading label="Cargando detalles del PR…"/>;

  if (details && !details.ok) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorBlock error={details.error} code={details.code}/>
      </div>
    );
  }
  const pr = details?.ok ? details.pr : null;
  // Fallback al summary de la lista mientras carga la primera vez (no debería
  // pasar porque `loading` se hace true, pero defensivo).
  const number = pr?.number ?? listSummary?.number ?? prNumber;
  const title = pr?.title ?? listSummary?.title ?? '';
  const author = pr?.author ?? listSummary?.author ?? '';
  const headRef = pr?.headRefName ?? listSummary?.headRefName ?? '';
  const baseRef = pr?.baseRefName ?? listSummary?.baseRefName ?? '';
  const url = pr?.url ?? listSummary?.url ?? '';
  const isDraft = pr?.isDraft ?? listSummary?.isDraft ?? false;
  const state = pr?.state ?? 'OPEN';
  const body = pr?.body ?? '';
  const comments = pr?.comments ?? [];
  const commitsCount = pr?.commitsCount ?? 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg0 }}>
      {/* Header con título + meta */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg1,
        display: 'flex', flexDirection: 'column', gap: 8,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: t.fontMono, fontSize: 12,
            color: isDraft ? t.text3 : t.accent, fontWeight: 700,
          }}>#{number}</span>
          <div style={{
            flex: 1, minWidth: 0,
            fontSize: 14, fontWeight: 600, color: t.text0,
          }}>{title}</div>
          <StateBadge state={state} isDraft={isDraft}/>
        </div>

        {/* "wants to merge N commits into BASE from HEAD" estilo GitHub */}
        <div style={{
          fontSize: 12, color: t.text2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
        }}>
          <strong style={{ color: t.text1 }}>{author || '—'}</strong>
          <span>quiere mergear</span>
          <strong style={{ color: t.text0 }}>{commitsCount}</strong>
          <span>commit{commitsCount === 1 ? '' : 's'} en</span>
          <BranchPill name={baseRef}/>
          <span>desde</span>
          <BranchPill name={headRef}/>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn kind="primary" size="sm" icon={IconBranch} onClick={() => void checkout()} disabled={!!busyAction}>
            {busyAction === 'checkout' ? '…' : 'Ir a la rama del PR'}
          </Btn>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 7,
                background: 'transparent', border: `1px solid ${t.glassBorder}`,
                color: t.text2, fontSize: 11.5, textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.glassBorder; e.currentTarget.style.color = t.text2; }}>
              <IconExt size={11}/> Ver en GitHub
            </a>
          )}
          <button type="button"
            onClick={() => void load(false)}
            disabled={!!busyAction}
            title="Refrescar comentarios"
            style={{
              width: 28, height: 28, padding: 0, borderRadius: 7,
              background: 'transparent', border: `1px solid ${t.glassBorder}`,
              color: t.text2, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconResume size={12}/>
          </button>
        </div>

        {msg && (
          <div style={{
            padding: '6px 10px', borderRadius: 6,
            background: `color-mix(in oklch, ${msg.kind === 'ok' ? t.ok : t.err} 14%, transparent)`,
            color: msg.kind === 'ok' ? t.ok : t.err,
            fontFamily: t.fontMono, fontSize: 11,
          }}>{msg.text}</div>
        )}
      </div>

      {/* Body + comentarios */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {body && (
          <CommentBlock
            author={author}
            kind="body"
            body={body}
            createdAt={''}
          />
        )}
        {comments.length === 0 && !body ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.text3, fontSize: 12 }}>
            Sin descripción ni comentarios.
          </div>
        ) : (
          comments.map((c, i) => (
            <CommentBlock
              key={i}
              author={c.author}
              kind={c.kind}
              state={c.state}
              path={c.path}
              body={c.body}
              createdAt={c.createdAt}
            />
          ))
        )}
      </div>

      {/* Footer — acciones que afectan el remote: merge / close. Sticky abajo,
          solo visible si el PR está OPEN (no merged, no closed). */}
      {state === 'OPEN' && (
        <div style={{
          flexShrink: 0,
          padding: '10px 20px',
          borderTop: `1px solid ${t.glassBorder}`,
          background: t.bg1,
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: t.text3 }}>
            {isDraft
              ? 'Este PR es draft — convertilo a "Ready for review" en GitHub antes de mergear.'
              : `Acciones sobre el PR #${number} en GitHub`}
          </div>
          <button type="button"
            onClick={() => setCloseConfirm({ comment: '' })}
            disabled={!!busyAction}
            style={{
              height: 32, padding: '0 14px', borderRadius: 8,
              background: 'transparent', border: `1px solid ${t.err}`,
              color: t.err,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 600,
              cursor: busyAction ? 'wait' : 'pointer',
            }}>
            {busyAction === 'close' ? '…' : 'Cerrar PR'}
          </button>
          <button type="button"
            onClick={() => setMergeConfirm({ method: 'merge' })}
            disabled={!!busyAction || isDraft}
            title={isDraft ? 'No se puede mergear un PR en draft' : 'Mergear este PR'}
            style={{
              height: 32, padding: '0 14px', borderRadius: 8, border: 0,
              background: isDraft ? t.bg3 : t.accent,
              color: isDraft ? t.text3 : t.accentOn,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 700,
              cursor: busyAction || isDraft ? 'not-allowed' : 'pointer',
            }}>
            {busyAction === 'merge' ? '…' : 'Hacer merge'}
          </button>
        </div>
      )}

      {/* Modales de confirmación */}
      {mergeConfirm && (
        <MergeConfirm
          prNumber={number}
          headRef={headRef}
          baseRef={baseRef}
          commitsCount={commitsCount}
          initialMethod={mergeConfirm.method}
          onCancel={() => setMergeConfirm(null)}
          onConfirm={(method) => void doMerge(method)}
        />
      )}
      {closeConfirm && (
        <CloseConfirm
          prNumber={number}
          title={title}
          initialComment={closeConfirm.comment}
          onCancel={() => setCloseConfirm(null)}
          onConfirm={(comment) => void doClose(comment)}
        />
      )}
    </div>
  );
}

function MergeConfirm({
  prNumber, headRef, baseRef, commitsCount, initialMethod, onCancel, onConfirm,
}: {
  prNumber: number;
  headRef: string;
  baseRef: string;
  commitsCount: number;
  initialMethod: 'merge' | 'squash' | 'rebase';
  onCancel: () => void;
  onConfirm: (method: 'merge' | 'squash' | 'rebase') => void;
}) {
  const t = useTokens();
  const [method, setMethod] = useState<'merge' | 'squash' | 'rebase'>(initialMethod);
  const methods: { id: 'merge' | 'squash' | 'rebase'; label: string; desc: string }[] = [
    { id: 'merge', label: 'Create merge commit', desc: 'Mantiene todos los commits + agrega un commit de merge.' },
    { id: 'squash', label: 'Squash and merge', desc: 'Combina todos los commits en uno solo.' },
    { id: 'rebase', label: 'Rebase and merge', desc: 'Reaplica los commits encima de la base sin merge commit.' },
  ];
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 520, maxWidth: '92vw', padding: 20, borderRadius: 12,
        background: t.bg1, border: `1px solid ${t.accent}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text0 }}>
          Mergear PR #{prNumber}
        </div>
        <div style={{ fontSize: 12.5, color: t.text1, lineHeight: 1.55 }}>
          Vas a mergear <strong>{commitsCount}</strong> commit{commitsCount === 1 ? '' : 's'} de{' '}
          <code style={{ fontFamily: t.fontMono, padding: '1px 5px', borderRadius: 4, background: t.bg3, color: t.text0 }}>{headRef}</code>{' '}
          en{' '}
          <code style={{ fontFamily: t.fontMono, padding: '1px 5px', borderRadius: 4, background: t.bg3, color: t.text0 }}>{baseRef}</code>{' '}
          en el remote.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {methods.map((m) => (
            <label key={m.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 10px', borderRadius: 8,
              background: method === m.id ? t.accentFaint : t.bg2,
              border: `1px solid ${method === m.id ? t.accent : t.glassBorder}`,
              cursor: 'pointer',
            }}>
              <input type="radio" name="merge-method" value={m.id}
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
                style={{ margin: '4px 0 0' }}/>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: method === m.id ? t.accent : t.text0 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 11, color: t.text2, marginTop: 2 }}>{m.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11, color: t.text3 }}>
          Esto se hace en el remote vía <code style={{ fontFamily: t.fontMono }}>gh pr merge</code>. No se puede deshacer fácilmente.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{
              height: 28, padding: '0 14px', borderRadius: 7,
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.glassBorder}`,
              fontFamily: t.fontSans, fontSize: 12, cursor: 'pointer',
            }}>Cancelar</button>
          <button type="button" onClick={() => onConfirm(method)}
            style={{
              height: 28, padding: '0 14px', borderRadius: 7, border: 0,
              background: t.accent, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
            }}>Sí, hacer merge</button>
        </div>
      </div>
    </div>
  );
}

function CloseConfirm({
  prNumber, title, initialComment, onCancel, onConfirm,
}: {
  prNumber: number;
  title: string;
  initialComment: string;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const t = useTokens();
  const [comment, setComment] = useState(initialComment);
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: '92vw', padding: 20, borderRadius: 12,
        background: t.bg1, border: `1px solid ${t.err}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.err }}>
          Cerrar PR #{prNumber} sin mergear
        </div>
        <div style={{ fontSize: 12.5, color: t.text1, lineHeight: 1.55 }}>
          <em>{title}</em>
        </div>
        <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5 }}>
          El PR queda en estado CLOSED en GitHub. Los commits no se mergean. Podés reabrirlo después.
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comentario opcional al cerrar (visible en GitHub)…"
          rows={3}
          style={{
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 6, padding: '8px 10px',
            fontFamily: t.fontSans, fontSize: 12, color: t.text0,
            outline: 'none', resize: 'vertical', minHeight: 60,
          }}/>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{
              height: 28, padding: '0 14px', borderRadius: 7,
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.glassBorder}`,
              fontFamily: t.fontSans, fontSize: 12, cursor: 'pointer',
            }}>Cancelar</button>
          <button type="button" onClick={() => onConfirm(comment)}
            style={{
              height: 28, padding: '0 14px', borderRadius: 7, border: 0,
              background: t.err, color: '#fff',
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
            }}>Cerrar PR</button>
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state, isDraft }: { state: string; isDraft: boolean }) {
  const t = useTokens();
  const color = isDraft ? t.text3
    : state === 'MERGED' ? t.accent
    : state === 'CLOSED' ? t.err
    : t.ok;
  const label = isDraft ? 'DRAFT' : state;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 5,
      background: `color-mix(in oklch, ${color} 16%, transparent)`,
      color, fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
      flexShrink: 0,
    }}>{label}</span>
  );
}

function BranchPill({ name }: { name: string }) {
  const t = useTokens();
  return (
    <code style={{
      fontFamily: t.fontMono, fontSize: 11,
      padding: '1px 6px', borderRadius: 5,
      background: t.bg3, color: t.text0,
    }}>{name || '—'}</code>
  );
}

function CommentBlock({ author, kind, state, path, body, createdAt }: {
  author: string;
  kind: 'issue' | 'review' | 'inline' | 'body';
  state?: string;
  path?: string;
  body: string;
  createdAt: string;
}) {
  const t = useTokens();
  const stateIcon =
    state === 'APPROVED' ? <IconCheck size={11}/>
    : state === 'CHANGES_REQUESTED' ? <IconX size={11}/>
    : null;
  const stateColor =
    state === 'APPROVED' ? t.ok
    : state === 'CHANGES_REQUESTED' ? t.err
    : t.text2;
  const kindLabel =
    kind === 'body' ? 'Descripción'
    : kind === 'review' ? (state ? state.replace('_', ' ').toLowerCase() : 'review')
    : kind === 'inline' ? `comentó sobre ${path || 'un archivo'}`
    : 'comentó';

  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: `1px solid ${t.glassBorder}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11.5, color: t.text2, marginBottom: 8,
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: t.bg3, color: t.text1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
          flexShrink: 0,
        }}>{(author || '?').slice(0, 1).toUpperCase()}</span>
        <strong style={{ color: t.text0 }}>{author || 'anónimo'}</strong>
        <span style={{ color: kind === 'body' ? t.accent : stateColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {stateIcon}
          {kindLabel}
        </span>
        {createdAt && (
          <span style={{ marginLeft: 'auto', color: t.text3, fontSize: 10.5 }}>
            {formatRelTime(createdAt)}
          </span>
        )}
      </div>
      {body ? (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: kind === 'body' ? t.bg2 : t.bg1,
          border: `1px solid ${t.glassBorder}`,
        }}>
          <Markdown source={body}/>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: t.text3, fontStyle: 'italic' }}>
          (sin texto)
        </div>
      )}
    </div>
  );
}

function ErrorBlock({ error, code }: { error: string; code?: string }) {
  const t = useTokens();
  const friendly =
    code === 'pr.gh_missing' ? 'GitHub CLI (gh) no está instalado. Instalalo con `brew install gh`.'
    : code === 'pr.gh_unauthenticated' ? 'gh no está autenticado. Corré `gh auth login` en una terminal.'
    : code === 'pr.no_github_remote' ? 'Este repo no tiene un remote de GitHub.'
    : null;
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: `color-mix(in oklch, ${t.warn} 10%, transparent)`,
      color: t.text1,
      fontSize: 12, lineHeight: 1.5,
    }}>{friendly ?? error}</div>
  );
}
