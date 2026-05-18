import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { IconGlobe, IconX } from '@/design/icons';
import { NewTabMenu } from './NewTabMenu';
import type { BrowserTab, NewTabMode } from './types';

type Props = {
  tabs: BrowserTab[];
  activeTabId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: (mode: NewTabMode) => void;
};

export function BrowserTabBar({ tabs, activeTabId, onActivate, onClose, onNewTab }: Props) {
  const t = useTokens();
  const tr = useT();

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderBottom: `1px solid ${t.glassBorder}`,
      background: t.bg0,
      overflow: 'auto',
      minHeight: 34,
      flexShrink: 0,
    }}>
      {tabs.map((tab) => (
        <TabPill
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          onActivate={() => onActivate(tab.id)}
          onClose={() => onClose(tab.id)}
          tr={tr}
        />
      ))}
      <NewTabMenu
        trigger={
          <button
            type="button"
            title={tr('browser.tab.new')}
            aria-label={tr('browser.tab.new')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, margin: '0 6px',
              background: 'transparent', border: 0, color: t.text2,
              cursor: 'pointer', borderRadius: t.r2,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = t.bg3; e.currentTarget.style.color = t.text0; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.text2; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
          </button>
        }
        onPick={onNewTab}
      />
    </div>
  );
}

function TabPill({
  tab, active, onActivate, onClose, tr,
}: {
  tab: BrowserTab;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const t = useTokens();
  const displayTitle = tab.title || hostnameOf(tab.url) || tr('browser.tab.untitled');
  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={onActivate}
      onAuxClick={(e) => { if (e.button === 1) onClose(); }}  // middle-click cierra
      title={tab.url || displayTitle}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 8px 0 10px',
        height: '100%',
        minWidth: 100, maxWidth: 220,
        background: active ? t.bg2 : 'transparent',
        borderRight: `1px solid ${t.glassBorder}`,
        borderBottom: active ? `2px solid ${t.accent}` : '2px solid transparent',
        color: active ? t.text0 : t.text2,
        fontFamily: t.fontSans, fontSize: 12,
        cursor: 'pointer', flexShrink: 0,
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = t.bg1; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <IconGlobe size={11} style={{ flexShrink: 0, color: active ? t.accent : t.text3 }}/>
      <span style={{
        flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{displayTitle}</span>
      {tab.isolated && (
        <span
          title={tr('browser.tab.isolated_badge_tooltip')}
          style={{
            flexShrink: 0,
            padding: '1px 5px',
            borderRadius: 3,
            background: `color-mix(in oklch, ${t.warn} 20%, transparent)`,
            border: `1px solid ${t.warn}`,
            color: t.warn,
            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            fontFamily: t.fontMono,
          }}
        >ISO</span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label={tr('browser.tab.close')}
        title={tr('browser.tab.close')}
        style={{
          flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, marginLeft: 2,
          background: 'transparent', border: 0,
          color: t.text3, cursor: 'pointer', borderRadius: 4,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = t.bg3; e.currentTarget.style.color = t.err; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.text3; }}
      >
        <IconX size={10}/>
      </button>
    </div>
  );
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}
