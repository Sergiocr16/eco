import { useMemo, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { IconCheck } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { BranchPicker } from '@/components/BranchPicker';
import { useBranches } from '@/hooks/useBranches';

type Props = {
  workspace: string;
  bubbleId: string;
  onRenameAgent?: (name: string) => void;
};

export function BranchesView({ workspace, bubbleId, onRenameAgent }: Props) {
  const t = useTokens();
  const { data } = useBranches(workspace, bubbleId);

  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '20px 24px',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <BranchPicker
        workspace={workspace}
        bubbleId={bubbleId}
        onRenameAgent={onRenameAgent}
      />

      <MergeIntoCurrent
        workspace={workspace}
        bubbleId={bubbleId}
        currentBranch={data?.current ?? null}
        branches={data?.branches ?? []}
      />

      <div style={{ fontSize: 11, color: t.text3, lineHeight: 1.5 }}>
        Para cherry-pickear commits específicos, abrí la sub-pestaña <strong>Historial</strong> y
        seleccioná el commit que querés traer.
      </div>
    </div>
  );
}

function MergeIntoCurrent({ workspace, bubbleId, currentBranch, branches }: {
  workspace: string;
  bubbleId: string;
  currentBranch: string | null;
  branches: { name: string; isCurrent: boolean; isRemote: boolean }[];
}) {
  const t = useTokens();
  const [source, setSource] = useState('');
  const [noFf, setNoFf] = useState(false);
  const [squash, setSquash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const options = useMemo(
    () => branches.filter((b) => !b.isCurrent && !b.isRemote).map((b) => b.name),
    [branches],
  );

  async function doMerge() {
    if (!source) return;
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch('/git/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace, bubbleId,
          source,
          noFf: noFf && !squash,
          squash,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        const conflictMsg = d.conflict ? ` (${d.conflict.files.length} archivos en conflicto — resolvé en Cambios)` : '';
        setMsg({ kind: 'err', text: (d.error || `HTTP ${r.status}`) + conflictMsg });
      } else {
        setMsg({ kind: 'ok', text: d.message || 'Merge OK' });
        ecoEmit('eco:git_refresh', { bubbleId });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: t.bg1, border: `1px solid ${t.glassBorder}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text0 }}>Merge into current</div>
        <div style={{ fontSize: 11.5, color: t.text2 }}>
          Trae los cambios de otra rama local a la rama actual ({currentBranch ? <code style={{ fontFamily: t.fontMono }}>{currentBranch}</code> : 'detached'}).
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={busy}
          style={{
            flex: '1 1 200px', minWidth: 160,
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 6, padding: '6px 8px',
            fontFamily: t.fontMono, fontSize: 12, color: t.text0, outline: 'none',
          }}>
          <option value="">Elegir rama…</option>
          {options.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11.5, color: t.text2, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={noFf} onChange={(e) => setNoFf(e.target.checked)} disabled={squash || busy} style={{ margin: 0 }}/>
          --no-ff
        </label>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11.5, color: t.text2, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={squash} onChange={(e) => setSquash(e.target.checked)} disabled={busy} style={{ margin: 0 }}/>
          --squash
        </label>
        <Btn kind="primary" size="sm" icon={IconCheck} onClick={() => void doMerge()} disabled={!source || busy || !currentBranch}>
          {busy ? '…' : 'Mergear'}
        </Btn>
      </div>

      {msg && (
        <div style={{
          padding: '6px 8px', borderRadius: 6,
          background: `color-mix(in oklch, ${msg.kind === 'ok' ? t.ok : t.err} 12%, transparent)`,
          color: msg.kind === 'ok' ? t.ok : t.err,
          fontFamily: t.fontMono, fontSize: 11,
        }}>{msg.text}</div>
      )}
    </div>
  );
}
