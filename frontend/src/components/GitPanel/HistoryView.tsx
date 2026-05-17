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
      left={
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
          background: t.bg0,
        }}>
          <div style={{
            padding: '8px 14px', display: 'flex', alignItems: 'center',
            borderBottom: `1px solid ${t.glassBorder}`,
            flexShrink: 0,
          }}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11.5, color: t.text2, cursor: 'pointer',
            }}
            title={tr('git.history.all_branches_tooltip')}>
              <input type="checkbox"
                checked={allBranches}
                onChange={(e) => setAllBranches(e.target.checked)}
                style={{ margin: 0 }}/>
              {tr('git.history.all_branches')}
            </label>
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {commits.map((c) => (
              <CommitRow
                key={c.sha}
                commit={c}
                active={c.sha === selectedSha}
                onClick={() => setSelectedSha(c.sha)}
              />
            ))}
            {loading && commits.length > 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: t.text3, fontSize: 11 }}>
                {tr('git.history.loading_more')}
              </div>
            )}
            {!hasMore && commits.length > 50 && (
              <div style={{ padding: 16, textAlign: 'center', color: t.text3, fontSize: 11 }}>
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
      style={{
        width: '100%', padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 4,
        border: 0, background: active ? t.accentFaint : 'transparent',
        textAlign: 'left', cursor: 'pointer',
        borderLeft: active ? `3px solid ${t.accent}` : '3px solid transparent',
        borderBottom: `1px solid ${t.glassBorder}`,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = t.bg1; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <ShaPill sha={commit.sha} abbrev={commit.abbrev}/>
        <div style={{
          flex: 1, minWidth: 0,
          fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500, color: t.text0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{commit.subject}</div>
      </div>
      <div style={{ fontSize: 10.5, color: t.text3, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>{commit.author}</span>
        <span>·</span>
        <span>{formatRelTime(commit.date)}</span>
        {commit.refs.length > 0 && (
          <>
            <span>·</span>
            {commit.refs.slice(0, 2).map((r, i) => (
              <span key={i} style={{
                padding: '0 5px', borderRadius: 4,
                background: t.bg3, color: t.text1, fontSize: 9.5, fontWeight: 600,
              }}>{r.replace('HEAD -> ', '').replace('tag: ', '🏷 ')}</span>
            ))}
          </>
        )}
        {commit.parents.length > 1 && (
          <>
            <span>·</span>
            <span style={{ color: t.accent, fontSize: 9.5, fontWeight: 600 }}>{tr('git.history.merge_tag')}</span>
          </>
        )}
      </div>
    </button>
  );
}
