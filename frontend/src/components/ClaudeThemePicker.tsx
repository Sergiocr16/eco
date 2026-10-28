import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTokens } from '@/design/theme';
import { isLightTheme, type EffectiveThemeMode } from '@/design/tokens';
import { dialogSurface, scrimStyle } from '@/design/primitives';
import { IconCheck } from '@/design/icons';
import { useT } from '@/hooks/useI18n';
import { CLAUDE_THEME_CATALOG, type ClaudeThemeEntry } from '@/design/claude-theme-catalog';
import { CLAUDE_THEME_FOR_ECO } from '@/design/claude-theme-map';
import { claudeThemeFor, setClaudeThemeFor } from '@/hooks/useClaudeThemeSync';
import { subscribePrefs } from '@/lib/prefs-sync';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// Tarjeta al estilo de la galería ccthemes: nombre, píldora "claude", seis
// muestras y las barras "+ added / − removed", todo con los colores reales
// del tema para ver cómo queda antes de elegirlo.
export function ClaudeThemeCard({ entry, selected, recommended, compact, onClick }: {
  entry: ClaudeThemeEntry; selected?: boolean; recommended?: boolean; compact?: boolean;
  onClick?: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const p = entry.preview;
  const pad = compact ? 8 : 12;
  return (
    <button type="button" onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
      padding: pad, borderRadius: 10, background: p.bg, color: p.text, fontFamily: MONO,
      border: `1px solid ${selected ? t.accent : p.muted + '55'}`,
      boxShadow: selected ? `0 0 0 2px ${t.accent}55` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: compact ? 11 : 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {selected && <IconCheck size={10} strokeWidth={3}/>}
            {entry.name}
          </div>
          <div style={{ fontSize: compact ? 8.5 : 9.5, color: p.muted, marginTop: 2, letterSpacing: 0.5 }}>
            {entry.base === 'dark' ? '● DARK' : '○ LIGHT'}
            {recommended && <span style={{ marginLeft: 6, color: p.claude }}>★ {tr('settings.appearance.claude_theme.recommended')}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 8, color: p.muted, marginBottom: 2 }}>claude</div>
          <div style={{ width: compact ? 30 : 44, height: compact ? 5 : 7, borderRadius: 4, background: p.claude }}/>
        </div>
      </div>
      <div style={{ display: 'flex', gap: compact ? 4 : 6, marginTop: compact ? 7 : 10 }}>
        {p.swatches.map((c, i) => (
          <span key={i} style={{ width: compact ? 10 : 14, height: compact ? 10 : 14, borderRadius: 3, background: c }}/>
        ))}
      </div>
      {!compact && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, fontSize: 8.5 }}>
          <span style={{ flex: 1, padding: '2px 6px', borderRadius: 3, background: p.added, color: p.addedFg }}>+ added</span>
          <span style={{ flex: 1, padding: '2px 6px', borderRadius: 3, background: p.removed, color: p.removedFg }}>− removed</span>
        </div>
      )}
    </button>
  );
}

// Botón bajo cada apariencia: muestra el tema elegido como tarjeta compacta y
// abre un modal con las tarjetas del mismo tono (oscuras para apariencias
// oscuras, claras para claras). La elección va a prefs (por usuario).
export function ClaudeThemePickerButton({ mode }: { mode: EffectiveThemeMode }) {
  const t = useTokens();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => subscribePrefs(() => bump((n) => n + 1)), []);
  const recommended = CLAUDE_THEME_FOR_ECO[mode];
  const chosenId = claudeThemeFor(mode);
  const chosen = CLAUDE_THEME_CATALOG.find((c) => c.id === chosenId) ?? CLAUDE_THEME_CATALOG.find((c) => c.id === recommended);
  const tone = isLightTheme(mode) ? 'light' : 'dark';
  const options = CLAUDE_THEME_CATALOG.filter((c) => c.base === tone);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9.5, color: t.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {tr('settings.appearance.claude_theme.label')}
      </div>
      {chosen && <ClaudeThemeCard entry={chosen} compact recommended={chosen.id === recommended} onClick={() => setOpen(true)}/>}
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, ...scrimStyle(t),
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }}>
          <div style={{
            width: 'min(960px, 92vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column',
            padding: 18, ...dialogSurface(t), borderRadius: t.r3, color: t.text0, fontFamily: t.fontSans,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {tr('settings.appearance.claude_theme.pick_title')}
                </div>
                <div style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>
                  {tr('settings.appearance.claude_theme.pick_sub')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {chosenId !== recommended && (
                  <button type="button" onClick={() => { setClaudeThemeFor(mode, null); setOpen(false); }} style={{
                    padding: '6px 12px', borderRadius: t.r2, background: t.accentFaint, color: t.accent,
                    border: `1px solid ${t.accentDim}`, cursor: 'pointer', fontFamily: t.fontSans, fontSize: 12,
                  }}>★ {tr('settings.appearance.claude_theme.restore')}</button>
                )}
                <button type="button" onClick={() => setOpen(false)} style={{
                  padding: '6px 12px', borderRadius: t.r2, background: 'transparent', color: t.text1,
                  border: `1px solid ${t.glassBorder}`, cursor: 'pointer', fontFamily: t.fontSans, fontSize: 12,
                }}>{tr('common.close')}</button>
              </div>
            </div>
            <div style={{
              overflowY: 'auto', display: 'grid', gap: 10,
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', paddingRight: 4,
            }}>
              {options.map((c) => (
                <ClaudeThemeCard
                  key={c.id} entry={c}
                  selected={c.id === chosenId}
                  recommended={c.id === recommended}
                  onClick={() => { setClaudeThemeFor(mode, c.id); setOpen(false); }}
                />
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
