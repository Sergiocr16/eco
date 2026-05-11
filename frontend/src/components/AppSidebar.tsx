import { useTokens } from '@/design/theme';
import { EcoMark } from '@/design/EcoMark';
import {
  IconCommand, IconFolderOpen, IconHistory, IconSettings, type IconProps,
} from '@/design/icons';

export type Screen = 'dashboard' | 'files' | 'history' | 'settings' | 'detail' | 'login' | 'onboarding';

type Props = {
  screen: Screen;
  onScreenChange: (s: Screen) => void;
  agentCount: number;
};

const ITEMS: { id: Screen; icon: (p: IconProps) => JSX.Element; label: string }[] = [
  { id: 'dashboard', icon: IconCommand, label: 'Inicio' },
  { id: 'files',     icon: IconFolderOpen, label: 'Archivos' },
  { id: 'history',   icon: IconHistory, label: 'Historial' },
  { id: 'settings',  icon: IconSettings, label: 'Ajustes' },
];

export function AppSidebar({ screen, onScreenChange, agentCount }: Props) {
  const t = useTokens();
  return (
    <div style={{
      width: 64, flexShrink: 0,
      borderRight: `1px solid ${t.glassBorder}`,
      padding: '14px 0 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      background: 'transparent',
    }}>
      <div style={{ marginBottom: 10 }}>
        <EcoMark size={32}/>
      </div>
      {ITEMS.map((it) => {
        const active = screen === it.id || (it.id === 'dashboard' && screen === 'detail');
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onScreenChange(it.id)}
            title={it.label}
            style={{
              width: 44, height: 44, borderRadius: 12, border: 0, cursor: 'pointer',
              background: active ? t.bg3 : 'transparent',
              color: active ? t.accent : t.text2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', transition: 'all 140ms',
            }}
          >
            {active && (
              <span style={{
                position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)',
                width: 3, height: 20, borderRadius: 999, background: t.accent,
              }}/>
            )}
            <it.icon size={19}/>
            {it.id === 'dashboard' && agentCount > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: 6,
                minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
                background: t.accent, color: t.accentOn,
                fontSize: 10, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{agentCount}</span>
            )}
          </button>
        );
      })}

      <div style={{ flex: 1 }}/>

      <button
        type="button"
        title="Cuenta"
        style={{
          width: 36, height: 36, borderRadius: '50%', border: 0, cursor: 'pointer',
          background: t.bg3,
          color: t.text0, fontWeight: 500, fontSize: 13,
        }}>A</button>
    </div>
  );
}
