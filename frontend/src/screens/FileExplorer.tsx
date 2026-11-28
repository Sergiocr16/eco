import { Btn, Card, IconBtn, IconTile, PageHeader, cx } from '@/design/primitives';
import { IconFolder, IconFolderOpen, IconFileDiff, IconArrowUpRight, IconEdit, IconPlus, IconClock, IconTrash } from '@/design/icons';
import type { Bubble } from '@/lib/types';
import { useMemo, useState } from 'react';
import { useT } from '@/hooks/useI18n';
import { useAllBubbleChanges } from '@/hooks/useGitChanges';
import { workspaceName } from '@/lib/workspace-name';

type Props = {
  bubbles: Bubble[];
  // Abre la burbuja dueña del cambio y navega al diff (Git → Cambios) o al
  // archivo en el editor (Files).
  onOpenChange: (bubbleId: string, path: string, mode: 'diff' | 'files') => void;
};

type ChangeOp = 'created' | 'modified' | 'pending' | 'deleted';

function opFromChange(change: string): ChangeOp {
  if (change === 'created') return 'created';
  if (change === 'deleted') return 'deleted';
  return 'modified'; // modified / renamed
}

export function FileExplorer({ bubbles, onOpenChange }: Props) {
  const tr = useT();
  const [selected, setSelected] = useState<string | null>(null);

  // Las burbujas archivadas no cuentan: ni en el conteo por carpeta ni en los
  // cambios. Viven en su propia pantalla.
  const activeBubbles = useMemo(() => bubbles.filter((b) => !b.archived), [bubbles]);

  const folders = useMemo(
    () => Array.from(new Set(activeBubbles.map((b) => b.workspace).filter(Boolean))),
    [activeBubbles],
  );

  // Cambios git REALES (git status de cada worktree), no la heurística de
  // tool-calls. Cada archivo viene etiquetado con su burbuja.
  const gitChanges = useAllBubbleChanges(
    useMemo(() => activeBubbles.map((b) => ({ id: b.id, workspace: b.workspace })), [activeBubbles]),
  );
  const bubbleMeta = useMemo(
    () => new Map(activeBubbles.map((b) => [b.id, { title: b.title, workspace: b.workspace }])),
    [activeBubbles],
  );

  const changes = useMemo(() => {
    return gitChanges
      .filter((c) => !selected || c.workspace === selected)
      .map((c) => ({
        bubbleId: c.bubbleId,
        agent: bubbleMeta.get(c.bubbleId)?.title ?? '',
        file: c.file,
        op: opFromChange(c.change),
      }))
      .slice(0, 100);
  }, [gitChanges, bubbleMeta, selected]);

  return (
    <div className="eco-page eco-page--scroll">
      <PageHeader
        eyebrow={tr('files.active_folders')}
        title={<span title={selected ?? undefined}>{selected ? workspaceName(selected) : tr('files.all_folders')}</span>}
        sub={(
          <span className="eco-hstack" style={{ gap: 8 }}>
            {tr('files.recent_changes')}
            <span className="eco-count">{changes.length}</span>
          </span>
        )}
      />

      {/* En el teléfono la tarjeta de carpetas pasa a tira horizontal (eco.css). */}
      <div className="eco-split">
        <Card variant="nav" as="nav" className="eco-split__nav">
          {folders.length === 0 ? (
            <div className="eco-sub" style={{ padding: '8px 12px' }}>{tr('files.no_folders')}</div>
          ) : (
            <>
              <FolderListRow
                label={tr('files.all_folders')}
                active={selected === null}
                onClick={() => setSelected(null)}
              />
              {folders.map((f) => (
                <FolderListRow
                  key={f}
                  label={workspaceName(f)}
                  title={f}
                  count={activeBubbles.filter((b) => b.workspace === f).length}
                  changes={gitChanges.filter((c) => c.workspace === f).length}
                  active={selected === f}
                  onClick={() => setSelected(f)}
                />
              ))}
            </>
          )}
        </Card>

        <div className="eco-split__body">
          <Card variant="list">
            {changes.length === 0 ? (
              <div className="eco-empty">{tr('files.no_changes')}</div>
            ) : changes.map((c, i) => (
              <ChangeRow
                key={`${c.bubbleId}-${c.file}-${i}`}
                change={c}
                onDiff={() => onOpenChange(c.bubbleId, c.file, 'diff')}
                onOpen={() => onOpenChange(c.bubbleId, c.file, 'files')}
              />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function FolderListRow({ label, title, count, changes, active, onClick }: {
  label: string;
  title?: string;
  count?: number;
  changes?: number;
  active: boolean;
  onClick: () => void;
}) {
  const tr = useT();
  return (
    <button type="button" onClick={onClick} title={title} className={cx('eco-nav-item', active && 'is-on')}>
      {active ? <IconFolderOpen size={15}/> : <IconFolder size={15}/>}
      <span className="eco-truncate eco-grow">{label}</span>
      {(changes ?? 0) > 0 && (
        <span className="eco-num" title={tr('dash.rail.folder_changes', { n: changes! })}
          style={{ color: 'var(--warn)', fontWeight: 500 }}>{changes}</span>
      )}
      {(count ?? 0) > 0 && <span className="eco-num">{count}</span>}
    </button>
  );
}

function ChangeRow({ change, onDiff, onOpen }: {
  change: { bubbleId: string; agent: string; file: string; op: ChangeOp };
  onDiff: () => void;
  onOpen: () => void;
}) {
  const tr = useT();
  const opMeta = {
    created: { color: 'var(--ok)', label: tr('files.op.created'), icon: IconPlus },
    modified: { color: 'var(--ac)', label: tr('files.op.modified'), icon: IconEdit },
    pending: { color: 'var(--warn)', label: tr('files.op.pending'), icon: IconClock },
    deleted: { color: 'var(--err)', label: tr('files.op.deleted'), icon: IconTrash },
  }[change.op];
  return (
    <div className="eco-row eco-row--tight">
      <IconTile icon={opMeta.icon} title={opMeta.label} style={{ color: opMeta.color }}/>
      <div className="eco-row__main eco-row--click" onClick={onDiff}>
        <div className="eco-mono eco-truncate" style={{ fontSize: 13 }}>{change.file}</div>
        <div className="eco-row__desc eco-truncate">
          {opMeta.label} {tr('files.by')} <span className="eco-muted">{change.agent}</span>
        </div>
      </div>
      <div className="eco-row__end">
        <Btn kind="raised" size="sm" icon={IconFileDiff} onClick={onDiff}>{tr('files.diff_btn')}</Btn>
        <IconBtn icon={IconArrowUpRight} size={28} title={tr('detail.files.open_editor')} onClick={onOpen}/>
      </div>
    </div>
  );
}
