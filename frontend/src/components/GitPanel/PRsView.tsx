import { useCallback, useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, IconBtn } from '@/design/primitives';
import { useIsPhone } from '@/hooks/useMediaQuery';
import { IconBranch, IconExt, IconCheck, IconX, IconResume, IconAlert } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit, on as ecoOn } from '@/lib/eco-bus';
import { ResizableSplit } from './ResizableSplit';
import { EmptyState, SubpanelLoading, useFormatRelTime } from './shared';
import { Markdown } from './Markdown';
import { usePullRequests, type PullRequest } from '@/hooks/usePullRequests';
import { useT } from '@/hooks/useI18n';
import { BranchTakeoverDialog, branchHolderFrom, type BranchHolderInfo } from './BranchTakeoverDialog';

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
  const tr = useT();
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

  if (listLoading && !list) return <SubpanelLoading label={tr('prs.loading')}/>;
  if (list && !list.ok) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorBlock error={list.error} code={list.code}/>
      </div>
    );
  }
  if (prs.length === 0) {
    return <EmptyState message={tr('prs.empty.title')} hint={tr('prs.empty.hint')}/>;
  }

  return (
    <ResizableSplit
      storageKey={`eco.git.splitter.prs.${bubbleId}`}
      defaultLeft={360}
      minLeft={260}
      mobileShow={selected !== null ? 'right' : 'left'}
      left={
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '2px 12px 12px' }}>
          <div className="eco-hstack" style={{ gap: 8, padding: '8px 10px 10px', flexShrink: 0 }}>
            <span style={{ fontWeight: 600 }}>{prs.length}</span>
            <span className="eco-muted eco-grow">{prs.length === 1 ? tr('prs.list.open_one') : tr('prs.list.open_many')}</span>
            <button type="button"
              onClick={() => void refresh()}
              title={tr('prs.list.refresh_tooltip')}
              aria-label={tr('prs.list.refresh_tooltip')}
              className="eco-iconbtn eco-iconbtn--xs">
              <IconResume size={14}/>
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
          : <EmptyState message={tr('prs.pick.title')} hint={tr('prs.pick.hint')}/>
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
  const tr = useT();
  const isPhone = useIsPhone();
  const formatRelTime = useFormatRelTime();
  return (
    <button type="button"
      onClick={onClick}
      className={`eco-nav-item${active ? ' is-on' : ''}`}
      style={{
        height: 'auto', flex: 'none', padding: '11px 12px', borderRadius: 14,
        flexDirection: 'column', alignItems: 'stretch', gap: 4, fontWeight: 400,
        color: t.text0,
        // En teléfono el panel va sobre la hoja: `raised` casi no se distingue.
        ...(active && isPhone ? { background: t.card } : {}),
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className="eco-mono" style={{ flex: 'none', fontSize: 12, color: t.text3 }}>#{pr.number}</span>
        <span className="eco-truncate" style={{ flex: 1, fontWeight: 500 }}>{pr.title}</span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12.5, color: t.text3, flexWrap: 'wrap',
      }}>
        <span>{pr.author || tr('common.empty_dash')} · {formatRelTime(pr.updatedAt || pr.createdAt)}</span>
        {pr.isDraft && (
          <span className="eco-mono" style={{
            fontSize: 11.5, padding: '0 7px', borderRadius: 7,
            background: t.sheet, color: t.text1,
          }}>{tr('prs.list.draft')}</span>
        )}
        {pr.isFork && (
          <span className="eco-mono" style={{
            fontSize: 11.5, padding: '0 7px', borderRadius: 7,
            background: t.warnSoft, color: t.warn,
          }}>{tr('prs.list.fork')}</span>
        )}
        {pr.additions != null && <span className="eco-mono" style={{ color: t.ok }}>+{compactNum(pr.additions)}</span>}
        {pr.deletions != null && <span className="eco-mono" style={{ color: t.err }}>−{compactNum(pr.deletions)}</span>}
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
  const tr = useT();
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
  const [readyConfirm, setReadyConfirm] = useState(false);
  // La rama del PR está checked-out en otro worktree: preguntamos si traerla.
  const [takeover, setTakeover] = useState<BranchHolderInfo | null>(null);
  const isPhone = useIsPhone();

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
      setDetails({ ok: false, error: e instanceof Error ? e.message : tr('common.error') });
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

  async function checkout(takeOverFrom?: string) {
    setBusyAction('checkout'); setMsg(null);
    try {
      const r = await apiFetch('/git/pr/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: prNumber, takeOverFrom }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setTakeover(null);
        setMsg({ kind: 'ok', text: d.message || tr('prs.checkout.ok', { n: prNumber }) });
        onAfterCheckout();
      } else if (branchHolderFrom(d)) {
        setTakeover(branchHolderFrom(d));
      } else {
        setTakeover(null);
        setMsg({ kind: 'err', text: d.error || tr('prs.checkout.fail') });
      }
    } catch (e) {
      setTakeover(null);
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusyAction(null);
    }
  }

  async function doMerge(method: 'merge' | 'squash' | 'rebase') {
    setMergeConfirm(null);
    setBusyAction('merge'); setMsg(null);
    ecoEmit('eco:git_busy', { bubbleId, busy: true, kind: 'pr_merge', label: tr('prs.banner.merging') });
    try {
      const r = await apiFetch('/git/pr/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: prNumber, method }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ kind: 'ok', text: d.message || tr('prs.merge.ok', { n: prNumber }) });
        ecoEmit('eco:git_refresh', { bubbleId });
        // Recargamos detalles para reflejar el nuevo state (MERGED).
        void load(true);
        // Re-disparamos el refresh ~1.5 s después. GitHub a veces tarda esos
        // ms en propagar el merge a su API y `gh pr view` / `gh pr list`
        // devuelven estado stale el primer intento — el GitMiniDock y la
        // lista quedaban mostrando el PR como OPEN hasta que el user
        // colapsaba+expandía el panel. El segundo emit captura el estado
        // ya propagado sin que el user tenga que hacer nada.
        setTimeout(() => {
          ecoEmit('eco:git_refresh', { bubbleId });
          void load(true);
        }, 1500);
      } else {
        setMsg({ kind: 'err', text: d.error || tr('prs.merge.fail') });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusyAction(null);
      ecoEmit('eco:git_busy', { bubbleId, busy: false, kind: 'pr_merge' });
    }
  }

  async function doReady() {
    setReadyConfirm(false);
    setBusyAction('ready'); setMsg(null);
    ecoEmit('eco:git_busy', { bubbleId, busy: true, kind: 'pr_ready', label: tr('prs.banner.readying') });
    try {
      const r = await apiFetch('/git/pr/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, number: prNumber }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ kind: 'ok', text: d.message || tr('prs.ready.ok', { n: prNumber }) });
        ecoEmit('eco:git_refresh', { bubbleId });
        void load(true);
      } else {
        setMsg({ kind: 'err', text: d.error || tr('prs.ready.fail') });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusyAction(null);
      ecoEmit('eco:git_busy', { bubbleId, busy: false, kind: 'pr_ready' });
    }
  }

  async function doClose(comment: string) {
    setCloseConfirm(null);
    setBusyAction('close'); setMsg(null);
    ecoEmit('eco:git_busy', { bubbleId, busy: true, kind: 'pr_close', label: tr('prs.banner.closing') });
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
        setMsg({ kind: 'ok', text: d.message || tr('prs.close.ok', { n: prNumber }) });
        ecoEmit('eco:git_refresh', { bubbleId });
        void load(true);
      } else {
        setMsg({ kind: 'err', text: d.error || tr('prs.close.fail') });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : tr('common.error') });
    } finally {
      setBusyAction(null);
      ecoEmit('eco:git_busy', { bubbleId, busy: false, kind: 'pr_close' });
    }
  }

  if (loading) return <SubpanelLoading label={tr('prs.loading_detail')}/>;

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
  const pad = !isPhone;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header con título + meta */}
      <div style={{
        padding: pad ? '22px 24px 14px' : '14px 16px 12px',
        display: 'flex', flexDirection: 'column', gap: 14,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="eco-mono" style={{ fontSize: 13, color: t.text3 }}>#{number}</span>
          <div style={{
            flex: '1 1 300px', minWidth: 0,
            fontSize: pad ? 22 : 18, fontWeight: 400, letterSpacing: '-.02em',
            lineHeight: 1.25, color: t.text0, textWrap: 'pretty', overflowWrap: 'anywhere',
          }}>{title}</div>
          <StateBadge state={state} isDraft={isDraft}/>
        </div>

        {/* "wants to merge N commits into BASE from HEAD" estilo GitHub */}
        <div style={{
          color: t.text1, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 600, color: t.text0 }}>{author || tr('common.empty_dash')}</span>
          <span>{tr('prs.detail.wants_to_merge')}</span>
          <span style={{ fontWeight: 600, color: t.text0 }}>{commitsCount}</span>
          <span>{commitsCount === 1 ? tr('prs.detail.commit_one') : tr('prs.detail.commit_many')}</span>
          <BranchPill name={baseRef}/>
          <span>{tr('prs.detail.from')}</span>
          <BranchPill name={headRef}/>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn kind="primary" icon={IconBranch} onClick={() => void checkout()} disabled={!!busyAction}>
            {busyAction === 'checkout' ? '…' : tr('prs.detail.go_to_branch')}
          </Btn>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="eco-btn eco-btn--raised"
              style={{ textDecoration: 'none' }}>
              <IconExt size={15}/> {tr('prs.detail.view_github')}
            </a>
          )}
          <button type="button"
            onClick={() => void load(false)}
            disabled={!!busyAction}
            title={tr('prs.detail.refresh_comments')}
            aria-label={tr('prs.detail.refresh_comments')}
            className="eco-iconbtn eco-iconbtn--md eco-iconbtn--raised">
            <IconResume size={15}/>
          </button>
        </div>

        {msg && (
          <div className={`eco-banner eco-banner--${msg.kind} eco-mono`}
            style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{msg.text}</div>
        )}
      </div>

      {/* Body + comentarios */}
      <div style={{
        flex: 1, overflow: 'auto', minHeight: 0,
        padding: pad ? '0 24px 18px' : '0 16px 14px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {body && (
          <CommentBlock
            author={author}
            kind="body"
            body={body}
            createdAt={''}
          />
        )}
        {comments.length === 0 && !body ? (
          <div className="eco-empty">
            {tr('prs.detail.no_comments')}
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
          margin: pad ? '0 24px' : '0 16px',
          padding: '14px 0',
          borderTop: `1px solid ${t.line}`,
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 240px', minWidth: 0, color: t.text3 }}>
            {isDraft
              ? tr('prs.detail.draft_hint')
              : tr('prs.detail.actions_on', { n: number })}
          </div>
          {isDraft && (
            <Btn kind="solid"
              onClick={() => setReadyConfirm(true)}
              disabled={!!busyAction}
              title={tr('prs.detail.ready_tooltip')}>
              {busyAction === 'ready' ? '…' : tr('prs.detail.ready_btn')}
            </Btn>
          )}
          <Btn kind="danger"
            onClick={() => setCloseConfirm({ comment: '' })}
            disabled={!!busyAction}
            style={{ borderColor: 'currentColor' }}>
            {busyAction === 'close' ? '…' : tr('prs.detail.close_btn')}
          </Btn>
          <Btn kind={isDraft ? 'raised' : 'primary'}
            onClick={() => setMergeConfirm({ method: 'merge' })}
            disabled={!!busyAction || isDraft}
            title={isDraft ? tr('prs.detail.draft_cant_merge') : tr('prs.detail.merge_tooltip')}>
            {busyAction === 'merge' ? '…' : tr('prs.detail.merge_btn')}
          </Btn>
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
      {takeover && (
        <BranchTakeoverDialog
          holder={takeover}
          busy={busyAction === 'checkout'}
          onCancel={() => setTakeover(null)}
          onConfirm={() => void checkout(takeover.path)}
        />
      )}
      {readyConfirm && (
        <ReadyConfirm
          prNumber={number}
          title={title}
          onCancel={() => setReadyConfirm(false)}
          onConfirm={() => void doReady()}
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

function codeChip(t: ReturnType<typeof useTokens>) {
  return {
    fontFamily: t.fontMono, fontSize: 12,
    padding: '2px 9px', borderRadius: 8,
    background: t.card, color: t.text0,
  } as const;
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
  const tr = useT();
  const [method, setMethod] = useState<'merge' | 'squash' | 'rebase'>(initialMethod);
  const methods: { id: 'merge' | 'squash' | 'rebase'; label: string; desc: string }[] = [
    { id: 'merge', label: tr('prs.merge_confirm.method.merge.label'), desc: tr('prs.merge_confirm.method.merge.desc') },
    { id: 'squash', label: tr('prs.merge_confirm.method.squash.label'), desc: tr('prs.merge_confirm.method.squash.desc') },
    { id: 'rebase', label: tr('prs.merge_confirm.method.rebase.label'), desc: tr('prs.merge_confirm.method.rebase.desc') },
  ];
  return (
    <div className="eco-scrim" onClick={onCancel}>
      <div className="eco-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconBranch size={20}/></span>
          <h2 className="eco-dialog__title">{tr('prs.merge_confirm.title', { n: prNumber })}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body" style={{ lineHeight: 1.7 }}>
          {tr('prs.merge_confirm.body_pre')} <strong>{commitsCount}</strong> {commitsCount === 1 ? tr('prs.merge_confirm.commit_one') : tr('prs.merge_confirm.commit_many')}{' '}
          <code style={codeChip(t)}>{headRef}</code>{' '}
          {tr('prs.merge_confirm.into')}{' '}
          <code style={codeChip(t)}>{baseRef}</code>{' '}
          {tr('prs.merge_confirm.into_remote')}
        </div>
        <div className="eco-optlist" role="radiogroup">
          {methods.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={method === m.id}
              className={`eco-option${method === m.id ? ' is-on' : ''}`}
              onClick={() => setMethod(m.id)}>
              <span className="eco-option__text">
                <span className="eco-option__title">{m.label}</span>
                <span className="eco-sub">{m.desc}</span>
              </span>
              {method === m.id && <span className="eco-option__check" style={{ display: 'flex' }}><IconCheck size={15}/></span>}
            </button>
          ))}
        </div>
        <div className="eco-sub">
          {tr('prs.merge_confirm.gh_hint')}
        </div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={() => onConfirm(method)}>{tr('prs.merge_confirm.confirm')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadyConfirm({
  prNumber, title, onCancel, onConfirm,
}: {
  prNumber: number;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tr = useT();
  return (
    <div className="eco-scrim" onClick={onCancel}>
      <div className="eco-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconCheck size={20}/></span>
          <h2 className="eco-dialog__title">{tr('prs.ready_confirm.title', { n: prNumber })}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body">
          <em>{title}</em>
        </div>
        <div className="eco-dialog__body">
          {tr('prs.ready_confirm.body')}
        </div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={onConfirm}>{tr('prs.ready_confirm.confirm')}</button>
          </div>
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
  const tr = useT();
  const [comment, setComment] = useState(initialComment);
  return (
    <div className="eco-scrim" onClick={onCancel}>
      <div className="eco-dialog eco-dialog--danger" onClick={(e) => e.stopPropagation()}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile eco-dialog__tile--danger"><IconAlert size={20}/></span>
          <h2 className="eco-dialog__title">{tr('prs.close_confirm.title', { n: prNumber })}</h2>
          <IconBtn icon={IconX} size={32} onClick={onCancel} title={tr('common.close')}/>
        </div>
        <div className="eco-dialog__body">
          <em>{title}</em>
        </div>
        <div className="eco-dialog__body">
          {tr('prs.close_confirm.body')}
        </div>
        <div className="eco-dialog__section">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={tr('prs.close_confirm.comment_placeholder')}
            rows={3}
            className="eco-field"
            style={{ minHeight: 72 }}/>
        </div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={onCancel}>{tr('common.cancel')}</button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--danger-solid" onClick={() => onConfirm(comment)}>{tr('prs.detail.close_btn')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state, isDraft }: { state: string; isDraft: boolean }) {
  const t = useTokens();
  const color = isDraft ? t.text1
    : state === 'MERGED' ? t.info
    : state === 'CLOSED' ? t.err
    : t.ok;
  const label = isDraft ? 'DRAFT' : state;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 10,
      background: t.raised,
      color, fontSize: 11.5, fontWeight: 500, textTransform: 'capitalize',
      flexShrink: 0,
    }}>{label.toLowerCase()}</span>
  );
}

function BranchPill({ name }: { name: string }) {
  const t = useTokens();
  const tr = useT();
  return (
    <code style={{
      fontFamily: t.fontMono, fontSize: 12,
      padding: '2px 9px', borderRadius: 8,
      background: t.raised, color: t.text0, overflowWrap: 'anywhere',
    }}>{name || tr('common.empty_dash')}</code>
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
  const tr = useT();
  const formatRelTime = useFormatRelTime();
  const stateIcon =
    state === 'APPROVED' ? <IconCheck size={13}/>
    : state === 'CHANGES_REQUESTED' ? <IconX size={13}/>
    : null;
  const stateColor =
    state === 'APPROVED' ? t.ok
    : state === 'CHANGES_REQUESTED' ? t.err
    : t.text1;
  const kindLabel =
    kind === 'body' ? tr('prs.detail.body_kind')
    : kind === 'review' ? (state ? state.replace('_', ' ').toLowerCase() : tr('prs.detail.review_kind'))
    : kind === 'inline' ? tr('prs.detail.inline_kind', { path: path || tr('prs.detail.inline_kind_file') })
    : tr('prs.detail.commented_kind');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6, minWidth: 0 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: t.raised, color: t.text0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600,
          flexShrink: 0,
        }}>{(author || '?').slice(0, 1).toUpperCase()}</span>
        <span style={{ fontWeight: 600, flexShrink: 0 }}>{author || tr('prs.detail.anon')}</span>
        <span style={{
          flex: 1, minWidth: 0, overflowWrap: 'anywhere',
          color: kind === 'body' ? t.accent : stateColor,
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          {stateIcon}
          {kindLabel}
        </span>
        {createdAt && (
          <span style={{ color: t.text3, fontSize: 12.5, flexShrink: 0 }}>
            {formatRelTime(createdAt)}
          </span>
        )}
      </div>
      {body ? (
        <div style={{
          padding: '12px 20px', borderRadius: 16,
          background: t.raised, minWidth: 0,
        }}>
          <Markdown source={body}/>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: t.text3, fontStyle: 'italic' }}>
          {tr('prs.detail.no_text')}
        </div>
      )}
    </div>
  );
}

function ErrorBlock({ error, code }: { error: string; code?: string }) {
  const tr = useT();
  const friendly =
    code === 'pr.gh_missing' ? tr('prs.err.gh_missing')
    : code === 'pr.gh_unauthenticated' ? tr('prs.err.gh_unauthenticated')
    : code === 'pr.no_github_remote' ? tr('prs.err.no_github_remote')
    : null;
  return (
    <div className="eco-banner eco-banner--warn" style={{ lineHeight: 1.5 }}>{friendly ?? error}</div>
  );
}
