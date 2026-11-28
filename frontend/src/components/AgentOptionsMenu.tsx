import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconEdit, IconTrash, IconCheck, IconX } from '@/design/icons';
import { useT } from '@/hooks/useI18n';
import { useCategories } from '@/hooks/useCategories';
import { cssZoom } from '@/lib/ui-zoom';

/** Menú flotante anclado a un elemento. Se cierra con clic afuera o Escape. */
export function PopoverMenu({ anchor, onClose, children, align = 'end', minWidth = 200 }: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  minWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden', top: 0, left: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!anchor || !el) return;
    const z = cssZoom();
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = align === 'end' ? r.right / z - w : r.left / z;
    left = Math.max(8, Math.min(left, vw - w - 8));
    let top = r.bottom / z + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top / z - h - 6);
    setPos({ top, left });
  }, [anchor, align]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} role="menu" className="eco-menu" onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', zIndex: 400, minWidth, maxHeight: '70vh', overflowY: 'auto', ...pos }}>
      {children}
    </div>,
    document.body,
  );
}

/** Acciones de un agente: renombrar, categorías y cerrar. */
export function AgentOptionsMenu({ anchor, onClose, onRename, onRemove, categoryIds, onToggleCategory }: {
  anchor: HTMLElement | null;
  onClose: () => void;
  onRename: () => void;
  onRemove: () => void;
  categoryIds?: string[];
  onToggleCategory: (categoryId: string | undefined) => void;
}) {
  const tr = useT();
  const { categories } = useCategories();
  return (
    <PopoverMenu anchor={anchor} onClose={onClose}>
      <button type="button" role="menuitem" className="eco-menu__item" onClick={() => { onClose(); onRename(); }}>
        <IconEdit size={15}/> {tr('menu.rename')}
      </button>
      {categories.length > 0 && (
        <>
          <div className="eco-menu__sep"/>
          <div className="eco-eyebrow eco-eyebrow--sm eco-menu__label">{tr('dash.category.label')}</div>
          {categories.map((c) => {
            const on = categoryIds?.includes(c.id) ?? false;
            return (
              <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={on}
                className="eco-menu__item" onClick={() => onToggleCategory(c.id)}>
                <span className="eco-dot eco-dot--lg" style={{ background: c.color, margin: '0 3px' }}/>
                <span className="eco-truncate eco-grow">{c.name}</span>
                {on && <IconCheck size={14}/>}
              </button>
            );
          })}
          {(categoryIds?.length ?? 0) > 0 && (
            <button type="button" role="menuitem" className="eco-menu__item" onClick={() => onToggleCategory(undefined)}>
              <IconX size={15}/> <span className="eco-muted">{tr('dash.category.none')}</span>
            </button>
          )}
        </>
      )}
      <div className="eco-menu__sep"/>
      <button type="button" role="menuitem" className="eco-menu__item eco-menu__item--danger"
        onClick={() => { onClose(); onRemove(); }}>
        <IconTrash size={15}/> {tr('menu.close_bubble')}
      </button>
    </PopoverMenu>
  );
}
