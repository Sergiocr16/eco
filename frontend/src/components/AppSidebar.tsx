import { useTokens } from '@/design/theme';
import { EcoMarkStacked } from '@/design/EcoMark';
import {
  IconCommand, IconFolderOpen, IconGrid, IconArchive, IconSettings, IconShield, type IconProps,
} from '@/design/icons';
import { useT } from '@/hooks/useI18n';
import { useIsPhone } from '@/hooks/useMediaQuery';
import { SAFE_BOTTOM } from '@/lib/platform';
import { AccountMenu } from './AccountMenu';

export type Screen = 'dashboard' | 'folders' | 'files' | 'archived' | 'settings' | 'admin' | 'detail' | 'login' | 'onboarding';

// Alto de la barra inferior en móvil: 4 + 40 (botón) + 4, más el inset del
// indicador de home capado. App.tsx reserva exactamente esto como padding del
// contenido, ya que la barra va `position: fixed` y sale del flujo.
export const MOBILE_NAV_HEIGHT = `calc(48px + min(${SAFE_BOTTOM}, 14px))`;

type Props = {
  screen: Screen;
  onScreenChange: (s: Screen) => void;
  agentCount: number;
  username: string | null;
  role: 'admin' | 'member' | null;
  onLock: () => void;
  onSignOut: () => void;
  onChangePassword: (current: string, next: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const BASE_ITEMS: { id: Screen; icon: (p: IconProps) => JSX.Element; labelKey: string }[] = [
  { id: 'dashboard', icon: IconCommand, labelKey: 'nav.dashboard' },
  { id: 'folders',   icon: IconGrid, labelKey: 'nav.folders' },
  { id: 'files',     icon: IconFolderOpen, labelKey: 'nav.files' },
  { id: 'archived',  icon: IconArchive, labelKey: 'nav.archived' },
  { id: 'settings',  icon: IconSettings, labelKey: 'nav.settings' },
];
const ADMIN_ITEM = { id: 'admin' as Screen, icon: IconShield, labelKey: 'nav.admin' };

export function AppSidebar({
  screen, onScreenChange, agentCount, username, role, onLock, onSignOut, onChangePassword,
}: Props) {
  const t = useTokens();
  const tr = useT();
  const isPhone = useIsPhone();
  const ITEMS = role === 'admin' ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;

  // Móvil: el mismo rail se acuesta como barra inferior. Mismos ítems, mismos
  // props — solo cambia la orientación y el ancla del indicador de activo.
  return (
    <div style={{
      flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 4,
      overflow: 'visible',
      ...(isPhone ? {
        // `fixed` al borde real de la pantalla, fuera del flujo del shell.
        // Anclarla al flex del shell la dejaba flotando sobre una franja gris
        // de ~60px que no correspondía a ningún padding: así, haya lo que
        // haya debajo, la barra se apoya en el fondo del viewport.
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-around',
        borderTop: `1px solid ${t.glassBorder}`,
        background: t.windowBg,
        // El inset completo de iOS (34px) es más aire del que necesita el
        // indicador de home, que mide ~5px y vive a ~8px del borde.
        padding: `4px 6px calc(4px + min(${SAFE_BOTTOM}, 14px))`,
      } : {
        width: 64,
        flexDirection: 'column',
        borderRight: `1px solid ${t.glassBorder}`,
        padding: '14px 0 16px',
        background: 'transparent',
      }),
    }}>
      {!isPhone && (
        <div style={{ marginBottom: 10, color: 'currentColor' }}>
          <EcoMarkStacked size={32}/>
        </div>
      )}
      {ITEMS.map((it) => {
        const active = screen === it.id || (it.id === 'dashboard' && screen === 'detail');
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onScreenChange(it.id)}
            title={tr(it.labelKey)}
            style={{
              width: 44, height: isPhone ? 40 : 44, borderRadius: 12, border: 0, cursor: 'pointer',
              background: active ? t.bg3 : 'transparent',
              color: active ? t.accent : t.text2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', transition: 'all 140ms',
            }}
          >
            {active && (
              <span style={{
                position: 'absolute', borderRadius: 999, background: t.accent,
                ...(isPhone
                  ? { top: -6, left: '50%', transform: 'translateX(-50%)', height: 3, width: 20 }
                  : { left: -8, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20 }),
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

      {!isPhone && <div style={{ flex: 1 }}/>}

      <AccountMenu
        username={username}
        onLock={onLock}
        onSignOut={onSignOut}
        onChangePassword={onChangePassword}
      />
    </div>
  );
}
