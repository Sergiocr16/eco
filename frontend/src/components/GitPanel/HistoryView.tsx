import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { useGitLog, type LogEntry } from '@/hooks/useGitLog';
import { ShaPill, SubpanelLoading, EmptyState, useFormatRelTime } from './shared';
import { CommitDetailPanel } from './CommitDetailPanel';
import { ResizableSplit } from './ResizableSplit';
import { useT } from '@/hooks/useI18n';

type Props = {
  workspace: string;
  bubbleId: string;
};

export function HistoryView({ workspace, bubbleId }: Props) {
  const t = useTokens();
  const tr = useT();
  // Persistimos allBranches por bubble — si el user activó el checkbox una
  // vez, lo mantiene al volver al tab Git.
  const [allBranches, setAllBranches] = useState<boolean>(() => {
    try { return localStorage.getItem(`eco.git.history.all_branches.${bubbleId}`) === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(`eco.git.history.all_branches.${bubbleId}`, allBranches ? '1' : '0'); }
    catch { /* noop */ }
  }, [allBranches, bubbleId]);

  const { commits, loading, hasMore, error, loadMore } = useGitLog(workspace, bubbleId, { all: allBranches });
  // Persistimos el commit seleccionado por bubble — al volver al tab Git
  // arranca con el último commit que estabas viendo.
  const [selectedSha, setSelectedSha] = useState<string | null>(() => {
    try { return localStorage.getItem(`eco.git.selected_commit.${bubbleId}`); }
    catch { return null; }
  });
  useEffect(() => {
    try {
      if (selectedSha) localStorage.setItem(`eco.git.selected_commit.${bubbleId}`, selectedSha);
      else localStorage.removeItem(`eco.git.selected_commit.${bubbleId}`);
    } catch { /* noop */ }
  }, [selectedSha, bubbleId]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Default selection: primer commit cuando carga SI no había uno
  // persistido. Si el SHA persistido no aparece en la lista paginada,
  // lo MANTENEMOS — CommitDetailPanel carga el detalle vía /git/show
  // aunque el commit esté fuera de la página actual.
  useEffect(() => {
    if (commits.length === 0) return;
    if (!selectedSha) setSelectedSha(commits[0]!.sha);
  }, [commits, selectedSha]);

  // Infinite scroll: cuando se acerca al final de la lista, pedimos más.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasMore || loading) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        loadMore();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, loading, loadMore]);

  // Si el SHA seleccionado no está en la página actual del log (commit
  // viejo persistido fuera del fetch inicial), creamos un summary stub —
  // CommitDetailPanel reemplaza los campos al hacer su fetch de detalles.
  const selectedFromList = commits.find((c) => c.sha === selectedSha);
  const selected: LogEntry | null = selectedFromList
    ?? (selectedSha
      ? { sha: selectedSha, abbrev: selectedSha.slice(0, 7), author: tr('common.empty_dash'), email: '', date: '', subject: tr('common.loading'), body: '', refs: [], parents: [] }
      : null);

  if (loading && commits.length === 0) {
    return <SubpanelLoading label={tr('git.history.loading')}/>;
  }
  if (error) {
    return <EmptyState message={tr('git.history.error_title')} hint={error}/>;
  }
  if (commits.length === 0) {
    return <EmptyState message={tr('git.history.empty_title')} hint={tr('git.history.empty_hint')}/>;
  }

  return (
    <ResizableSplit
      storageKey={`eco.git.splitter.history.${bubbleId}`}
      defaultLeft={380}
      minLeft={260}
      mobileShow={selectedSha ? 'right' : 'left'}
      left={
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <label className="eco-hstack eco-muted" style={{ gap: 9, cursor: 'pointer' }}
              title={tr('git.history.all_branches_tooltip')}>
              <input type="checkbox"
                checked={allBranches}
                onChange={(e) => setAllBranches(e.target.checked)}
                style={{ margin: 0, width: 15, height: 15, accentColor: t.accent }}/>
              {tr('git.history.all_branches')}
            </label>
          </div>
          <div ref={scrollRef} style={{
            flex: 1, overflow: 'auto', minHeight: 0, padding: '0 8px 10px',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {commits.map((c) => (
              <CommitRow
                key={c.sha}
                commit={c}
                active={c.sha === selectedSha}
                onClick={() => setSelectedSha(c.sha)}
              />
            ))}
            {loading && commits.length > 0 && (
              <div className="eco-sub" style={{ padding: 16, textAlign: 'center' }}>
                {tr('git.history.loading_more')}
              </div>
            )}
            {!hasMore && commits.length > 50 && (
              <div className="eco-sub" style={{ padding: 16, textAlign: 'center' }}>
                {tr('git.history.end')}
              </div>
            )}
          </div>
        </div>
      }
      right={
        selected ? (
          <CommitDetailPanel
            workspace={workspace}
            bubbleId={bubbleId}
            summary={selected}
          />
        ) : (
          <EmptyState message={tr('git.history.pick_commit_title')} hint={tr('git.history.pick_commit_hint')}/>
        )
      }
    />
  );
}

function CommitRow({ commit, active, onClick }: { commit: LogEntry; active: boolean; onClick: () => void }) {
  const t = useTokens();
  const tr = useT();
  const formatRelTime = useFormatRelTime();
  return (
    <button type="button"
      onClick={onClick}
      className={`eco-nav-item${active ? ' is-on' : ''}`}
      style={{
        height: 'auto', flex: 'none', padding: '11px 12px', borderRadius: 14,
        flexDirection: 'column', alignItems: 'stretch', gap: 4, fontWeight: 400,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <ShaPill sha={commit.sha} abbrev={commit.abbrev}/>
        <div className="eco-truncate" style={{ flex: 1, fontWeight: 500, color: t.text0 }}>{commit.subject}</div>
      </div>
      <div className="eco-sub">
        {commit.author} · {formatRelTime(commit.date)}
        {commit.parents.length > 1 && (
          <> · <span style={{ color: t.accent }}>{tr('git.history.merge_tag')}</span></>
        )}
      </div>
      {commit.refs.length > 0 && (
        <div className="eco-mono eco-truncate" style={{ fontSize: 11.5, color: t.text1 }}>
          {commit.refs.slice(0, 2).map((r) => r.replace('HEAD -> ', '')).join(' · ')}
        </div>
      )}
    </button>
  );
}
