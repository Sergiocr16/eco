import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Monitor, Tablet, Smartphone, Check, RotateCcw, ChevronRight, ChevronDown } from 'lucide-react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { useIsPhone } from '@/hooks/useMediaQuery';
import { cx } from '@/design/primitives';
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
          className={cx('eco-btn eco-btn--sm', viewport === 'desktop' ? 'eco-btn--raised' : 'eco-chip--accent')}
          style={{ fontSize: 12.5, fontWeight: 400 }}
        >
          <TriggerIcon size={14}/>
          <span>{label}</span>
          <ChevronDown size={12} color={t.text3}/>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="eco-menu" style={{ minWidth: 210, zIndex: 200, maxHeight: 'var(--radix-dropdown-menu-content-available-height)', overflowY: 'auto' }}>
          {!customMode ? (
            <>
              <PresetItem Icon={Monitor} label={tr('browser.viewport.desktop')}
                active={viewport === 'desktop'} onSelect={() => pick('desktop')}/>
              {DEVICE_FAMILIES.map((f) => (
                <FamilyMenu key={f} family={f} label={tr(`browser.viewport.${f}`)} selection={selection} onChange={onChange}/>
              ))}
              <DropdownMenu.Item
                onSelect={(e) => { e.preventDefault(); setCustomMode(true); }}
                className="eco-menu__item" style={ITEM}
              >
                <span style={{ width: 14, flexShrink: 0 }}/>
                <span className="eco-grow">{tr('browser.viewport.custom')}</span>
                {viewport === 'custom' && <Check size={13} color={t.accent}/>}
              </DropdownMenu.Item>
              {spec && (
                <>
                  <DropdownMenu.Separator className="eco-menu__sep"/>
                  <DropdownMenu.Item
                    onSelect={(e) => { e.preventDefault(); onChange({ rotated: !selection.rotated }); setOpen(false); }}
                    className="eco-menu__item" style={ITEM}
                  >
                    <RotateCcw size={13} color={t.text2}/>
                    <span className="eco-grow">{tr('browser.viewport.rotate')}</span>
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
                className="eco-btn eco-btn--sm eco-btn--primary eco-btn--block"
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
  // En el teléfono no hay ancho para un submenú lateral: se despliega en línea.
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = useState(active);
  const body = (
    <>
          <GroupLabel>{tr('browser.device.model')}</GroupLabel>
          {DEVICE_MODELS[family].map((m) => (
            <DropdownMenu.Item key={m.id} onSelect={() => enter({ deviceModel: m.id })}
              className="eco-menu__item" style={ITEM}>
              <span className="eco-grow">{m.name}</span>
              <span className="eco-num">{m.width}×{m.height}</span>
              <span style={{ width: 13, display: 'inline-flex' }}>
                {active && model.id === m.id && <Check size={13} color={t.accent}/>}
              </span>
            </DropdownMenu.Item>
          ))}
          {isAndroidFamily(family) && (
            <>
              <DropdownMenu.Separator className="eco-menu__sep"/>
              <GroupLabel>{tr('browser.device.nav')}</GroupLabel>
              {[false, true].map((withButtons) => (
                <DropdownMenu.Item key={String(withButtons)}
                  onSelect={() => enter({ viewport: familyPreset(family, withButtons) })}
                  className="eco-menu__item" style={ITEM}>
                  <span className="eco-grow">
                    {tr(withButtons ? 'browser.device.nav.buttons' : 'browser.device.nav.gestures')}
                  </span>
                  {active && buttons === withButtons && <Check size={13} color={t.accent}/>}
                </DropdownMenu.Item>
              ))}
            </>
          )}
          <DropdownMenu.Separator className="eco-menu__sep"/>
          <GroupLabel>{tr('browser.device.color')}</GroupLabel>
          {DEVICE_COLORS[family].map((c) => (
            <DropdownMenu.Item key={c.id}
              onSelect={(e) => { e.preventDefault(); enter({ frameColor: c.id }); }}
              className="eco-menu__item" style={ITEM}>
              <span style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
                background: c.hex, border: `1px solid ${t.line2}`,
              }}/>
              <span className="eco-grow">{tr(c.labelKey)}</span>
              {active && color.id === c.id && <Check size={13} color={t.accent}/>}
            </DropdownMenu.Item>
          ))}
    </>
  );
  return (
    isPhone ? (
      <>
        <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); setExpanded((v) => !v); }}
          className="eco-menu__item" style={ITEM}>
          <FamilyIcon size={13} color={active ? t.accent : t.text2}/>
          <span className="eco-grow">{label}</span>
          {active && <Check size={13} color={t.accent}/>}
          {expanded ? <ChevronDown size={13} color={t.text3}/> : <ChevronRight size={13} color={t.text3}/>}
        </DropdownMenu.Item>
        {expanded && <div className="eco-menu__sub" style={{ maxHeight: 'none' }}>{body}</div>}
      </>
    ) : (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="eco-menu__item" style={ITEM}>
        <FamilyIcon size={13} color={active ? t.accent : t.text2}/>
        <span className="eco-grow">{label}</span>
        {active && <Check size={13} color={t.accent}/>}
        <ChevronRight size={13} color={t.text3}/>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={6} className="eco-menu" style={{ minWidth: 250, zIndex: 200 }}>
          {body}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
    )
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="eco-sub" style={{ padding: '8px 10px 4px', fontSize: 11.5 }}>{children}</div>;
}

// Radix marca el ítem resaltado con foco, no con :hover.
const ITEM: React.CSSProperties = { outline: 'none' };

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
      className="eco-menu__item" style={ITEM}
    >
      <Icon size={13} color={active ? t.accent : t.text2}/>
      <span className="eco-grow">{label}</span>
      {active && <Check size={13} color={t.accent}/>}
    </DropdownMenu.Item>
  );
}

function CustomField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="eco-hstack eco-field-label" style={{ gap: 8 }}>
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
        className="eco-field eco-field--sm eco-field--mono"
        style={{ flex: 1, width: 'auto', minWidth: 0 }}
      />
    </label>
  );
}
