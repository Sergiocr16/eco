import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useT } from '@/hooks/useI18n';
import type { ReactNode } from 'react';
import type { NewTabMode } from './types';

type Props = {
  trigger: ReactNode;
  onPick: (mode: NewTabMode) => void;
};

export function NewTabMenu({ trigger, onPick }: Props) {
  const tr = useT();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="eco-menu"
          style={{ minWidth: 260, zIndex: 200 }}
        >
          <MenuItem
            title={tr('browser.tab.new_shared')}
            desc={tr('browser.tab.new_shared_desc')}
            onSelect={() => onPick('shared')}
          />
          <DropdownMenu.Separator className="eco-menu__sep"/>
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
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="eco-menu__item"
      style={{ height: 'auto', padding: '8px 10px', flexDirection: 'column', alignItems: 'stretch', gap: 2, outline: 'none' }}
    >
      <div className="eco-label">{title}</div>
      <div className="eco-sub">{desc}</div>
    </DropdownMenu.Item>
  );
}
