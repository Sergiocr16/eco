import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { useGitLog, type LogEntry } from '@/hooks/useGitLog';
import { ShaPill, SubpanelLoading, EmptyState, formatRelTime } from './shared';
import { CommitDetailPanel } from './CommitDetailPanel';

type Props = {
  workspace: string;
  bubbleId: string;
};

export function HistoryView({ workspace, bubbleId }: Props) {
  const t = useTokens();
  const [allBranches, setAllBranches] = useState(false);
  const { commits, loading, hasMore, error, loadMore, refresh } = useGitLog(workspace, bubbleId, { all: allBranches });
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Default selection: el primer commit cuando carga.
  useEffect(() => {
    if (!selectedSha && commits.length > 0) setSelectedSha(commits[0]!.sha);
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

  const selected = commits.find((c) => c.sha === selectedSha) ?? null;

  if (loading && commits.length === 0) {
    return <SubpanelLoading label="Cargando historial…"/>;
  }
  if (error) {
    return <EmptyState message="Error al cargar el historial" hint={error}/>;
  }
  if (commits.length === 0) {
    return <EmptyState message="Sin commits" hint="Este worktree no tiene commits todavía."/>;
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Lista a la izquierda */}
      <div style={{
        width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: `1px solid ${t.glassBorder}`,
        background: t.bg0, minHeight: 0,
      }}>
        <div style={{
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: `1px solid ${t.glassBorder}`,
          flexShrink: 0,
        }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11.5, color: t.text2, cursor: 'pointer',
          }}>
            <input type="checkbox"
              checked={allBranches}
              onChange={(e) => setAllBranches(e.target.checked)}
              style={{ margin: 0 }}/>
            Todas las ramas
          </label>
          <div style={{ flex: 1 }}/>
          <button type="button"
            onClick={refresh}
            style={{
              height: 22, padding: '0 8px', borderRadius: 5, border: 0,
              background: t.bg2, color: t.text1,
              fontSize: 11, cursor: 'pointer',
            }}>Refrescar</button>
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
              Cargando más…
            </div>
          )}
          {!hasMore && commits.length > 50 && (
            <div style={{ padding: 16, textAlign: 'center', color: t.text3, fontSize: 11 }}>
              Fin del historial
            </div>
          )}
        </div>
      </div>

      {/* Detalle a la derecha */}
      {selected ? (
        <CommitDetailPanel
          workspace={workspace}
          bubbleId={bubbleId}
          summary={selected}
        />
      ) : (
        <EmptyState message="Seleccioná un commit" hint="Click en uno de la lista para ver el diff y acciones."/>
      )}
    </div>
  );
}

function CommitRow({ commit, active, onClick }: { commit: LogEntry; active: boolean; onClick: () => void }) {
  const t = useTokens();
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
            <span style={{ color: t.accent, fontSize: 9.5, fontWeight: 600 }}>merge</span>
          </>
        )}
      </div>
    </button>
  );
}
