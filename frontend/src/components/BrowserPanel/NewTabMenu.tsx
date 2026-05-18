import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import type { ReactNode } from 'react';
import type { NewTabMode } from './types';

type Props = {
  trigger: ReactNode;
  onPick: (mode: NewTabMode) => void;
};

export function NewTabMenu({ trigger, onPick }: Props) {
  const t = useTokens();
  const tr = useT();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          style={{
            minWidth: 260,
            background: t.windowBg,
            border: `1px solid ${t.glassBorder}`,
            borderRadius: t.r2,
            boxShadow: t.shadowLg,
            padding: 4,
            zIndex: 200,
          }}
        >
          <MenuItem
            title={tr('browser.tab.new_shared')}
            desc={tr('browser.tab.new_shared_desc')}
            onSelect={() => onPick('shared')}
          />
          <DropdownMenu.Separator style={{ height: 1, background: t.glassBorder, margin: '4px 0' }}/>
          <MenuItem
            title={tr('browser.tab.new_isolated')}
            desc={tr('browser.tab.new_isolated_desc')}
            onSelect={() => onPick('isolated')}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({ title, desc, onSelect }: { title: string; desc: string; onSelect: () => void }) {
  const t = useTokens();
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      style={{
        padding: '8px 10px',
        borderRadius: t.r2,
        outline: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontFamily: t.fontSans,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in oklch, ${t.accent} 14%, transparent)`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ fontSize: 13, color: t.text0, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 11, color: t.text2, lineHeight: 1.4 }}>{desc}</div>
    </DropdownMenu.Item>
  );
}
