import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Monitor, Tablet, Smartphone, Check, RotateCcw } from 'lucide-react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { viewportDims, type ViewportPreset } from './types';

type Props = {
  viewport: ViewportPreset;
  customViewport?: { width: number; height: number };
  disabled?: boolean;
  onChange: (next: ViewportPreset, custom?: { width: number; height: number }) => void;
  onRotate: () => void;
};

const PRESETS: Array<{ key: Exclude<ViewportPreset, 'custom'>; Icon: typeof Monitor; labelKey: string }> = [
  { key: 'desktop', Icon: Monitor, labelKey: 'browser.viewport.desktop' },
  { key: 'tablet', Icon: Tablet, labelKey: 'browser.viewport.tablet' },
  { key: 'mobile', Icon: Smartphone, labelKey: 'browser.viewport.mobile' },
];

export function ViewportMenu({ viewport, customViewport, disabled, onChange, onRotate }: Props) {
  const t = useTokens();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draftW, setDraftW] = useState<number>(customViewport?.width ?? 1200);
  const [draftH, setDraftH] = useState<number>(customViewport?.height ?? 800);

  // Icono del trigger: refleja el preset activo.
  const TriggerIcon = viewport === 'mobile' ? Smartphone
    : viewport === 'tablet' ? Tablet
    : Monitor;

  const dim = viewportDims(viewport, customViewport);
  const label = viewport === 'custom' && dim
    ? `${dim.width}×${dim.height}`
    : viewport === 'desktop'
      ? tr('browser.viewport.desktop')
      : viewport === 'tablet'
        ? '768×1024'
        : '390×844';

  return (
    <DropdownMenu.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCustomMode(false); }}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={tr('browser.viewport.label')}
          aria-label={tr('browser.viewport.label')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 26, padding: '0 8px', border: 0, borderRadius: 6,
            background: viewport === 'desktop' ? t.bg2 : `color-mix(in oklch, ${t.accent} 18%, transparent)`,
            color: viewport === 'desktop' ? t.text1 : t.accent,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1,
            fontFamily: t.fontMono, fontSize: 10.5,
          }}
        >
          <TriggerIcon size={12}/>
          <span>{label}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          style={{
            minWidth: 200,
            background: t.windowBg,
            border: `1px solid ${t.glassBorder}`,
            borderRadius: t.r2,
            boxShadow: t.shadowLg,
            padding: 4,
            zIndex: 200,
          }}
        >
          {!customMode ? (
            <>
              {PRESETS.map(({ key, Icon, labelKey }) => (
                <PresetItem
                  key={key}
                  Icon={Icon}
                  label={tr(labelKey)}
                  active={viewport === key}
                  onSelect={() => onChange(key)}
                />
              ))}
              <DropdownMenu.Item
                onSelect={(e) => { e.preventDefault(); setCustomMode(true); }}
                style={itemStyle(t)}
                onMouseEnter={hoverIn(t)}
                onMouseLeave={hoverOut(t)}
              >
                <span style={{ width: 14, flexShrink: 0 }}/>
                <span style={{ flex: 1, fontSize: 13, color: t.text0 }}>{tr('browser.viewport.custom')}</span>
                {viewport === 'custom' && <Check size={13} color={t.accent}/>}
              </DropdownMenu.Item>
              {dim && (
                <>
                  <DropdownMenu.Separator style={{ height: 1, background: t.glassBorder, margin: '4px 0' }}/>
                  <DropdownMenu.Item
                    onSelect={(e) => { e.preventDefault(); onRotate(); setOpen(false); }}
                    style={itemStyle(t)}
                    onMouseEnter={hoverIn(t)}
                    onMouseLeave={hoverOut(t)}
                  >
                    <RotateCcw size={13} color={t.text2}/>
                    <span style={{ flex: 1, fontSize: 13, color: t.text0 }}>{tr('browser.viewport.rotate')}</span>
                  </DropdownMenu.Item>
                </>
              )}
            </>
          ) : (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
              <CustomField
                label={tr('browser.viewport.custom_width')}
                value={draftW}
                min={320} max={2560}
                onChange={setDraftW}
              />
              <CustomField
                label={tr('browser.viewport.custom_height')}
                value={draftH}
                min={320} max={2160}
                onChange={setDraftH}
              />
              <button
                type="button"
                onClick={() => {
                  onChange('custom', { width: draftW, height: draftH });
                  setOpen(false);
                  setCustomMode(false);
                }}
                style={{
                  padding: '6px 10px', borderRadius: t.r2, border: 0,
                  background: t.accent, color: t.accentOn,
                  cursor: 'pointer', fontSize: 12, fontFamily: t.fontSans, fontWeight: 500,
                }}
              >
                {tr('browser.viewport.custom_apply')}
              </button>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function PresetItem({ Icon, label, active, onSelect }: {
  Icon: typeof Monitor;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTokens();
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      style={itemStyle(t)}
      onMouseEnter={hoverIn(t)}
      onMouseLeave={hoverOut(t)}
    >
      <Icon size={13} color={active ? t.accent : t.text2}/>
      <span style={{ flex: 1, fontSize: 13, color: t.text0 }}>{label}</span>
      {active && <Check size={13} color={t.accent}/>}
    </DropdownMenu.Item>
  );
}

function CustomField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number;
  onChange: (n: number) => void;
}) {
  const t = useTokens();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.text1, fontFamily: t.fontSans }}>
      <span style={{ width: 56 }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        style={{
          flex: 1, padding: '4px 8px', borderRadius: t.r2,
          background: t.bg1, color: t.text0, border: `1px solid ${t.glassBorder}`,
          fontFamily: t.fontMono, fontSize: 12, outline: 'none',
        }}
      />
    </label>
  );
}

function itemStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 10px', borderRadius: t.r2,
    outline: 'none', cursor: 'pointer',
    fontFamily: t.fontSans,
  };
}

function hoverIn(t: ReturnType<typeof useTokens>) {
  return (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = `color-mix(in oklch, ${t.accent} 14%, transparent)`;
  };
}

function hoverOut(_t: ReturnType<typeof useTokens>) {
  return (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'transparent';
  };
}
