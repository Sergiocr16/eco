import { useT } from '@/hooks/useI18n';
import { IconGlobe, IconX, IconPlus } from '@/design/icons';
import { cx } from '@/design/primitives';
import { isMobileNow } from '@/hooks/useMediaQuery';
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
  const tr = useT();

  return (
    <div className="eco-noscrollbar" style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: isMobileNow() ? '8px 8px 2px' : '12px 14px 2px',
      overflow: 'auto',
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
            className="eco-iconbtn"
          >
            <IconPlus size={14}/>
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
  const displayTitle = tab.title || hostnameOf(tab.url) || tr('browser.tab.untitled');
  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={onActivate}
      onAuxClick={(e) => { if (e.button === 1) onClose(); }}  // middle-click cierra
      title={tab.url || displayTitle}
      className={cx('eco-subtab', active && 'is-on')}
      style={{
        gap: 8, height: 32, padding: '0 6px 0 12px', borderRadius: 16,
        minWidth: 100, maxWidth: 220,
        userSelect: 'none',
      }}
    >
      <IconGlobe size={13} style={{ flexShrink: 0 }}/>
      <span className="eco-truncate" style={{ flex: 1 }}>{displayTitle}</span>
      {tab.isolated && (
        <span
          title={tr('browser.tab.isolated_badge_tooltip')}
          className="eco-chip eco-chip--warn eco-mono"
          style={{ padding: '0 6px', borderRadius: 6, fontSize: 10.5, fontWeight: 600 }}
        >iso</span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label={tr('browser.tab.close')}
        title={tr('browser.tab.close')}
        className="eco-iconbtn eco-iconbtn--danger"
        style={{ width: 22, height: 22 }}
      >
        <IconX size={12}/>
      </button>
    </div>
  );
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}
