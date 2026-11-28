import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { EcoGlyph } from '@/design/EcoMark';
import {
  IconOverview, IconFolderOpen, IconFileDiff, IconArchive, IconSettings, IconShield,
  IconSearch, IconX, IconMenu, IconCheck, IconLeaf, IconChevR, IconChevD, IconChevU, IconEllipsis, type IconProps,
} from '@/design/icons';
import { cx } from '@/design/primitives';
import { useT } from '@/hooks/useI18n';
import { useIsPhone } from '@/hooks/useMediaQuery';
import { useBusyBubbleIds } from '@/hooks/usePtyBusyNotifier';
import { getCategoryById, useCategories } from '@/hooks/useCategories';
import type { Bubble } from '@/lib/types';
import { SAFE_BOTTOM } from '@/lib/platform';
import { workspaceName } from '@/lib/workspace-name';
import { AccountMenu } from './AccountMenu';
import { AgentOptionsMenu } from './AgentOptionsMenu';

import { useBubbleChangeCountMap } from '@/hooks/useGitChanges';

import { createPortal } from 'react-dom';
import { useDashboardFocus } from '@/hooks/useDashboardFocus';
import { cssZoom } from '@/lib/ui-zoom';

export type Screen = 'dashboard' | 'folders' | 'files' | 'archived' | 'settings' | 'admin' | 'detail' | 'login' | 'onboarding';

// Alto de la barra inferior en móvil: 4 + 40 (botón) + 4, más el inset del
// indicador de home capado. App.tsx reserva exactamente esto como padding del
// contenido, ya que la barra va `position: fixed` y sale del flujo.
export const MOBILE_NAV_HEIGHT = `calc(48px + min(${SAFE_BOTTOM}, 14px))`;

export const SIDEBAR_WIDTH = 228;
export const SIDEBAR_WIDTH_MINI = 78;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 440;

type Props = {
  screen: Screen;
  onScreenChange: (s: Screen) => void;
  agentCount: number;
  username: string | null;
  role: 'admin' | 'member' | null;
  onLock: () => void;
  onSignOut: () => void;
  onChangePassword: (current: string, next: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  bubbles: Bubble[];
  /** Agente abierto en el detalle (se marca en la lista). */
  activeBubbleId: string | null;
  onOpenAgent: (id: string) => void;
  onRenameAgent: (id: string, title: string) => void;
  onRemoveAgent: (id: string) => void;
  onToggleCategory: (id: string, categoryId: string | undefined) => void;
  collapsed: boolean;
  /** Colapsada: muestra los mosaicos de agentes (cuando el dock está apagado). */
  showTiles: boolean;
};

type NavItem = { id: Screen; icon: (p: IconProps) => JSX.Element; labelKey: string };
const BASE_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: IconOverview,   labelKey: 'nav.dashboard' },
  { id: 'folders',   icon: IconFolderOpen, labelKey: 'nav.folders' },
  { id: 'files',     icon: IconFileDiff,   labelKey: 'nav.files' },
  { id: 'archived',  icon: IconArchive,    labelKey: 'nav.archived' },
  { id: 'settings',  icon: IconSettings,   labelKey: 'nav.settings' },
];
const ADMIN_ITEM: NavItem = { id: 'admin', icon: IconShield, labelKey: 'nav.admin' };

const NO_WORKSPACE = '';
const CLOSED_KEY = 'eco.sidebar.closed_groups';

