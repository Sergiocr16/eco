import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Monitor, Tablet, Smartphone, Check, RotateCcw, ChevronRight } from 'lucide-react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import {
  DEVICE_COLORS, DEVICE_FAMILIES, DEVICE_MODELS, deviceColor, deviceFamily, deviceModel, deviceSpec,
  familyPreset, isAndroidFamily, isTabletFamily, usesButtons,
  type BrowserTab, type DeviceFamily, type DeviceSelection,
} from './types';

type Props = {
  selection: DeviceSelection;
  disabled?: boolean;
  onChange: (patch: Partial<BrowserTab>) => void;
};

export function ViewportMenu({ selection, disabled, onChange }: Props) {
  const t = useTokens();
  const tr = useT();
  const { viewport, customViewport } = selection;
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draftW, setDraftW] = useState<number>(customViewport?.width ?? 1200);
  const [draftH, setDraftH] = useState<number>(customViewport?.height ?? 800);

  const family = deviceFamily(viewport);
  const spec = deviceSpec(selection);
  const TriggerIcon = !family ? Monitor : isTabletFamily(family) ? Tablet : Smartphone;
  const label = viewport === 'desktop' ? tr('browser.viewport.desktop')
    : spec?.name ?? (spec ? `${spec.width}×${spec.height}` : '');

  // Cambiar de preset endereza el dispositivo; modelo y color se conservan
  // (si son de otra familia caen al default de la nueva).
  const pick = (next: BrowserTab['viewport']) => onChange({ viewport: next, rotated: false });

  return (
    <DropdownMenu.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCustomMode(false); }}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={tr('browser.viewport.label')}
          aria-label={tr('browser.viewport.label')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 26, padding: '0 8px', border: 0, borderRadius: 6,
            background: viewport === 'desktop' ? t.bg2 : `color-mix(in oklch, ${t.accent} 18%, transparent)`,
            color: viewport === 'desktop' ? t.text1 : t.accent,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1,
            fontFamily: t.fontMono, fontSize: 11, whiteSpace: 'nowrap',
          }}
        >
          <TriggerIcon size={12}/>
          <span>{label}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} style={{ ...contentStyle(t), minWidth: 200 }}>
          {!customMode ? (
            <>
              <PresetItem Icon={Monitor} label={tr('browser.viewport.desktop')}
                active={viewport === 'desktop'} onSelect={() => pick('desktop')}/>
              {DEVICE_FAMILIES.map((f) => (
                <FamilyMenu key={f} family={f} label={tr(`browser.viewport.${f}`)} selection={selection} onChange={onChange}/>
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
              {spec && (
                <>
                  <DropdownMenu.Separator style={{ height: 1, background: t.glassBorder, margin: '4px 0' }}/>
                  <DropdownMenu.Item
                    onSelect={(e) => { e.preventDefault(); onChange({ rotated: !selection.rotated }); setOpen(false); }}
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
                  onChange({ viewport: 'custom', customViewport: { width: draftW, height: draftH }, rotated: false });
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

// Submenú de una familia de dispositivos: modelo, navegación (solo Android) y
// color del canto. Elegir modelo o navegación activa la familia; el color se
// puede cambiar sin cerrar el menú.
function FamilyMenu({ family, label, selection, onChange }: {
  family: DeviceFamily;
  label: string;
  selection: DeviceSelection;
  onChange: (patch: Partial<BrowserTab>) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const active = deviceFamily(selection.viewport) === family;
  const model = deviceModel(family, selection.deviceModel);
  const color = deviceColor(family, selection.frameColor);
  // Preset con el que se entra a la familia: en Android conserva el modo de
  // navegación ya elegido.
  const buttons = usesButtons(selection.viewport);
  const preset = familyPreset(family, buttons);
  const FamilyIcon = isTabletFamily(family) ? Tablet : Smartphone;
  const enter = (patch: Partial<BrowserTab>) => onChange({
    viewport: preset,
    rotated: active ? selection.rotated : false,
    // Al venir de la otra familia su color no existe acá: se fija el default.
    frameColor: color.id,
    deviceModel: model.id,
    ...patch,
  });
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger style={itemStyle(t)} onMouseEnter={hoverIn(t)} onMouseLeave={hoverOut(t)}>
        <FamilyIcon size={13} color={active ? t.accent : t.text2}/>
        <span style={{ flex: 1, fontSize: 13, color: t.text0 }}>{label}</span>
        {active && <Check size={13} color={t.accent}/>}
        <ChevronRight size={13} color={t.text3}/>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={6} style={{ ...contentStyle(t), minWidth: 210 }}>
          <GroupLabel>{tr('browser.device.model')}</GroupLabel>
          {DEVICE_MODELS[family].map((m) => (
            <DropdownMenu.Item key={m.id} onSelect={() => enter({ deviceModel: m.id })}
              style={itemStyle(t)} onMouseEnter={hoverIn(t)} onMouseLeave={hoverOut(t)}>
              <span style={{ flex: 1, fontSize: 13, color: t.text0 }}>{m.name}</span>
              <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.text3 }}>{m.width}×{m.height}</span>
              <span style={{ width: 13, display: 'inline-flex' }}>
                {active && model.id === m.id && <Check size={13} color={t.accent}/>}
              </span>
            </DropdownMenu.Item>
          ))}
          {isAndroidFamily(family) && (
            <>
              <DropdownMenu.Separator style={{ height: 1, background: t.glassBorder, margin: '4px 0' }}/>
              <GroupLabel>{tr('browser.device.nav')}</GroupLabel>
              {[false, true].map((withButtons) => (
                <DropdownMenu.Item key={String(withButtons)}
                  onSelect={() => enter({ viewport: familyPreset(family, withButtons) })}
                  style={itemStyle(t)} onMouseEnter={hoverIn(t)} onMouseLeave={hoverOut(t)}>
                  <span style={{ flex: 1, fontSize: 13, color: t.text0 }}>
                    {tr(withButtons ? 'browser.device.nav.buttons' : 'browser.device.nav.gestures')}
                  </span>
                  {active && buttons === withButtons && <Check size={13} color={t.accent}/>}
                </DropdownMenu.Item>
              ))}
            </>
          )}
          <DropdownMenu.Separator style={{ height: 1, background: t.glassBorder, margin: '4px 0' }}/>
          <GroupLabel>{tr('browser.device.color')}</GroupLabel>
          {DEVICE_COLORS[family].map((c) => (
            <DropdownMenu.Item key={c.id}
              onSelect={(e) => { e.preventDefault(); enter({ frameColor: c.id }); }}
              style={itemStyle(t)} onMouseEnter={hoverIn(t)} onMouseLeave={hoverOut(t)}>
              <span style={{
                width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
                background: c.hex, boxShadow: `0 0 0 1px ${t.glassBorderHi}`,
              }}/>
              <span style={{ flex: 1, fontSize: 13, color: t.text0 }}>{tr(c.labelKey)}</span>
              {active && color.id === c.id && <Check size={13} color={t.accent}/>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      padding: '4px 10px 2px', fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
      color: t.text3,
    }}>{children}</div>
  );
}

function contentStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    background: t.windowBg,
    border: `1px solid ${t.glassBorder}`,
    borderRadius: t.r2,
    boxShadow: t.shadowLg,
    padding: 4,
    zIndex: 200,
  };
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
