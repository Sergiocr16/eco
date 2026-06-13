import { useTokens } from '@/design/theme';
import { EcoMarkStacked } from '@/design/EcoMark';
import {
  IconCommand, IconFolderOpen, IconHistory, IconArchive, IconSettings, IconShield, type IconProps,
} from '@/design/icons';
import { useT } from '@/hooks/useI18n';
import { AccountMenu } from './AccountMenu';

export type Screen = 'dashboard' | 'files' | 'history' | 'archived' | 'settings' | 'admin' | 'detail' | 'login' | 'onboarding';

type Props = {
  screen: Screen;
  onScreenChange: (s: Screen) => void;
  agentCount: number;
  username: string | null;
  role: 'admin' | 'member' | null;
  onLock: () => void;
  onDestroyUser: (pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const BASE_ITEMS: { id: Screen; icon: (p: IconProps) => JSX.Element; labelKey: string }[] = [
  { id: 'dashboard', icon: IconCommand, labelKey: 'nav.dashboard' },
  { id: 'files',     icon: IconFolderOpen, labelKey: 'nav.files' },
  { id: 'history',   icon: IconHistory, labelKey: 'nav.history' },
  { id: 'archived',  icon: IconArchive, labelKey: 'nav.archived' },
  { id: 'settings',  icon: IconSettings, labelKey: 'nav.settings' },
];
const ADMIN_ITEM = { id: 'admin' as Screen, icon: IconShield, labelKey: 'nav.admin' };

export function AppSidebar({
  screen, onScreenChange, agentCount, username, role, onLock, onDestroyUser,
}: Props) {
  const t = useTokens();
  const tr = useT();
  const ITEMS = role === 'admin' ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;

  return (
    <div style={{
      width: 64, flexShrink: 0,
      borderRight: `1px solid ${t.glassBorder}`,
      padding: '14px 0 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      background: 'transparent',
      overflow: 'visible',
    }}>
      <div style={{ marginBottom: 10, color: 'currentColor' }}>
        <EcoMarkStacked size={32}/>
      </div>
      {ITEMS.map((it) => {
        const active = screen === it.id || (it.id === 'dashboard' && screen === 'detail');
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onScreenChange(it.id)}
            title={tr(it.labelKey)}
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

      <AccountMenu
        username={username}
        onLock={onLock}
        onDestroyUser={onDestroyUser}
      />
    </div>
  );
}