function loadClosed(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CLOSED_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/** Sigla y número de un agente para su mosaico: "Hotfix TAR-1316" → HT / 1316. */
export function agentCode(title: string): { code: string; num: string } {
  const num = title.match(/\d{2,}/)?.[0] ?? '';
  const words = title.replace(/[A-Za-z]+-\d+/g, ' ').split(/[^\p{L}]+/u).filter(Boolean);
  const code = words.length >= 2
    ? (words[0]![0]! + words[1]![0]!).toUpperCase()
    : (words[0]?.slice(0, 1) ?? title.trim().slice(0, 1) ?? '·').toUpperCase() || '·';
  return { code, num };
}

type Group = { key: string; name: string; agents: Bubble[] };

// Orden de los proyectos elegido por el usuario (claves de workspace). Los que
// no están en la lista van después, alfabéticos.
const ORDER_KEY = 'eco.sidebar.group_order';
const ORDER_EVENT = 'eco:sidebar-group-order';

function loadGroupOrder(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(ORDER_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

function useGroupOrder(): [string[], (next: string[]) => void] {
  const [order, setOrder] = useState<string[]>(loadGroupOrder);
  useEffect(() => {
    const fn = () => setOrder(loadGroupOrder());
    window.addEventListener(ORDER_EVENT, fn);
    return () => window.removeEventListener(ORDER_EVENT, fn);
  }, []);
  const save = (next: string[]) => {
    try { window.localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* noop */ }
    window.dispatchEvent(new Event(ORDER_EVENT));
  };
  return [order, save];
}

// Dentro de cada proyecto los agentes van por categoría (en el orden de las
// categorías; sin categoría al final) y, dentro de la misma, el más reciente arriba.
function groupByWorkspace(bubbles: Bubble[], categoryIds: string[], order: string[]): Group[] {
  const map = new Map<string, Bubble[]>();
  for (const b of bubbles) {
    const key = b.workspace ?? NO_WORKSPACE;
    const list = map.get(key);
    if (list) list.push(b); else map.set(key, [b]);
  }
  const catRank = (b: Bubble) => {
    const i = categoryIds.indexOf(b.categoryIds?.[0] ?? '');
    return i < 0 ? categoryIds.length : i;
  };
  const recency = (b: Bubble) => b.lastOpenedAt ?? b.updatedAt;
  const groupRank = (key: string) => {
    const i = order.indexOf(key);
    return i < 0 ? order.length : i;
  };
  return Array.from(map.entries())
    .map(([key, agents]) => ({
      key,
      name: key ? workspaceName(key) : '',
      agents: [...agents].sort((a, b) => catRank(a) - catRank(b) || recency(b) - recency(a)),
    }))
    .sort((a, b) => (
      a.key === NO_WORKSPACE ? 1 : b.key === NO_WORKSPACE ? -1
        : groupRank(a.key) - groupRank(b.key) || a.name.localeCompare(b.name)
    ));
}

export function AppSidebar(props: Props) {
  const isPhone = useIsPhone();
  if (isPhone) return <MobileNav {...props}/>;
  return <SidebarFrame {...props}/>;
}

// Anima el ancho al contraer y expandir. El recorte solo vive mientras dura la
// transición: fijo, cortaría los menús que se abren desde la barra.
function SidebarFrame(props: Props) {
  const [animating, setAnimating] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setAnimating(true);
    const id = window.setTimeout(() => setAnimating(false), 280);
    return () => window.clearTimeout(id);
  }, [props.collapsed]);
  return (
    <div className={'eco-sidebar-frame' + (animating ? ' is-animating' : '')}
      style={{ width: props.collapsed ? SIDEBAR_WIDTH_MINI : 'var(--sidebar-w, 228px)' }}>
      {props.collapsed ? <MiniSidebar {...props}/> : <FullSidebar {...props}/>}
    </div>
  );
}

// Total de archivos con cambios sin commitear entre los agentes vivos; va
// sobre el ícono de Cambios.
function useChangesTotal(bubbles: Bubble[]): number {
  const live = useMemo(() => bubbles.filter((b) => !b.archived), [bubbles]);
  const counts = useBubbleChangeCountMap(live);
  let total = 0;
  counts.forEach((n) => { total += n; });
  return total;
}

function ChangesCount({ bubbles, className }: { bubbles: Bubble[]; className: string }) {
  const total = useChangesTotal(bubbles);
  return total > 0 ? <span className={className}>{total}</span> : null;
}

// Navegación de la barra contraída: el inicio queda a la vista y el resto va
// en un menú, para dejarle el alto a los agentes.
function MiniNav({ items, screen, onScreenChange, bubbles }: {
  items: NavItem[]; screen: Screen; onScreenChange: (s: Screen) => void; bubbles: Bubble[];
}) {
  const tr = useT();
  const total = useChangesTotal(bubbles);
  const btnRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const home = items.find((it) => it.id === 'dashboard');
  const rest = items.filter((it) => it.id !== 'dashboard');
  const restActive = rest.some((it) => isActive(it.id, screen));

  useEffect(() => {
    if (!pos) return;
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

  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const z = cssZoom();
    setPos({ left: r.right / z + 12, top: r.top / z - 6 });
  };

  return (<>
    {home && (
      <button type="button" title={tr(home.labelKey)} aria-label={tr(home.labelKey)}
        onClick={() => onScreenChange(home.id)}
        className={cx('eco-nav-item eco-nav-item--icon', isActive(home.id, screen) && 'is-on')}>
        <home.icon size={16}/>
      </button>
    )}
    <button ref={btnRef} type="button" title={tr('nav.menu')} aria-label={tr('nav.menu')}
      aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}
      className={cx('eco-nav-item eco-nav-item--icon', (restActive || pos) && 'is-on')}
      style={{ position: 'relative' }}>
      <IconMenu size={16}/>
      {total > 0 && <span className="eco-iconbtn__dot" style={{ background: 'var(--ac)', top: 5, right: 6, boxShadow: 'none' }}/>}
    </button>
    {pos && createPortal(
      <div ref={boxRef} role="menu" className="eco-menu eco-mininav" style={pos}>
        {rest.map((it) => (
          <button key={it.id} type="button" role="menuitem"
            className={cx('eco-menu__item', isActive(it.id, screen) && 'is-on')}
            onClick={() => { onScreenChange(it.id); setPos(null); }}>
            <it.icon size={16}/>
            <span className="eco-grow">{tr(it.labelKey)}</span>
            {it.id === 'files' && total > 0 && <span className="eco-mininav__count">{total}</span>}
          </button>
        ))}
      </div>,
      document.body,
    )}
  </>);
}

function useNavItems(role: Props['role']): NavItem[] {
  return role === 'admin' ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;
}

function isActive(item: Screen, screen: Screen): boolean {
  return screen === item;
}

function FullSidebar({
  screen, onScreenChange, agentCount, username, role, onLock, onSignOut, onChangePassword,
  bubbles, activeBubbleId, onOpenAgent, onRenameAgent, onRemoveAgent, onToggleCategory, showTiles,
}: Props) {
  const tr = useT();
  // Dentro del detalle de un agente el inicio vive en su encabezado.
  const items = useNavItems(role).filter((it) => !(screen === 'detail' && it.id === 'dashboard'));
  const busyIds = useBusyBubbleIds();
  const { categories } = useCategories();
  const [groupOrder, saveGroupOrder] = useGroupOrder();
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<string[]>(loadClosed);
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  // El modo focus del inicio también filtra la lista del menú.
  const { activeFocus, applyFocus } = useDashboardFocus();
  const focusKey = activeFocus.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const live = useMemo(() => applyFocus(bubbles.filter((b) => !b.archived)), [bubbles, focusKey]);
  const groups = useMemo(() => {
    const all = groupByWorkspace(live, categories.map((c) => c.id), groupOrder);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((g) => ({ ...g, agents: g.agents.filter((b) => `${b.title} ${g.name}`.toLowerCase().includes(q)) }))
      .filter((g) => g.agents.length > 0);
  }, [live, query, categories, groupOrder]);

  function toggleGroup(key: string) {
    setClosed((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { window.localStorage.setItem(CLOSED_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }

  // Sube o baja un proyecto: fija el orden visible completo y permuta.
  function moveGroup(key: string, dir: -1 | 1) {
    const keys = groups.map((g) => g.key).filter((k) => k !== NO_WORKSPACE);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    saveGroupOrder(keys);
  }

  const menuBubble = menu ? live.find((b) => b.id === menu.id) ?? null : null;

  return (
    <aside className="eco-sidebar">
      <div className="eco-hstack" style={{ padding: '0 8px 16px' }}>
        <EcoGlyph size={32}/>
        <span style={{ fontSize: 16, fontWeight: 600 }}>eco</span>
      </div>

      {/* Navegación en una fila de íconos: se usa poco y deja el alto a los agentes. */}
      <nav className="eco-navrow">
        {items.map((it) => (
          <button key={it.id} type="button" onClick={() => onScreenChange(it.id)}
            title={tr(it.labelKey)} aria-label={tr(it.labelKey)}
            className={cx('eco-navrow__item', isActive(it.id, screen) && 'is-on')}>
            <it.icon size={17}/>
            {it.id === 'dashboard' && agentCount > 0 && <span className="eco-navrow__badge">{agentCount}</span>}
            {it.id === 'files' && <ChangesCount bubbles={bubbles} className="eco-navrow__badge"/>}
          </button>
        ))}
      </nav>

      {/* Los agentes viven acá solo con el hub a la izquierda; abajo los muestra el dock. */}
      {showTiles ? (<>
      <div className="eco-eyebrow eco-eyebrow--sm" style={{ padding: '14px 10px 2px' }}>{tr('nav.section.agents')}</div>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 2px' }}>
        <label className="eco-inputbar eco-inputbar--sm eco-grow" style={{ minWidth: 0, background: 'var(--hover)' }}>
          <IconSearch size={14}/>
          <input className="eco-input-bare" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('nav.search_agents')} aria-label={tr('nav.search_agents')}/>
        </label>
        <FocusButton/>
      </div>

      <div className="eco-sidebar__list">
        {groups.length === 0 && (
          <div className="eco-sub" style={{ padding: '14px 12px' }}>
            {query.trim() ? tr('nav.agents.no_match') : tr('nav.agents.empty')}
          </div>
        )}
        {groups.map((g) => {
          const open = query.trim() ? true : !closed.includes(g.key);
          const label = g.name || tr('nav.agents.no_workspace');
          return (
            <div key={g.key} style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 14 }}>
              <div className="eco-sidebar__grouprow">
                <button type="button" className="eco-sidebar__group" onClick={() => toggleGroup(g.key)}
                  aria-expanded={open} title={g.key || label}>
                  <span className="eco-truncate">{label}</span>
                  {open ? <IconChevD size={13}/> : <IconChevR size={13}/>}
                </button>
                {g.key !== NO_WORKSPACE && !query.trim() && (
                  <span className="eco-sidebar__move">
                    <button type="button" className="eco-iconbtn eco-iconbtn--xs" onClick={() => moveGroup(g.key, -1)}
                      title={tr('nav.group.move_up')} aria-label={tr('nav.group.move_up')}><IconChevU size={13}/></button>
                    <button type="button" className="eco-iconbtn eco-iconbtn--xs" onClick={() => moveGroup(g.key, 1)}
                      title={tr('nav.group.move_down')} aria-label={tr('nav.group.move_down')}><IconChevD size={13}/></button>
                  </span>
                )}
              </div>
              {open && g.agents.map((b) => (
                <AgentRow
                  key={b.id}
                  bubble={b}
                  active={b.id === activeBubbleId}
                  busy={busyIds.has(b.id)}
                  renaming={renaming === b.id}
                  menuOpen={menu?.id === b.id}
                  onOpen={() => onOpenAgent(b.id)}
                  onMenu={(anchor) => setMenu((m) => (m?.id === b.id ? null : { id: b.id, anchor }))}
                  onRenameDone={(title) => {
                    setRenaming(null);
                    if (title && title !== b.title) onRenameAgent(b.id, title);
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      </>) : <div className="eco-spacer"/>}

      <div style={{ paddingTop: 6 }}>
        <AccountMenu variant="row" username={username} onLock={onLock} onSignOut={onSignOut} onChangePassword={onChangePassword}/>
      </div>

      {menu && menuBubble && (
        <AgentOptionsMenu
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onRename={() => setRenaming(menuBubble.id)}
          onRemove={() => onRemoveAgent(menuBubble.id)}
          categoryIds={menuBubble.categoryIds}
          onToggleCategory={(catId) => onToggleCategory(menuBubble.id, catId)}
        />
      )}
    </aside>
  );
}

// Categorías de un agente: punto (una) o barra de tramos (varias). El tooltip
// va en un portal con posición fija: dentro de la lista lo recortaba el scroll.
function CategoryBar({ cats }: { cats: { id: string; name: string; color: string }[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const z = cssZoom();
    const right = (window.innerWidth - r.right) / z;
    // Arriba si cabe; si no, debajo.
    const need = 28 + cats.length * 24;
    setPos(r.top / z > need + 8
      ? { right, bottom: (window.innerHeight - r.top) / z + 8 }
      : { right, top: r.bottom / z + 8 });
  };
  return (
    <span ref={ref} className="eco-catbar" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      {cats.map((c) => <span key={c.id} style={{ background: c.color }}/>)}
      {pos && createPortal(
        <span className="eco-tipbox eco-tipbox--float" role="tooltip" style={pos}>
          {cats.map((c) => (
            <b key={c.id}><span className="eco-dot eco-dot--lg" style={{ background: c.color }}/>{c.name}</b>
          ))}
        </span>,
        document.body,
      )}
    </span>
  );
}

// Modo focus: filtra por categoría la lista del menú, el inicio y el dock.
function FocusButton({ className }: { className?: string }) {
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
    setPos({ left: r.left / z, top: r.bottom / z + 6 });
  };
  const flip = (id: string) =>
    setFocus(activeFocus.includes(id) ? activeFocus.filter((x) => x !== id) : [...activeFocus, id]);
  return (<>
    <button ref={btnRef} type="button" title={tr('graph.focus.title')} aria-label={tr('graph.focus.title')}
      aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}
      className={cx('eco-focusbtn', on && 'is-on', className)}>
      <IconLeaf size={16}/>
      {on && <span className="eco-focusbtn__n">{activeFocus.length}</span>}
    </button>
    {pos && createPortal(
      <div ref={boxRef} role="menu" className="eco-menu eco-mininav" style={{ ...pos, minWidth: 230, maxHeight: 360, overflow: 'auto' }}>
        <div className="eco-focusmenu__title"><IconLeaf size={17}/>{tr('graph.focus.label')}</div>
        <label className="eco-inputbar eco-inputbar--sm" style={{ flex: 'none', margin: '0 0 6px', background: 'var(--hover)' }}>
          <IconSearch size={14}/>
          <input autoFocus className="eco-input-bare" value={q} onChange={(e) => setQ(e.target.value)}
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

function AgentCategoryMark({ bubble }: { bubble: Bubble }) {
  const cats = (bubble.categoryIds ?? [])
    .map(getCategoryById)
    .filter((c): c is NonNullable<ReturnType<typeof getCategoryById>> => c !== null);
  return cats.length === 0 ? <span className="eco-dot eco-dot--lg"/> : <CategoryBar cats={cats}/>;
}

function AgentRow({ bubble, active, busy, renaming, menuOpen, onOpen, onMenu, onRenameDone }: {
  bubble: Bubble; active: boolean; busy: boolean; renaming: boolean; menuOpen: boolean;
  onOpen: () => void; onMenu: (anchor: HTMLElement) => void; onRenameDone: (title: string | null) => void;
}) {
  const tr = useT();
  const moreRef = useRef<HTMLButtonElement>(null);
  const cats = (bubble.categoryIds ?? [])
    .map(getCategoryById)
    .filter((c): c is NonNullable<ReturnType<typeof getCategoryById>> => c !== null);

  if (renaming) {
    return (
      <input
        autoFocus
        defaultValue={bubble.title}
        className="eco-field eco-field--sm"
        style={{ flex: 'none', height: 34, borderRadius: 10, padding: '0 12px' }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => onRenameDone(e.currentTarget.value.trim() || null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { e.currentTarget.value = bubble.title; e.currentTarget.blur(); }
        }}
      />
    );
  }
  return (
    <div className={cx('eco-agent-row', (active || menuOpen) && 'is-on')} title={bubble.title}>
      <button type="button" className="eco-agent-row__main" onClick={onOpen} aria-current={active ? 'page' : undefined}>
        <span className="eco-truncate eco-grow">{bubble.title}</span>
        {busy && <span className="eco-spinner" style={{ width: 10, height: 10 }}/>}
        {cats.length === 0 ? (
          !busy && <span className="eco-dot eco-dot--lg"/>
        ) : (
          <CategoryBar cats={cats}/>
        )}
      </button>
      <button ref={moreRef} type="button" className="eco-iconbtn eco-iconbtn--xs eco-agent-row__more"
        title={tr('nav.agent_options')} aria-label={tr('nav.agent_options')} aria-haspopup="menu" aria-expanded={menuOpen}
        onClick={() => moreRef.current && onMenu(moreRef.current)}>
        <IconEllipsis size={15}/>
      </button>
    </div>
  );
}

function MiniSidebar({
  screen, onScreenChange, username, role, onLock, onSignOut, onChangePassword,
  bubbles, activeBubbleId, onOpenAgent, showTiles,
}: Props) {
  const tr = useT();
  // Dentro del detalle de un agente el inicio vive en su encabezado.
  const items = useNavItems(role).filter((it) => !(screen === 'detail' && it.id === 'dashboard'));
  const busyIds = useBusyBubbleIds();
  const { categories } = useCategories();
  const [groupOrder] = useGroupOrder();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{ left: number; top: number } | null>(null);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const { activeFocus, applyFocus } = useDashboardFocus();
  const focusKey = activeFocus.join(',');
  const groups = useMemo(() => {
    const all = groupByWorkspace(applyFocus(bubbles.filter((b) => !b.archived)), categories.map((c) => c.id), groupOrder);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((g) => ({ ...g, agents: g.agents.filter((b) => `${b.title} ${g.name}`.toLowerCase().includes(q)) }))
      .filter((g) => g.agents.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbles, categories, groupOrder, query, focusKey]);

  const closeSearch = () => { setSearch(null); setQuery(''); };
  const toggleSearch = () => {
    if (search) { closeSearch(); return; }
    const r = searchBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    const z = cssZoom();
    setSearch({ left: r.right / z + 8, top: r.top / z - 4 });
  };
  useEffect(() => {
    if (!search) return;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (searchBoxRef.current?.contains(n) || searchBtnRef.current?.contains(n)) return;
      if ((n as Element).closest?.('.eco-mininav')) return;
      setSearch(null); setQuery('');
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSearch(null); setQuery(''); } };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [search]);

  return (
    <aside className="eco-sidebar eco-sidebar--mini">
      <div style={{ marginBottom: 6, display: 'flex' }}><EcoGlyph size={32}/></div>
      <MiniNav items={items} screen={screen} onScreenChange={onScreenChange} bubbles={bubbles}/>
      {showTiles && (
        <button ref={searchBtnRef} type="button" className={cx('eco-minisearch', (search || query || activeFocus.length > 0) && 'is-on')}
          title={tr('nav.search_agents')} aria-label={tr('nav.search_agents')} aria-expanded={!!search}
          onClick={toggleSearch}>
          <IconSearch size={16}/>
        </button>
      )}
      {search && createPortal(
        <div ref={searchBoxRef} className="eco-menu eco-minisearch__box" style={search}>
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <label className="eco-inputbar eco-grow" style={{ minWidth: 0, background: 'var(--hover)' }}>
            <IconSearch size={15}/>
            <input autoFocus className="eco-input-bare" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('nav.search_agents')} aria-label={tr('nav.search_agents')}/>
            {query && (
              <button type="button" className="eco-iconbtn eco-iconbtn--xs" title={tr('common.clear')}
                aria-label={tr('common.clear')} onClick={() => setQuery('')}>
                <IconX size={14}/>
              </button>
            )}
          </label>
          <FocusButton/>
          </div>
          <div className="eco-minisearch__list">
            {groups.length === 0 && <div className="eco-minisearch__empty">{tr('nav.agents.no_match')}</div>}
            {groups.map((g) => (
              <div key={g.key}>
                <div className="eco-eyebrow eco-eyebrow--sm" style={{ padding: '10px 12px 4px' }}>
                  {g.name || tr('nav.agents.no_workspace')}
                </div>
                {g.agents.map((b) => (
                  <button key={b.id} type="button" title={b.title}
                    className={cx('eco-minisearch__row', b.id === activeBubbleId && 'is-on')}
                    onClick={() => { onOpenAgent(b.id); closeSearch(); }}>
                    <span className="eco-minisearch__code">{agentCode(b.title).code}</span>
                    <span className="eco-truncate eco-grow">{b.title}</span>
                    {busyIds.has(b.id) && <span className="eco-spinner" style={{ width: 10, height: 10 }}/>}
                    <AgentCategoryMark bubble={b}/>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
      <div className="eco-sidebar__tiles eco-noscrollbar">
        {showTiles && groups.map((g) => (
          <div key={g.key} className="eco-tilegroup" title={g.key || tr('nav.agents.no_workspace')}>
            <div className="eco-tilegroup__label">{(g.name || '—').replace(/^aditum-/, '')}</div>
            {g.agents.map((b) => (
              <AgentTile key={b.id} bubble={b} active={b.id === activeBubbleId} busy={busyIds.has(b.id)}
                onClick={() => onOpenAgent(b.id)}/>
            ))}
          </div>
        ))}
      </div>
      <AccountMenu username={username} onLock={onLock} onSignOut={onSignOut} onChangePassword={onChangePassword}/>
    </aside>
  );
}

/** Mosaico de agente: sigla + número, con el borde teñido por sus categorías. */
export function AgentTile({ bubble, active, busy, onClick }: {
  bubble: Bubble; active: boolean; busy: boolean; onClick: () => void;
}) {
  const { code, num } = agentCode(bubble.title);
  // Una categoría = borde sólido; varias = arcos iguales (máx. 4); ninguna = gris.
  const colors = (bubble.categoryIds ?? [])
    .map((id) => getCategoryById(id)?.color)
    .filter((c): c is string => !!c)
    .slice(0, 4);
  const ring = colors.length === 0 ? undefined
    : colors.length === 1 ? colors[0]
    : `conic-gradient(from -90deg, ${colors.map((c, i) =>
        `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(', ')})`;
  return (
    <button type="button" onClick={onClick} title={bubble.title}
      className={cx('eco-agent-tile', active && 'is-on', busy && 'is-busy')}>
      <span className="eco-agent-tile__code">{code}</span>
      {num && <span className="eco-agent-tile__num">{num}</span>}
      <span aria-hidden className="eco-agent-tile__ring" style={ring ? { background: ring } : undefined}/>
    </button>
  );
}

// Teléfono: la navegación va como barra inferior fija al borde de la pantalla.
function MobileNav({ screen, onScreenChange, agentCount, bubbles, username, role, onLock, onSignOut, onChangePassword }: Props) {
  const tr = useT();
  const items = useNavItems(role);
  return (
    <nav className="eco-bottomnav" style={{ padding: `4px 6px calc(4px + min(${SAFE_BOTTOM}, 16px))` }}>
      {items.map((it) => {
        const on = isActive(it.id, screen);
        return (
          <button key={it.id} type="button" title={tr(it.labelKey)} aria-label={tr(it.labelKey)}
            aria-current={on ? 'page' : undefined}
            onClick={() => onScreenChange(it.id)}
            className={cx('eco-bottomnav__item', on && 'is-on')}>
            <it.icon size={19}/>
            {it.id === 'dashboard' && agentCount > 0 && <span className="eco-bottomnav__badge">{agentCount}</span>}
            {it.id === 'files' && <ChangesCount bubbles={bubbles} className="eco-bottomnav__badge"/>}
          </button>
        );
      })}
      <AccountMenu username={username} onLock={onLock} onSignOut={onSignOut} onChangePassword={onChangePassword}/>
    </nav>
  );
}
