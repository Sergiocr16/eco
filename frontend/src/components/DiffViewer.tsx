import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconX, IconDiff, IconExt } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { useT } from '@/hooks/useI18n';
import { translateBackendError } from '@/lib/backend-errors';

type DiffResult = {
  mode: 'git' | 'created' | 'plain' | 'not_found';
  diff: string;
  hasChanges: boolean;
  message?: string;
};

type Props = {
  open: boolean;
  path: string | null;
  workspace: string;
  onClose: () => void;
};

export function DiffViewer({ open, path, workspace, onClose }: Props) {
  const t = useTokens();
  const tr = useT();
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    apiFetch('/file/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, workspace }),
    })
      .then(async (r) => {
        if (cancelled) return;
        const data = await r.json().catch(() => ({}));
        if (!r.ok) setError(translateBackendError(data, `HTTP ${r.status}`));
        else setResult(data as DiffResult);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, path, workspace]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !path) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 160,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 100%)', maxHeight: '88vh',
          background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
          borderRadius: 18, boxShadow: t.shadowLg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconDiff size={13}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: t.fontMono, fontSize: 12.5, color: t.text0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{path}</div>
            <div style={{ fontSize: 11, color: t.text2, marginTop: 1 }}>
              {result?.mode === 'git' ? tr('diff.git') :
                result?.mode === 'created' ? tr('diff.created') :
                result?.mode === 'plain' ? tr('diff.plain') :
                result?.mode === 'not_found' ? tr('diff.not_found') :
                loading ? tr('diff.loading') : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 0,
              background: 'transparent', color: t.text2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconX size={14}/>
          </button>
        </div>

        <div style={{
          flex: 1, overflow: 'auto', padding: 0,
          background: t.bg0,
        }}>
          {loading && (
            <div style={{ padding: 24, fontSize: 13, color: t.text2 }}>{tr('diff.loading')}</div>
          )}
          {error && (
            <div style={{ padding: 24, fontSize: 13, color: t.err }}>{error}</div>
          )}
          {result && !result.hasChanges && !error && (
            <div style={{ padding: 24, fontSize: 13, color: t.text2 }}>
              {result.message || tr('diff.no_changes')}
            </div>
          )}
          {result?.hasChanges && (
            <DiffRender diff={result.diff} mode={result.mode}/>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffRender({ diff, mode }: { diff: string; mode: DiffResult['mode'] }) {
  const t = useTokens();
  if (mode === 'plain') {
    return (
      <pre style={{
        margin: 0, padding: '14px 18px',
        fontFamily: t.fontMono, fontSize: 12, lineHeight: 1.6,
        color: t.text1, whiteSpace: 'pre',
        overflow: 'auto',
      }}>{diff}</pre>
    );
  }
  const lines = diff.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {lines.map((line, i) => <DiffLine key={i} line={line}/>)}
    </div>
  );
}

function DiffLine({ line }: { line: string }) {
  const t = useTokens();
  let color = t.text1;
  let bg = 'transparent';
  let prefix = ' ';
  if (line.startsWith('+++') || line.startsWith('---')) {
    color = t.text2;
    bg = `color-mix(in oklch, ${t.text0} 5%, transparent)`;
  } else if (line.startsWith('@@')) {
    color = 'oklch(70% 0.14 240)';
    bg = `color-mix(in oklch, oklch(70% 0.14 240) 8%, transparent)`;
  } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
    color = t.text3;
  } else if (line.startsWith('+')) {
    color = t.ok;
    bg = `color-mix(in oklch, ${t.ok} 9%, transparent)`;
    prefix = '+';
  } else if (line.startsWith('-')) {
    color = t.err;
    bg = `color-mix(in oklch, ${t.err} 9%, transparent)`;
    prefix = '-';
  }
  void prefix;
  return (
    <div style={{
      fontFamily: t.fontMono, fontSize: 12, lineHeight: 1.55,
      color, background: bg,
      padding: '0 16px',
      whiteSpace: 'pre',
      borderLeft: line.startsWith('+') ? `2px solid ${t.ok}` :
                  line.startsWith('-') ? `2px solid ${t.err}` :
                  '2px solid transparent',
    }}>{line || ' '}</div>
  );
}

export { IconExt };
