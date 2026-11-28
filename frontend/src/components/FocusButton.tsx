import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconLeaf, IconSearch, IconX } from '@/design/icons';
import { cx } from '@/design/primitives';
import { useT } from '@/hooks/useI18n';
import { useCategories } from '@/hooks/useCategories';
import { useDashboardFocus } from '@/hooks/useDashboardFocus';
import { cssZoom, dvh } from '@/lib/ui-zoom';

// Modo focus: filtra por categoría la lista del menú, el inicio y el dock.
export function FocusButton({ className, autoFocusSearch = true }: {
  className?: string;
  // En el teléfono no se enfoca el buscador al abrir: el teclado taparía la lista.
  autoFocusSearch?: boolean;
}) {
  const tr = useT();
  const { categories } = useCategories();
  const { activeFocus, setFocus } = useDashboardFocus();
  const btnRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!pos) { setQ(''); return; }
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (boxRef.current?.contains(n) || btnRef.current?.contains(n)) return;
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [pos]);
  if (categories.length === 0) return null;
  const shown = categories.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const on = activeFocus.length > 0;
  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const z = cssZoom();
    // El menú mide ~250px: que no se salga por la derecha en pantallas angostas.
    const left = Math.max(8, Math.min(r.left / z, window.innerWidth / z - 258));
    setPos({ left, top: r.bottom / z + 6 });
  };
  // Borde del botón: un tramo por cada categoría elegida, en su color.
  const colors = categories.filter((c) => activeFocus.includes(c.id)).map((c) => c.color);
  const stops = colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(', ');
  const ring = colors.length === 0 ? undefined
    : colors.length === 1 ? colors[0]
    : `conic-gradient(from -90deg, ${stops})`;
  const flip = (id: string) =>
    setFocus(activeFocus.includes(id) ? activeFocus.filter((x) => x !== id) : [...activeFocus, id]);
  return (<>
    <button ref={btnRef} type="button" title={tr('graph.focus.title')} aria-label={tr('graph.focus.title')}
      aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}
      className={cx('eco-focusbtn', on && 'is-on', className)}>
      {ring && <span aria-hidden className="eco-focusbtn__ring" style={{ background: ring }}/>}
      <IconLeaf size={16}/>
      {on && <span className="eco-focusbtn__n">{activeFocus.length}</span>}
    </button>
    {pos && createPortal(
      <div ref={boxRef} role="menu" className="eco-menu eco-mininav" style={{ ...pos, width: 250, maxHeight: dvh(60), overflow: 'auto' }}>
        <div className="eco-focusmenu__title"><IconLeaf size={17}/>{tr('graph.focus.label')}</div>
        <label className="eco-inputbar eco-inputbar--sm" style={{ flex: 'none', margin: '0 0 6px', background: 'var(--hover)' }}>
          <IconSearch size={14}/>
          <input autoFocus={autoFocusSearch} className="eco-input-bare" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={tr('nav.focus.search')} aria-label={tr('nav.focus.search')}/>
        </label>
        {shown.length === 0 && <div className="eco-minisearch__empty">{tr('nav.focus.no_match')}</div>}
        {shown.map((c) => {
          const sel = activeFocus.includes(c.id);
          return (
            <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={sel}
              className={cx('eco-menu__item', sel && 'is-on')} onClick={() => flip(c.id)}>
              <span className="eco-dot eco-dot--lg" style={{ background: c.color }}/>
              <span className="eco-truncate eco-grow">{c.name}</span>
              {sel && <IconCheck size={14}/>}
            </button>
          );
        })}
        {on && (<>
          <div className="eco-menu__sep"/>
          <button type="button" role="menuitem" className="eco-menu__item" onClick={() => { setFocus([]); setPos(null); }}>
            <IconX size={14}/>
            <span className="eco-grow">{tr('graph.focus.clear')}</span>
          </button>
        </>)}
      </div>,
      document.body,
    )}
  </>);
}
