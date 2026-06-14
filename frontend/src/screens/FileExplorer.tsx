import { useTokens } from '@/design/theme';
import { Glass, Pill, SectionLabel } from '@/design/primitives';
import { IconFolder, IconFolderOpen, IconDiff, IconExt, IconEdit, IconPlus, IconClock, IconTrash } from '@/design/icons';
import { Btn, IconBtn } from '@/design/primitives';
import type { Bubble } from '@/lib/types';
import { useMemo, useState } from 'react';
import { useT } from '@/hooks/useI18n';
import { useAllBubbleChanges } from '@/hooks/useGitChanges';
import { workspaceName } from '@/lib/workspace-name';

type Props = {
  bubbles: Bubble[];
};

type ChangeOp = 'created' | 'modified' | 'pending' | 'deleted';

function opFromChange(change: string): ChangeOp {
  if (change === 'created') return 'created';
  if (change === 'deleted') return 'deleted';
  return 'modified'; // modified / renamed
}

export function FileExplorer({ bubbles }: Props) {
  const t = useTokens();
  const tr = useT();
  const [selected, setSelected] = useState<string | null>(null);

  const folders = useMemo(
    () => Array.from(new Set(bubbles.map((b) => b.workspace).filter(Boolean))),
    [bubbles],
  );

  // Cambios git REALES (git status de cada worktree), no la heurística de
  // tool-calls. Cada archivo viene etiquetado con su burbuja.
  const gitChanges = useAllBubbleChanges(
    useMemo(() => bubbles.map((b) => ({ id: b.id, workspace: b.workspace })), [bubbles]),
  );
  const bubbleMeta = useMemo(
    () => new Map(bubbles.map((b) => [b.id, { title: b.title, workspace: b.workspace }])),
    [bubbles],
  );

  const changes = useMemo(() => {
    return gitChanges
      .filter((c) => !selected || c.workspace === selected)
      .map((c) => ({
        agent: bubbleMeta.get(c.bubbleId)?.title ?? '',
        file: c.file,
        op: opFromChange(c.change),
      }))
      .slice(0, 100);
  }, [gitChanges, bubbleMeta, selected]);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{
        width: 240, flexShrink: 0, padding: '20px 12px',
        borderRight: `1px solid ${t.glassBorder}`,
        overflow: 'auto',
      }}>
        <SectionLabel>{tr('files.active_folders')}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {folders.length === 0 ? (
            <div style={{ fontSize: 12, color: t.text3, padding: 8 }}>{tr('files.no_folders')}</div>
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
                  count={bubbles.filter((b) => b.workspace === f).length}
                  changes={gitChanges.filter((c) => c.workspace === f).length}
                  active={selected === f}
                  onClick={() => setSelected(f)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ color: t.accent }}><IconFolderOpen size={16}/></div>
          <span style={{ fontFamily: t.fontMono, fontSize: 13, color: t.text0 }}
            title={selected ?? undefined}>
            {selected ? workspaceName(selected) : tr('files.all_folders')}
          </span>
        </div>
        <SectionLabel count={changes.length}>{tr('files.recent_changes')}</SectionLabel>
        {changes.length === 0 ? (
          <div style={{ fontSize: 13, color: t.text2, padding: 24, textAlign: 'center' }}>
            {tr('files.no_changes')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {changes.map((c, i) => <ChangeRow key={`${c.file}-${i}`} change={c}/>)}
          </div>
        )}
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
  const t = useTokens();
  const tr = useT();
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        background: active ? t.bg3 : (h ? t.bg2 : 'transparent'),
        color: active ? t.text0 : t.text1,
      }}>
      <div style={{ color: (count ?? 0) > 0 || active ? t.accent : t.text2 }}>
        <IconFolder size={14}/>
      </div>
      <span style={{
        flex: 1, fontFamily: t.fontMono, fontSize: 11.5, minWidth: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>
      {(changes ?? 0) > 0 && (
        <span
          title={tr('dash.rail.folder_changes', { n: changes! })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '1px 6px', background: `color-mix(in oklch, ${t.warn} 16%, transparent)`,
            color: t.warn, borderRadius: 999, fontSize: 10, fontWeight: 600,
          }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.warn }}/>
          {changes}
        </span>
      )}
      {(count ?? 0) > 0 && (
        <span style={{
          padding: '1px 6px', background: t.accentFaint, color: t.accent,
          borderRadius: 999, fontSize: 10, fontWeight: 500,
        }}>{count}</span>
      )}
    </div>
  );
}

function ChangeRow({ change }: { change: { agent: string; file: string; op: ChangeOp } }) {
  const t = useTokens();
  const tr = useT();
  const opMeta = {
    created: { color: t.ok, label: tr('files.op.created'), icon: IconPlus },
    modified: { color: t.accent, label: tr('files.op.modified'), icon: IconEdit },
    pending: { color: t.warn, label: tr('files.op.pending'), icon: IconClock },
    deleted: { color: t.err, label: tr('files.op.deleted'), icon: IconTrash },
  }[change.op];
  const Icon = opMeta.icon;
  return (
    <Glass radius={12} hover style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: `color-mix(in oklch, ${opMeta.color} 12%, transparent)`,
        color: opMeta.color, border: `1px solid color-mix(in oklch, ${opMeta.color} 30%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon size={14}/></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: t.fontMono, fontSize: 13, color: t.text0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{change.file}</div>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill color={opMeta.color}>{opMeta.label}</Pill>
          <span style={{ fontSize: 11.5, color: t.text2 }}>
            {tr('files.by')} <span style={{ color: t.text1 }}>{change.agent}</span>
          </span>
        </div>
      </div>
      <Btn kind="ghost" size="sm" icon={IconDiff}>{tr('files.diff_btn')}</Btn>
      <IconBtn icon={IconExt} size={28} title={tr('detail.files.open_editor')}/>
    </Glass>
  );
}
