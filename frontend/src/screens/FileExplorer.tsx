import { useTokens } from '@/design/theme';
import { Glass, Pill, SectionLabel } from '@/design/primitives';
import { IconFolder, IconFolderOpen, IconDiff, IconExt, IconEdit, IconPlus, IconClock, IconTrash } from '@/design/icons';
import { Btn, IconBtn } from '@/design/primitives';
import type { Bubble } from '@/lib/types';
import { useMemo } from 'react';
import { useT } from '@/hooks/useI18n';

type Props = {
  bubbles: Bubble[];
};

export function FileExplorer({ bubbles }: Props) {
  const t = useTokens();
  const tr = useT();

  const changes = useMemo(() => {
    const out: Array<{ agent: string; file: string; op: 'created' | 'modified' | 'pending' | 'deleted'; t: number }> = [];
    for (const b of bubbles) {
      for (const m of b.messages) {
        for (const tc of m.toolCalls ?? []) {
          const filePath = String((tc.input as { file_path?: unknown }).file_path ?? '');
          if (!filePath) continue;
          let op: 'created' | 'modified' | 'pending' | 'deleted' = 'pending';
          if (tc.status === 'success') op = tc.name === 'Write' ? 'created' : 'modified';
          else if (tc.status === 'error' || tc.status === 'denied') op = 'pending';
          out.push({ agent: b.title, file: filePath, op, t: m.createdAt });
        }
      }
    }
    return out.sort((a, b) => b.t - a.t).slice(0, 50);
  }, [bubbles]);

  const folders = Array.from(new Set(bubbles.map((b) => b.workspace).filter(Boolean)));

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
          ) : folders.map((f) => {
            const bcount = bubbles.filter((b) => b.workspace === f).length;
            return (
              <div key={f} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                color: t.text1,
              }}>
                <div style={{ color: bcount ? t.accent : t.text2 }}>
                  <IconFolder size={14}/>
                </div>
                <span style={{
                  flex: 1, fontFamily: t.fontMono, fontSize: 11.5, minWidth: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{f}</span>
                {bcount > 0 && (
                  <span style={{
                    padding: '1px 6px', background: t.accentFaint, color: t.accent,
                    borderRadius: 999, fontSize: 10, fontWeight: 500,
                  }}>{bcount}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ color: t.accent }}><IconFolderOpen size={16}/></div>
          <span style={{ fontFamily: t.fontMono, fontSize: 13, color: t.text0 }}>
            {folders[0] || tr('files.no_folder_selected')}
          </span>
        </div>
        <SectionLabel count={changes.length}>{tr('files.recent_changes')}</SectionLabel>
        {changes.length === 0 ? (
          <div style={{ fontSize: 13, color: t.text2, padding: 24, textAlign: 'center' }}>
            {tr('files.no_changes')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {changes.map((c, i) => <ChangeRow key={i} change={c}/>)}
          </div>
        )}
      </div>
    </div>
  );
}

function ChangeRow({ change }: { change: { agent: string; file: string; op: 'created' | 'modified' | 'pending' | 'deleted'; t: number } }) {
  const t = useTokens();
  const tr = useT();
  const m = Math.max(1, Math.round((Date.now() - change.t) / 60000));
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
          <span style={{ color: t.text3 }}>·</span>
          <span style={{ fontSize: 11.5, color: t.text2 }}>{m < 60 ? `${m}m` : `${Math.round(m / 60)}h`}</span>
        </div>
      </div>
      <Btn kind="ghost" size="sm" icon={IconDiff}>{tr('files.diff_btn')}</Btn>
      <IconBtn icon={IconExt} size={28} title={tr('detail.files.open_editor')}/>
    </Glass>
  );
}
