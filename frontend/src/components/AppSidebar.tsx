import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { EcoMark } from '@/design/EcoMark';
import {
  IconCommand, IconFolderOpen, IconHistory, IconSettings, IconGlobe, type IconProps,
} from '@/design/icons';
import { useT } from '@/hooks/useI18n';
import { AccountMenu } from './AccountMenu';
import { BubbleDock } from './BubbleDock';
import type { Bubble } from '@/lib/types';

export type Screen = 'dashboard' | 'files' | 'history' | 'settings' | 'detail' | 'login' | 'onboarding' | 'browser';

const DOCK_PREF_KEY = 'eco.dock.enabled';
const DOCK_EVENT = 'eco:dock-pref-change';

function readDockPref(): boolean {
  try { return window.localStorage.getItem(DOCK_PREF_KEY) !== '0'; } catch { return true; }
}

type Props = {
  screen: Screen;
  onScreenChange: (s: Screen) => void;
  agentCount: number;
  username: string | null;
  onLock: () => void;
  onDestroyUser: (pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  bubbles: Bubble[];
  activeBubbleId: string | null;
  onOpenAgent: (id: string) => void;
};

const ITEMS: { id: Screen; icon: (p: IconProps) => JSX.Element; labelKey: string }[] = [
  { id: 'dashboard', icon: IconCommand, labelKey: 'nav.dashboard' },
  { id: 'files',     icon: IconFolderOpen, labelKey: 'nav.files' },
  { id: 'browser',   icon: IconGlobe, labelKey: 'nav.browser' },
  { id: 'history',   icon: IconHistory, labelKey: 'nav.history' },
  { id: 'settings',  icon: IconSettings, labelKey: 'nav.settings' },
];

export function AppSidebar({
  screen, onScreenChange, agentCount, username, onLock, onDestroyUser,
  bubbles, activeBubbleId, onOpenAgent,
}: Props) {
  const t = useTokens();
  const tr = useT();
  const [dockEnabled, setDockEnabled] = useState<boolean>(() => readDockPref());

  useEffect(() => {
    const sync = () => setDockEnabled(readDockPref());
    window.addEventListener('storage', sync);
    window.addEventListener(DOCK_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(DOCK_EVENT, sync);
    };
  }, []);

  return (
    <div style={{
      width: 64, flexShrink: 0,
      borderRight: `1px solid ${t.glassBorder}`,
      padding: '14px 0 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      background: 'transparent',
      overflow: 'visible',
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

      {/* Separador entre nav y dock */}
      {dockEnabled && bubbles.length > 0 && (
        <div style={{
          width: 28, height: 1, background: t.glassBorder,
          margin: '8px 0 4px',
        }}/>
      )}

      {/* Dock estilo macOS. overflow visible para que el zoom no produzca scrollbar.
          Scroll y solo si HAY MUCHAS burbujas (overflow-y auto en un wrapper hijo). */}
      <div style={{
        width: '100%', minHeight: 0,
        overflow: 'visible',
        flex: dockEnabled && bubbles.length > 0 ? '1 1 auto' : '0 0 auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {dockEnabled && (
          <div style={{
            flex: 1, minHeight: 0,
            // Solo permitimos scroll vertical cuando el contenido excede; jamás horizontal.
            overflowY: 'auto', overflowX: 'visible',
            // Truco: padding lateral negativo permite que el zoom se "escape" del clip
            // del scroll vertical sin que la X aparezca.
            paddingRight: 0,
          }}>
            <BubbleDock
              bubbles={bubbles}
              activeBubbleId={activeBubbleId}
              onOpenAgent={onOpenAgent}
            />
          </div>
        )}
      </div>

      {/* Solo agregamos spacer si NO hay dock activo, para mantener el avatar pegado abajo. */}
      {(!dockEnabled || bubbles.length === 0) && <div style={{ flex: 1 }}/>}

      <AccountMenu
        username={username}
        onLock={onLock}
        onDestroyUser={onDestroyUser}
      />
    </div>
  );
}
