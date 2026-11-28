import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '@/lib/api';
import { useTokens, useTheme } from '@/design/theme';
import { terminalBg, terminalFg } from '@/lib/terminal-theme';
import { isLightTheme } from '@/design/tokens';
import { RealTerminal, type AgentCli } from '@/components/RealTerminal';
import { SkillsPicker } from '@/components/SkillsPicker';
import { useSkills, type SkillInfo } from '@/hooks/useSkills';
import { useSkillFavorites, skillIdOf } from '@/hooks/useSkillFavorites';
import { useBubbleBusy } from '@/hooks/usePtyBusyNotifier';
import { useCliAuth } from '@/hooks/useCliAuth';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { useGitChanges } from '@/hooks/useGitChanges';
import { useCategories } from '@/hooks/useCategories';
import { GitPanel } from '@/components/GitPanel/GitPanel';
import { GitMiniDock } from '@/components/GitMiniDock';
import { AgentStateCard, useAgentStatus, CONTEXT_STANDARD, CONTEXT_LARGE } from '@/components/AgentSidebarCards';
import { prStateColor } from '@/components/GitMiniDock';
import { useBranches } from '@/hooks/useBranches';
import { useCurrentPr } from '@/hooks/useCurrentPr';
import { BrowserPanel } from '@/components/BrowserPanel';
import { ServerPanel } from '@/components/ServerPanel';
import { FilesPanel } from '@/components/FilesPanel/FilesPanel';
import { NotesPanel } from '@/components/NotesPanel/NotesPanel';
import { GitBusyToast } from '@/components/GitBusyToast';
import { EcoGlyph } from '@/design/EcoMark';
import {
  IconBtn, Pill, AgentGlyph, SectionLabel, bubbleLetter,
} from '@/design/primitives';
import {
  IconArrowL, IconMore, IconOverview, IconSmartphone,
  IconTerminal, IconLayers, IconGlobe, IconCpu,
  IconCheck, IconX, IconGithub, IconEdit,
  IconAgent, IconFolder, IconArchive, IconNewWindow,
  IconPin, IconSwap, IconSplitH, IconSplitV, IconBranch, IconZap, IconChevD, IconChevU, IconChevL,
  type IconProps,
} from '@/design/icons';
import type { Bubble } from '@/lib/types';
import { stateColor, type AgentState } from '@/design/tokens';
import { useT } from '@/hooks/useI18n';
import { useAutoOpenDevPage } from '@/hooks/useDevServers';
import { ServerHeaderControl } from '@/components/ServerHeaderControl';
import { useObsidian, saveSessionToObsidian } from '@/hooks/useObsidian';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { takeBrowserShow } from '@/lib/browser-pending';
import { useIsPhone, useIsPhoneLandscape, isPhoneNow, isMobileNow } from '@/hooks/useMediaQuery';
import { useSplitPanels, useSplitDir, setSplitDir } from '@/hooks/useSplitPanels';
import type { JSX } from 'react';

function HeaderMenu({
  onClose, onRename,
  onCloseBubble, onOpenInNewWindow, currentCategoryIds, onToggleCategory,
}: {
  workspaces: string[];
  currentWorkspace: string;
  onClose: () => void;
  onRename: () => void;
  onChangeWorkspace: (ws: string) => void;
  onCloseBubble: () => void;
  onOpenInNewWindow?: () => void;
  currentCategoryIds?: string[];
  onToggleCategory: (categoryId: string | undefined) => void;
}) {
  const tr = useT();
  const { categories } = useCategories();
  const selectedCount = categories.filter((c) => currentCategoryIds?.includes(c.id)).length;
  useEffect(() => {
    const onDocClick = () => onClose();
    document.addEventListener('click', onDocClick, { once: true });
    return () => document.removeEventListener('click', onDocClick);
  }, [onClose]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="eco-menu"
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 30,
        width: 340, maxWidth: 'calc(100vw - 32px)', maxHeight: '70vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
      <button type="button" onClick={onRename} className="eco-menu__item">
        <IconAgent size={15}/> {tr('detail.menu.rename')}
      </button>
      {onOpenInNewWindow && (
        <button type="button" onClick={onOpenInNewWindow} className="eco-menu__item">
          <IconNewWindow size={15}/> {tr('detail.menu.open_window')}
        </button>
      )}
      {/* Categorías en rejilla — solo si hay categorías configuradas en Settings. */}
      {categories.length > 0 && (
        <>
          <div className="eco-menu__sep"/>
          <div className="eco-menu__head">
            <span style={{ flex: 1 }}>{tr('dash.category.label')}</span>
            <span className="eco-mono">{selectedCount}/{categories.length}</span>
            {selectedCount > 0 && (
              <button type="button" className="eco-menu__link" onClick={() => onToggleCategory(undefined)}>
                {tr('dash.category.clear')}
              </button>
            )}
          </div>
          <div className="eco-menu__grid">
            {categories.map((c) => {
              const active = currentCategoryIds?.includes(c.id) ?? false;
              return (
                <button
                  key={c.id} type="button" title={c.name}
                  // Toggle multi-selección: el menú queda abierto para marcar varias.
                  onClick={() => onToggleCategory(c.id)}
                  className={active ? 'eco-menu__cell is-on' : 'eco-menu__cell'}>
                  <span className="eco-dot" style={{ background: c.color }}/>
                  <span className="eco-truncate" style={{ flex: 1 }}>{c.name}</span>
                  {active && <IconCheck size={12}/>}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="eco-menu__sep"/>
      <button type="button" onClick={onCloseBubble} className="eco-menu__item eco-menu__item--danger">
        <IconArchive size={15}/> {tr('detail.menu.archive')}
      </button>
    </div>
  );
}

type Props = {
  bubble: Bubble;
  workspaces: string[];
  onBack: () => void;
  onRename: (title: string) => void;
  onClose: () => void;
  onChangeWorkspace: (workspace: string) => void;
  onToggleCategory: (categoryId: string | undefined) => void;
  // Presente solo en Electron: abre este bubble en una ventana aparte.
  onOpenInNewWindow?: () => void;
  // True cuando este AgentDetail ES la ventana aparte: oculta el mic y el
  // "abrir en ventana nueva"; el back cierra la ventana.
  solo?: boolean;
};

type Tab = 'terminal' | 'git' | 'browser' | 'server' | 'files' | 'notes';

const ALL_TABS: ReadonlyArray<Tab> = ['terminal', 'files', 'notes', 'browser', 'server', 'git'];
const TAB_ORDER_KEY = 'eco.detail.tab.order';

function loadTabOrder(): Tab[] {
  try {
    const raw = localStorage.getItem(TAB_ORDER_KEY);
    if (!raw) return [...ALL_TABS];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [...ALL_TABS];
    const valid = arr.filter((x): x is Tab =>
      typeof x === 'string' && (ALL_TABS as ReadonlyArray<string>).includes(x));
    // Si en una versión futura agregamos un tab nuevo y el user ya tenía
    // orden guardado, lo sumamos al final.
    const missing = ALL_TABS.filter((t) => !valid.includes(t));
    return [...valid, ...missing];
  } catch { return [...ALL_TABS]; }
}

function saveTabOrder(order: Tab[]): void {
  try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order)); } catch { /* noop */ }
}

// Metadata estática de cada tab — icono + key de i18n para el label.
// 'git' es 'Git' literal (sin traducción) por convención existente.
const TAB_DEFS: Record<Tab, { labelKey: string; icon: (p: IconProps) => JSX.Element }> = {
  terminal: { labelKey: 'detail.tab.terminal', icon: IconTerminal },
  files:    { labelKey: 'files.tab.label',     icon: IconFolder },
  notes:    { labelKey: 'notes.tab.label',     icon: IconEdit },
  browser:  { labelKey: 'detail.tab.browser',  icon: IconGlobe },
  server:   { labelKey: 'detail.tab.server',   icon: IconCpu },
  git:      { labelKey: 'Git',                 icon: IconGithub },
};

export function AgentDetail({
  bubble, workspaces, onBack, onRename, onClose, onChangeWorkspace,
  onToggleCategory,
  onOpenInNewWindow, solo = false,
}: Props) {
  const t = useTokens();
  const tr = useT();
  const { byId: categoryById } = useCategories();
  const bubbleCategories = (bubble.categoryIds ?? [])
    .map(categoryById)
    .filter((c): c is NonNullable<ReturnType<typeof categoryById>> => c !== null);
  const STATE_LABELS_I18N: Record<AgentState, string> = {
    idle: tr('state.idle'),
    pending: tr('state.pending'),
    running: tr('state.running'),
    waiting: tr('state.waiting'),
    paused: tr('state.paused'),
    done: tr('state.done'),
    error: tr('state.error'),
    thinking: tr('state.thinking'),
    executing: tr('state.executing'),
  };
  const isPhone = useIsPhone();
  // Paneles abiertos (hasta dos lado a lado), persistidos por agente. En el
  // teléfono no hay lugar para dos: se muestra uno solo.
  // Acostado el teléfono tiene ~800px de ancho: ahí sí entran dos paneles.
  const compact = useIsPhoneLandscape();
  const split = useSplitPanels<Tab>(bubble.id, ALL_TABS, 'terminal', !isPhone || compact);
  const splitDir = useSplitDir();
  const hasSplit = split.open.length === 2;
  useAutoOpenDevPage(bubble.id);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [draggingSplit, setDraggingSplit] = useState(false);
  // Orden global de los tabs (persistido para TODOS los agentes en
  // `eco.detail.tab.order`). El user los reordena por drag-and-drop.
  const [tabOrder, setTabOrder] = useState<Tab[]>(() => loadTabOrder());
  const [draggingTabId, setDraggingTabId] = useState<Tab | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<Tab | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bubble.title);
  const [menuOpen, setMenuOpen] = useState(false);
  // Teléfono acostado: header y tabs se funden en UNA fila. Apilados se
  // llevaban ~100px de un alto de ~400.
  // Navegador a pantalla completa (solo teléfono): esconde también este header.
  const [browserImmersive, setBrowserImmersive] = useState(false);
  const hideChrome = isPhone && browserImmersive && split.open[0] === 'browser';
  // El colapso del panel lateral vive acá porque en móvil el rail no se
  // dibuja inline y el botón que lo abre está en el header. En táctil arranca
  // cerrado siempre: la sheet tapa el panel activo.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (isPhoneNow()) return true;
    try { return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  // El agente trabaja mayormente en el PTY (claude CLI), cuyo "busy" se
  // trackea aparte de bubble.status (que refleja el chat SDK). Sin esto el
  // título quedaba "idle" aunque el agente estuviera procesando en la terminal.
  const ptyBusy = useBubbleBusy(bubble.id);
  const rawState = (bubble.status as AgentState) || 'idle';
  const state: AgentState = ptyBusy && (rawState === 'idle' || rawState === 'done')
    ? 'thinking'
    : rawState;
  const sColor = stateColor(state, t);

  useEffect(() => { setDraft(bubble.title); }, [bubble.title]);

  function commitRename() {
    const v = draft.trim();
    if (v && v !== bubble.title) onRename(v);
    setRenaming(false);
  }

  // Polling cada 6s — los eventos `eco:git_refresh` que dispara cada acción
  // (accept/discard/revert) refrescan al instante, así que el poll es solo
  // catch-all para cambios externos (commits CLI, etc.). 4s era overkill.
  const gitChangesResult = useGitChanges(bubble.workspace, bubble.id, 6000);
  const gitChanges = gitChangesResult.files;
  const gitChangesLoading = gitChangesResult.loading;
  const filesChanged = useMemo(() => {
    // `gitChanges` es la fuente de verdad: lo que git considera pendiente
    // de commit en el worktree. Si un archivo NO aparece acá, no tiene
    // cambios revisables (fue commiteado, descartado, o nunca existió).
    // Filtramos los `deleted` porque no hay diff que mostrar.
    return gitChanges
      .filter((g) => g.change !== 'deleted')
      .map((g): FileChange => ({ path: g.path, change: g.change, agent: 'git', unstaged: g.unstaged }));
  }, [gitChanges]);

  // Comandos por voz: cambiar tab desde fuera del componente.
  // Solo reaccionamos al `eco:switch_tab` si es para ESTA burbuja (o si el
  // emisor no especificó bubbleId — legacy/voz). Con multi-detail keepalive
  // hay varias AgentDetail montadas a la vez; sin este filtro todas
  // cambiaban de tab cuando una sola lo pedía.
  useEffect(() => ecoOn('eco:switch_tab', (e) => {
    if (e.bubbleId && e.bubbleId !== bubble.id) return;
    if (e.tab === 'browser') takeBrowserShow(bubble.id);
    split.show(e.tab);
  }), [bubble.id, split.show]);
  // El MCP pidió el navegador de esta bubble antes de que se montara.
  useEffect(() => {
    if (takeBrowserShow(bubble.id)) split.show('browser');
  }, [bubble.id, split.show]);

  const tabButtons = tabOrder.map((id) => {
          const def = TAB_DEFS[id];
          const badge = id === 'git' ? filesChanged.length : undefined;
          return (
            <TabBtn
              key={id}
              tabId={id}
              active={split.open.includes(id)}
              onClick={() => split.toggle(id)}
              pinned={split.pinned === id}
              onTogglePin={isPhone && !compact ? undefined : () => (split.open.includes(id) ? split.togglePin(id) : split.showPinned(id))}
              label={def.labelKey === 'Git' ? 'Git' : tr(def.labelKey)}
              icon={def.icon}
              badge={badge}
              iconOnly={isPhone}
              dragOver={dragOverTabId === id}
              onDragStart={() => setDraggingTabId(id)}
              onDragEnd={() => { setDraggingTabId(null); setDragOverTabId(null); }}
              onDragOver={() => setDragOverTabId(id)}
              onDragLeave={() => setDragOverTabId((v) => v === id ? null : v)}
              onDrop={() => {
                if (draggingTabId && draggingTabId !== id) {
                  const next = [...tabOrder];
                  const from = next.indexOf(draggingTabId);
                  const to = next.indexOf(id);
                  if (from >= 0 && to >= 0) {
                    next.splice(from, 1);
                    next.splice(to, 0, draggingTabId);
                    setTabOrder(next);
                    saveTabOrder(next);
                  }
                }
                setDraggingTabId(null);
                setDragOverTabId(null);
              }}
            />
          );
        });

  // Estilo del hueco de cada panel. Los paneles son hermanos en orden FIJO en
  // el DOM y se acomodan con `order`: mover el nodo de un <webview> lo recarga.
  const slotStyle = (id: Tab): React.CSSProperties => {
    const i = split.open.indexOf(id);
    if (i < 0) return { display: 'none' };
    const grow = !hasSplit ? 1 : i === 0 ? split.ratio : 1 - split.ratio;
    return {
      display: 'flex', flexDirection: 'column',
      order: i === 0 ? 1 : 3,
      flex: `${grow} 1 0`, minWidth: 0, minHeight: 0, overflow: 'hidden',
      // Al pasar de oculto a visible la animación arranca sola.
      animation: 'eco-pane .24s var(--ease) both',
      ...(isPhone ? null : { borderRadius: 22, background: t.card }),
    };
  };

  const onDividerDown = (e: React.PointerEvent) => {
    const el = splitRef.current;
    if (!el) return;
    e.preventDefault();
    setDraggingSplit(true);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      split.setRatio(splitDir === 'column' ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width);
    };
    const up = () => {
      setDraggingSplit(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const dividerSize = isMobileNow() ? 10 : 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <GitBusyToast bubbleId={bubble.id}/>
      {!hideChrome && !isPhone && (
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 28px 14px' }}>
        <header className="eco-page-head">
          <IconBtn icon={solo ? IconArrowL : IconOverview} size={44} onClick={onBack} title={tr('nav.dashboard')} style={{ background: t.card, alignSelf: 'center' }}/>
          <div className="eco-page-head__main">
            <div
              className="eco-eyebrow eco-truncate"
              title={`${bubble.workspace || '—'} · ${tr('detail.header.id')} ${bubble.id}`}>
              {tr('nav.section.agents')} / {bubble.workspace ? bubble.workspace.split('/').filter(Boolean).pop() : '—'} · {tr('detail.header.id')} {bubble.id.slice(0, 10)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
              {renaming ? (
                <input
                  autoFocus
                  className="eco-field"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                    if (e.key === 'Escape') { setDraft(bubble.title); setRenaming(false); }
                  }}
                  style={{ fontSize: 22, height: 48, minWidth: 260, maxWidth: 520, flex: '1 1 260px' }}
                />
              ) : (
                <h1
                  className="eco-title eco-title--md eco-truncate"
                  onDoubleClick={() => { setDraft(bubble.title); setRenaming(true); }}
                  title={tr('dash.bubble.rename_tip')}
                  style={{ cursor: 'text', minWidth: 0, maxWidth: '100%', paddingBottom: 4, marginTop: 0 }}>
                  {bubble.title}
                </h1>
              )}
              <span className="eco-chip">
                <span className="eco-dot" style={{ background: sColor }}/>
                {STATE_LABELS_I18N[state] || tr('state.idle')}
              </span>
              {bubbleCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="eco-chip"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
                  title={category.name}
                  style={{ border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span className="eco-dot" style={{ background: category.color }}/>
                  {category.name}
                </button>
              ))}
            </div>
          </div>
          <div className="eco-page-head__actions" style={{ position: 'relative' }}>
            <RemoteControlNavButton bubble={bubble}/>
            {bubble.workspace && <ServerHeaderControl bubbleId={bubble.id} workspace={bubble.workspace}/>}
            <IconBtn
              icon={IconMore} size={44} active={menuOpen}
              style={{ background: menuOpen ? t.hover : t.card }}
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}/>
            {menuOpen && (
              <HeaderMenu
                workspaces={workspaces}
                currentWorkspace={bubble.workspace}
                onClose={() => setMenuOpen(false)}
                onRename={() => { setMenuOpen(false); setDraft(bubble.title); setRenaming(true); }}
                onChangeWorkspace={(ws) => { setMenuOpen(false); onChangeWorkspace(ws); }}
                onCloseBubble={() => { setMenuOpen(false); onClose(); }}
                onOpenInNewWindow={onOpenInNewWindow ? () => { setMenuOpen(false); onOpenInNewWindow(); } : undefined}
                currentCategoryIds={bubble.categoryIds}
                onToggleCategory={onToggleCategory}
              />
            )}
          </div>
        </header>
        <div className="eco-tabs">
          {tabButtons}
          <div className="eco-spacer"/>
          {sidebarCollapsed && (
            <ContextChips bubble={bubble} filesCount={filesChanged.length} onExpand={() => setSidebarCollapsed(() => false)}/>
          )}
          {hasSplit && (
            <div className="eco-seg eco-seg--sm eco-seg--icons">
              <button type="button" className="eco-seg__item" title={tr('detail.split.swap')} aria-label={tr('detail.split.swap')} onClick={split.swap}>
                <IconSwap size={15}/>
              </button>
              <button
                type="button" className="eco-seg__item"
                title={splitDir === 'row' ? tr('detail.split.stack') : tr('detail.split.side_by_side')}
                aria-label={splitDir === 'row' ? tr('detail.split.stack') : tr('detail.split.side_by_side')}
                onClick={() => setSplitDir(splitDir === 'row' ? 'column' : 'row')}>
                {splitDir === 'row' ? <IconSplitV size={15}/> : <IconSplitH size={15}/>}
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {!hideChrome && isPhone && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: compact ? 6 : isPhone ? 8 : 10,
        padding: compact ? '0 8px' : isPhone ? '4px 12px' : '0 12px',
        ...(isPhone ? null : { height: 48, flexShrink: 0 }),
      }}>
        {/* Sin rail lateral en el detalle, este botón es la vuelta al inicio.
            En la ventana aparte cierra la ventana: ahí sigue siendo "atrás". */}
        {solo ? (
          <IconBtn icon={IconArrowL} size={32} onClick={onBack}/>
        ) : (
          // Dentro del detalle no hay rail lateral: la marca sigue a la vista
          // acá y lleva al inicio. El ícono de inicio va en la franja del dock
          // cuando está visible; si no (teléfono, dock apagado), acá al lado.
          <>
          <button
            type="button"
            onClick={onBack}
            title={tr('nav.dashboard')}
            aria-label={tr('nav.dashboard')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              height: 36, padding: '0 4px', border: 0, borderRadius: t.r2,
              background: 'transparent', color: t.text0, cursor: 'pointer', flexShrink: 0,
            }}>
            {isPhone ? <IconChevL size={22}/> : <EcoGlyph size={24}/>}
          </button>
          {!isPhone && (
            <span aria-hidden style={{ width: 1, height: 22, background: t.glassBorder, flexShrink: 0 }}/>
          )}
          </>
        )}
        <AgentGlyph size={compact ? 24 : 28} state={state} letter={bubbleLetter(bubble.title)} accent={bubble.accent}/>
        <div style={compact ? { flex: '0 1 auto', minWidth: 48, maxWidth: '28%' } : { flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: compact || !isPhone ? 'nowrap' : 'wrap', ...(isPhone ? null : { overflow: 'hidden' }) }}>
            {renaming ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') { setDraft(bubble.title); setRenaming(false); }
                }}
                style={{
                  background: t.bg3, border: `1px solid ${t.accent}`,
                  borderRadius: 8, padding: '4px 10px',
                  fontFamily: t.fontSans, fontWeight: 500,
                  // 16px en móvil evita el auto-zoom de iOS al enfocar.
                  fontSize: isPhone ? 16 : 16,
                  color: t.text0, outline: 'none',
                  // El minWidth de 200 empujaba el header entero en el
                  // teléfono, donde el título tiene ~180px de espacio.
                  ...(isPhone
                    ? { width: '100%', minWidth: 0 }
                    : { minWidth: 200, maxWidth: 380 }),
                }}
              />
            ) : (
              <h2
                onDoubleClick={() => { setDraft(bubble.title); setRenaming(true); }}
                title={tr('dash.bubble.rename_tip')}
                style={{
                  margin: 0, fontFamily: t.fontSans, fontSize: compact ? 13 : 16, fontWeight: 500,
                  color: t.text0, cursor: 'text',
                  // `flex` en vez de `maxWidth: 100%`: así el título cede
                  // ancho y los chips de categoría entran en la MISMA línea
                  // cuando caben, en vez de empujarlos siempre abajo.
                  ...(isPhone
                    ? { flex: '1 1 90px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                    : { flex: '0 1 auto', minWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
                }}>{bubble.title}</h2>
            )}
            {/* El estado ya lo muestra el punto del AgentGlyph al lado: en el
                teléfono este Pill es información repetida que gasta la línea. */}
            {!isPhone && <Pill color={sColor}>{STATE_LABELS_I18N[state] || tr('state.idle')}</Pill>}
            {/* Chips de categorías — clickeables: abren el menú para cambiarlas.
                "arriba donde está el nombre", como pidió el user. */}
            {!compact && bubbleCategories.slice(0, isPhone ? 1 : undefined).map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
                title={category.name}
                aria-label={category.name}
                className="eco-chip eco-chip--btn"
                style={{ flexShrink: 0, height: 28, padding: '0 10px', fontSize: 12, maxWidth: isPhone ? 110 : undefined }}>
                <span className="eco-dot" style={{ background: category.color }}/>
                <span className="eco-truncate">{category.name}</span>
              </button>
            ))}
            {isPhone && !compact && bubbleCategories.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
                title={bubbleCategories.slice(1).map((c) => c.name).join(', ')}
                className="eco-chip eco-chip--btn eco-mono"
                style={{ flexShrink: 0, height: 28, padding: '0 8px', fontSize: 12 }}>
                +{bubbleCategories.length - 1}
              </button>
            )}
            {/* Ruta e id en la misma fila: es lo primero que cede ancho. */}
            {!isPhone && (
              <span
                title={`${bubble.workspace || '—'} · ${tr('detail.header.id')} ${bubble.id}`}
                style={{
                  flex: '0 9999 auto', minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: t.fontMono, fontSize: 12, color: t.text2,
                }}>
                {bubble.workspace || '—'} · {tr('detail.header.id')} {bubble.id.slice(0, 10)}
              </span>
            )}
          </div>
        </div>

        {compact && (
          <div className="eco-dock-scroll" style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto',
          }}>
            {tabButtons}
          </div>
        )}

        <div style={{ display: 'flex', gap: compact ? 2 : 6, position: 'relative', alignItems: 'center' }}>
          {compact && <RemoteControlNavButton bubble={bubble}/>}
          {!isPhone && bubble.workspace && <ServerHeaderControl bubbleId={bubble.id} workspace={bubble.workspace}/>}
          {isPhone && (
            <IconBtn
              icon={IconLayers}
              size={32}
              active={!sidebarCollapsed}
              title={tr('detail.sidebar.show')}
              onClick={() => setSidebarCollapsed((v) => !v)}
            />
          )}
          <IconBtn icon={IconMore} size={32} onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}/>
          {menuOpen && (
            <HeaderMenu
              workspaces={workspaces}
              currentWorkspace={bubble.workspace}
              onClose={() => setMenuOpen(false)}
              onRename={() => { setMenuOpen(false); setDraft(bubble.title); setRenaming(true); }}
              onChangeWorkspace={(ws) => { setMenuOpen(false); onChangeWorkspace(ws); }}
              onCloseBubble={() => { setMenuOpen(false); onClose(); }}
              onOpenInNewWindow={onOpenInNewWindow ? () => { setMenuOpen(false); onOpenInNewWindow(); } : undefined}
              currentCategoryIds={bubble.categoryIds}
              onToggleCategory={onToggleCategory}
            />
          )}
        </div>
      </div>
      )}

      {isPhone && !compact && !hideChrome && (
      <div
        className="eco-dock-scroll"
        style={{
          position: 'relative',
          display: 'flex', gap: 6,
          padding: '8px 12px',
          alignItems: 'center',
          // Sin overflowX las 6 tabs (~600px con etiqueta) se cortan sin
          // aviso. En móvil van solo-icono para que entren las 6 de una y
          // el scroll queda de red de seguridad para el botón remoto.
          ...(isPhone ? { overflowX: 'auto', flexShrink: 0 } : null),
        }}>
        {tabButtons}
        <div style={{ flex: 1 }}/>
        {hasSplit && (
          <>
            <IconBtn icon={IconSwap} size={28} title={tr('detail.split.swap')} onClick={split.swap}/>
            <IconBtn
              icon={splitDir === 'row' ? IconSplitV : IconSplitH}
              size={28}
              title={splitDir === 'row' ? tr('detail.split.stack') : tr('detail.split.side_by_side')}
              onClick={() => setSplitDir(splitDir === 'row' ? 'column' : 'row')}
              style={{ marginRight: 6 }}
            />
          </>
        )}
        <RemoteControlNavButton bubble={bubble}/>
      </div>
      )}

      {/* position:relative es el ancla de la sheet del sidebar en móvil, que
          se dibuja como `position:absolute; inset:0` sobre el panel activo. */}
      <div style={{
        flex: 1, display: 'flex', overflow: 'hidden', position: 'relative',
        ...(isPhone || hideChrome ? null : { padding: '0 18px 18px', gap: 18 }),
      }}>
        <div ref={splitRef} style={{
          flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative',
          display: 'flex', flexDirection: splitDir,
        }}>
          {split.open.includes('terminal') && (
            <div style={slotStyle('terminal')}><TerminalTabs bubble={bubble}/></div>
          )}
          {split.open.includes('git') && (
            <div style={slotStyle('git')}>
              <GitPanel
                workspace={bubble.workspace}
                bubbleId={bubble.id}
                filesChanged={filesChanged}
                gitChangesLoading={gitChangesLoading}
                onRename={onRename}
              />
            </div>
          )}
          <KeepAliveFiles
            visible={split.open.includes('files')} slot={slotStyle('files')}
            bubbleId={bubble.id} workspace={bubble.workspace}
          />
          {split.open.includes('notes') && (
            <div style={slotStyle('notes')}><NotesPanel bubble={bubble}/></div>
          )}
          {/* Navegador queda MONTADO siempre una vez abierto, solo se oculta cuando
              cambiás de pestaña. Así el iframe no recarga y la sesión del browser
              (cookies, localStorage del sitio, scroll position) se preserva. */}
          <KeepAliveBrowser
            visible={split.open.includes('browser')} slot={slotStyle('browser')}
            bubbleId={bubble.id} workspace={bubble.workspace}
            immersive={hideChrome}
            onToggleImmersive={isPhone ? () => setBrowserImmersive((v) => !v) : undefined}
          />
          <KeepAliveServer
            visible={split.open.includes('server')} slot={slotStyle('server')}
            bubbleId={bubble.id} workspace={bubble.workspace}
          />
          {hasSplit && (
            <div
              role="separator"
              aria-orientation={splitDir === 'row' ? 'vertical' : 'horizontal'}
              title={tr('detail.split.resize')}
              onPointerDown={onDividerDown}
              onDoubleClick={() => split.setRatio(0.5)}
              onMouseEnter={(e) => { e.currentTarget.style.background = t.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = draggingSplit ? t.accent : (isPhone ? t.line : 'transparent'); }}
              style={{
                order: 2, flex: 'none', touchAction: 'none',
                width: splitDir === 'row' ? dividerSize : '100%',
                height: splitDir === 'row' ? '100%' : dividerSize,
                cursor: splitDir === 'row' ? 'col-resize' : 'row-resize',
                background: draggingSplit ? t.accent : (isPhone ? t.line : 'transparent'),
                borderRadius: 4,
                ...(isPhone ? null : (splitDir === 'row' ? { margin: '0 6px' } : { margin: '6px 0' })),
                transition: 'background 140ms',
              }}
            />
          )}
          {/* Mientras se arrastra, una capa tapa los paneles: un iframe o un
              <webview> debajo del cursor se traga los eventos del puntero. */}
          {draggingSplit && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              cursor: splitDir === 'row' ? 'col-resize' : 'row-resize',
            }}/>
          )}
        </div>
        <AgentSidebar
          bubble={bubble}
          filesChanged={filesChanged}
          onGoTab={(target) => { split.show(target); if (isPhone) setSidebarCollapsed(() => true); }}
          onRename={onRename}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />
      </div>
    </div>
  );
}

type FileChange = { path: string; change: string; agent: string; unstaged?: boolean };

function TabBtn({
  active, onClick, label, icon: Icon, badge, iconOnly = false,
  pinned = false, onTogglePin,
  tabId, dragOver, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}: {
  active: boolean; onClick: () => void; label: string; icon: (p: IconProps) => JSX.Element; badge?: number;
  iconOnly?: boolean;
  // Fijado: se queda al elegir un tercer panel. `onTogglePin` viene siempre
  // que la pantalla admite dos paneles; en un tab cerrado lo abre y lo fija.
  pinned?: boolean;
  onTogglePin?: () => void;
  tabId?: string;
  dragOver?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const showPin = pinned && active;
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={!!tabId}
      onDragStart={(e) => {
        if (!tabId) return;
        // Necesario para que el drop event dispare en Firefox.
        try { e.dataTransfer.setData('text/plain', tabId); } catch { /* noop */ }
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(e) => {
        if (!tabId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver?.();
      }}
      onDragLeave={() => onDragLeave?.()}
      onDrop={(e) => {
        if (!tabId) return;
        e.preventDefault();
        onDrop?.();
      }}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      className={`eco-tab${active ? ' is-on' : ''}`}
      style={{
        position: 'relative',
        ...(iconOnly ? { padding: '0 13px' } : null),
        boxShadow: dragOver
          ? `inset 3px 0 0 ${t.accent}`
          : undefined,
      }}
    >
      <Icon size={iconOnly ? 17 : 14}/>
      {!iconOnly && label}
      {badge != null && badge > 0 && (
        <span className="eco-mono" style={{ fontSize: 11.5 }}>{badge}</span>
      )}
      {onTogglePin && (
        <span
          role="button"
          tabIndex={0}
          title={showPin ? tr('detail.split.unpin') : tr('detail.split.pin')}
          aria-label={showPin ? tr('detail.split.unpin') : tr('detail.split.pin')}
          aria-pressed={showPin}
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onTogglePin(); }
          }}
          className={`eco-tab__pin${showPin ? ' is-pinned' : ''}`}>
          <IconPin size={13}/>
        </span>
      )}
    </button>
  );
}

type ExtraTerm = { id: string; label: string };

function readExtraTerms(bubbleId: string): ExtraTerm[] {
  try {
    const raw = window.localStorage.getItem(`eco.terminals.${bubbleId}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((t): t is ExtraTerm =>
      t && typeof t.id === 'string' && /^[A-Za-z0-9_-]+$/.test(t.id) &&
      typeof t.label === 'string',
    );
  } catch { return []; }
}

function writeExtraTerms(bubbleId: string, terms: ExtraTerm[]) {
  try {
    if (terms.length === 0) {
      window.localStorage.removeItem(`eco.terminals.${bubbleId}`);
    } else {
      window.localStorage.setItem(`eco.terminals.${bubbleId}`, JSON.stringify(terms));
    }
  } catch { /* noop */ }
}

// Terminal activa por burbuja, SOLO en memoria. TerminalTabs se desmonta al
// cambiar de tab (Terminal → Git → Terminal), y sin esto perderías la pestaña
// que estabas mirando. Deliberadamente NO se persiste: al abrir una burbuja
// (app fresca) siempre caés en Claude, nunca en Codex ni en un shell suelto.
const activeTermByBubble = new Map<string, string>();

function TerminalTabs({ bubble }: { bubble: Bubble }) {
  const tr = useT();
  const [extras, setExtras] = useState<ExtraTerm[]>(() => readExtraTerms(bubble.id));
  const [activeId, setActiveId] = useState<string>(() => activeTermByBubble.get(bubble.id) ?? 'main');

  useEffect(() => { writeExtraTerms(bubble.id, extras); }, [bubble.id, extras]);
  useEffect(() => { activeTermByBubble.set(bubble.id, activeId); }, [bubble.id, activeId]);

  // Migración: la clave persistida hacía que una burbuja donde habías usado
  // Codex reabriera en Codex tras reiniciar. Ya no se lee; la borramos.
  useEffect(() => {
    try { window.localStorage.removeItem(`eco.terminals.active.${bubble.id}`); }
    catch { /* noop */ }
  }, [bubble.id]);

  // Montaje perezoso: sin esto, tener una pestaña Codex fija spawnearía un
  // proceso `codex` en cada burbuja apenas se abre la pestaña Shell. Una vez
  // montada, la terminal queda viva (oculta con display:none) para que xterm
  // y la WS sobrevivan el cambio de pestaña.
  const [mounted, setMounted] = useState<Set<string>>(() => new Set([activeId]));
  useEffect(() => {
    setMounted((prev) => (prev.has(activeId) ? prev : new Set(prev).add(activeId)));
  }, [activeId]);

  // Si el active apunta a un extra que ya no existe, caer a main.
  useEffect(() => {
    if (activeId === 'main' || activeId === 'codex') return;
    if (!extras.some((x) => x.id === activeId)) setActiveId('main');
  }, [activeId, extras]);

  const addShell = useCallback(() => {
    const existingNums = extras
      .map((x) => Number(x.label.replace(/\D/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0);
    const n = (existingNums.length ? Math.max(...existingNums) : 0) + 1;
    const id = `shell-${Date.now().toString(36)}`;
    const label = `Shell ${n}`;
    setExtras((prev) => [...prev, { id, label }]);
    setActiveId(id);
  }, [extras]);

  const closeShell = useCallback(async (id: string) => {
    // Best-effort kill en el backend. Si falla, igual quitamos la pestaña.
    void apiFetch('/pty/kill-terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bubbleId: bubble.id, ptyId: id }),
    }).catch(() => { /* noop */ });
    setExtras((prev) => prev.filter((x) => x.id !== id));
    setActiveId((prev) => (prev === id ? 'main' : prev));
  }, [bubble.id]);

  // 'Claude' y 'Codex' son nombres de producto: no pasan por i18n.
  const tabs: Array<{ id: string; label: string; closable: boolean; agent: AgentCli }> = [
    { id: 'main', label: 'Claude', closable: false, agent: 'claude' },
    { id: 'codex', label: 'Codex', closable: false, agent: 'codex' },
    ...extras.map((x) => ({ id: x.id, label: x.label, closable: true, agent: 'none' as const })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Con 3-4 shells abiertos la tira desborda en el teléfono: scroll
          horizontal sin barra visible, igual que el sub-nav de Git. */}
      <div className="eco-dock-scroll" style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '12px 16px 8px',
        overflowX: 'auto', flexShrink: 0,
      }}>
        {tabs.map((tab) => (
          <TermTabBtn
            key={tab.id}
            active={tab.id === activeId}
            onClick={() => setActiveId(tab.id)}
            onClose={tab.closable ? () => closeShell(tab.id) : undefined}
          >{tab.label}</TermTabBtn>
        ))}
        <button
          type="button"
          onClick={addShell}
          title={tr('detail.terminal.new_tooltip')}
          className="eco-subtab eco-subtab--add"
          style={{ marginLeft: 4 }}
        >{tr('detail.terminal.new_btn')}</button>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              position: 'absolute', inset: 0,
              display: tab.id === activeId ? 'flex' : 'none',
              flexDirection: 'column',
            }}
          >
            {tab.agent === 'codex'
              ? <CodexPane bubble={bubble} mounted={mounted.has(tab.id)}/>
              : mounted.has(tab.id) && (
                  <RealTerminal
                    workspace={bubble.workspace}
                    bubbleId={bubble.id}
                    ptyId={tab.id}
                    agent={tab.agent}
                  />
                )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Si el CLI de Codex no está instalado no spawneamos PTY: un `command not
// found` crudo en una pestaña fija es peor que decir cómo instalarlo.
function CodexPane({ bubble, mounted }: { bubble: Bubble; mounted: boolean }) {
  const { t, effectiveMode } = useTheme();
  const isLight = isLightTheme(effectiveMode);
  const tr = useT();
  const codex = useCliAuth('codex');
  const [retrying, setRetrying] = useState(false);

  const retry = useCallback(async () => {
    setRetrying(true);
    await codex.refresh();
    setRetrying(false);
  }, [codex]);

  if (!mounted) return null;
  if (codex.loading && !codex.status) return null;

  if (codex.status && !codex.status.cliInstalled) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: 24, background: terminalBg(t, isLight), color: terminalFg(t, isLight),
      }}>
        <div style={{ fontFamily: t.fontSans, fontSize: 14, fontWeight: 500 }}>
          {tr('detail.terminal.codex.missing.title')}
        </div>
        <div style={{ fontFamily: t.fontSans, fontSize: 13, color: t.text2, textAlign: 'center', maxWidth: 420, lineHeight: 1.6 }}>
          {tr('detail.terminal.codex.missing.desc')}
        </div>
        <code style={{
          fontFamily: t.fontMono, fontSize: 12, padding: '8px 12px', borderRadius: 8,
          background: '#161923', color: '#e5e7eb', border: '1px solid #262a36',
        }}>npm i -g @openai/codex</code>
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          style={{
            marginTop: 4, padding: '6px 16px', borderRadius: 8,
            border: `1px solid ${t.accent}`, background: 'transparent', color: t.accent,
            cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.6 : 1,
            fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
          }}
        >{tr('detail.terminal.codex.missing.retry')}</button>
      </div>
    );
  }

  return (
    <RealTerminal
      workspace={bubble.workspace}
      bubbleId={bubble.id}
      ptyId="codex"
      agent="codex"
    />
  );
}

function TermTabBtn({
  active, onClick, onClose, children,
}: {
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const tr = useT();
  return (
    <div
      onClick={onClick}
      className={`eco-subtab${active ? ' is-on' : ''}`}
      style={{ userSelect: 'none', ...(onClose ? { paddingRight: 7 } : null) }}
    >
      <span>{children}</span>
      {onClose && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title={tr('detail.terminal.close_tooltip')}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, borderRadius: 4, padding: 0, border: 0,
            background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.7,
          }}
        ><IconX size={10} strokeWidth={2.5}/></button>
      )}
    </div>
  );
}

// Helper: corre un skill mandando "/<skill>\r" directo al PTY del agente
// (donde corre Claude CLI). Después switcheamos al tab Terminal para que
// el user vea la salida en vivo.
async function runSkillInTerminal(opts: {
  bubbleId: string;
  workspace: string;
  skill: SkillInfo;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await writeToBubblePty({
    bubbleId: opts.bubbleId,
    workspace: opts.workspace,
    text: `/${opts.skill.name}\r`,
  });
  if (r.ok) {
    ecoEmit('eco:switch_tab', { tab: 'terminal', bubbleId: opts.bubbleId });
  }
  return r;
}

function SkillsCard({
  bubbleId, workspace,
}: {
  bubbleId: string;
  workspace: string;
}) {
  const t = useTokens();
  const tr = useT();
  const { skills } = useSkills(workspace);
  const { isFav, toggle: toggleFav } = useSkillFavorites();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // La lista de favoritos es desplegable (estado global, persistido).
  const [favCollapsed, setFavCollapsed] = useState<boolean>(() => {
    try { return window.localStorage.getItem('eco.skills.fav_collapsed') === '1'; }
    catch { return false; }
  });
  const toggleFavCollapsed = () => {
    setFavCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem('eco.skills.fav_collapsed', next ? '1' : '0'); }
      catch { /* noop */ }
      return next;
    });
  };

  // Solo los favoritos que existen en el workspace actual.
  const favSkills = useMemo(
    () => skills.filter((s) => isFav(skillIdOf(s))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skills, isFav],
  );

  // Al click de un skill: lo escribimos al PTY del agente como
  // `/skill-name\r` para que Claude CLI lo ejecute (assumiendo que el user
  // tiene `claude` corriendo en la terminal del bubble). Después salta a la
  // pestaña Terminal para ver la respuesta.
  async function run(skill: SkillInfo) {
    setBusy(skill.name); setErr(null);
    const r = await runSkillInTerminal({ bubbleId, workspace, skill });
    setBusy(null);
    if (!r.ok) setErr(r.error);
  }

  return (
    <div>
      {/* SkillsPicker en la esquina sup-derecha — el título "Skills" lo
          aporta la CollapsibleSection wrapper. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        marginBottom: 8,
      }}>
        <SkillsPicker
          workspace={workspace}
          onRun={(skill) => void run(skill)}
        />
      </div>
      {favSkills.length === 0 ? (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          background: `linear-gradient(135deg, ${t.accentFaint} 0%, ${t.bg2} 100%)`,
          border: `1px dashed ${t.glassBorder}`,
          fontSize: 11, color: t.text2, lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: t.bg3, color: t.warn,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14,
          }}>★</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: t.text0, marginBottom: 2 }}>
              {tr('detail.skills.no_favs_title')}
            </div>
            <div>{tr('detail.skills.no_favs_hint_pre')} <span style={{ color: t.warn }}>★</span> {tr('detail.skills.no_favs_hint_post')}</div>
          </div>
        </div>
      ) : (
        <>
          {/* Header desplegable de la lista de favoritos. */}
          <button type="button" onClick={toggleFavCollapsed}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 4px 8px', border: 0, background: 'transparent',
              color: t.text2, cursor: 'pointer', textAlign: 'left',
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
            }}>
            <span style={{
              fontSize: 14, color: t.text1, lineHeight: 1,
              transform: favCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 180ms ease',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 14, height: 14,
            }}>▾</span>
            <span>Favoritos</span>
            <span style={{
              padding: '1px 8px', background: t.bg3, borderRadius: 999,
              fontSize: 11, color: t.text1, letterSpacing: 0,
            }}>{favSkills.length}</span>
          </button>
          {!favCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {favSkills.map((s) => {
            const running = busy === s.name;
            const desc = s.description?.trim();
            return (
              <div
                key={skillIdOf(s)}
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-disabled={!!busy}
                onClick={() => { if (!busy) void run(s); }}
                onKeyDown={(e) => {
                  if (busy) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void run(s); }
                }}
                title={desc ? `/${s.name} — ${desc}` : `/${s.name}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 26, padding: '0 6px 0 8px',
                  borderRadius: 6,
                  background: running ? t.accentFaint : 'transparent',
                  color: t.text0,
                  cursor: busy ? 'wait' : 'pointer',
                  opacity: busy && !running ? 0.5 : 1,
                  overflow: 'hidden',
                  transition: 'background 100ms',
                }}
                onMouseEnter={(e) => { if (!busy && !running) e.currentTarget.style.background = t.bg3; }}
                onMouseLeave={(e) => { if (!busy && !running) e.currentTarget.style.background = 'transparent'; }}>
                {/* Estrella / spinner */}
                <span style={{
                  width: 12, height: 12, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, lineHeight: 1,
                  color: running ? t.accent : t.warn,
                }}>
                  {running ? (
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      border: `1.5px solid ${t.accent}`,
                      borderTopColor: 'transparent',
                      animation: 'eco-spin 0.7s linear infinite',
                    }}/>
                  ) : '★'}
                </span>
                {/* Nombre + descripción inline en una sola fila */}
                <code style={{
                  fontFamily: t.fontMono, fontSize: 12, fontWeight: 500,
                  color: running ? t.accent : t.text0,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>/{s.name}</code>
                {desc && (
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontSize: 11, color: t.text3, lineHeight: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{desc}</span>
                )}
                {/* Quitar de favoritos */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleFav(skillIdOf(s)); }}
                  title={tr('detail.skills.unfav_tooltip')}
                  style={{
                    width: 16, height: 16, padding: 0, border: 0, borderRadius: 4,
                    background: 'transparent', color: t.text3, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, lineHeight: 1,
                    flexShrink: 0,
                    marginLeft: 'auto',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `color-mix(in oklch, ${t.err} 18%, transparent)`;
                    e.currentTarget.style.color = t.err;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = t.text3;
                  }}>×</button>
              </div>
            );
          })}
          </div>
          )}
        </>
      )}
      {err && (
        <div style={{
          marginTop: 6, padding: '6px 10px', borderRadius: 6,
          fontSize: 11, color: t.err, fontFamily: t.fontMono,
          background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
          border: `1px solid ${t.err}`,
          cursor: 'pointer',
        }} onClick={() => setErr(null)}>
          {err}
        </div>
      )}
    </div>
  );
}

// ─── AgentSidebar — UX rework ─────────────────────────────────────────────
// Mejoras de UX/UI aplicadas:
//  1) Secciones colapsables individualmente (estado persistido por bubble).
//  2) Header sticky con status del agente + título + último timestamp.
//  3) Reordenamiento dinámico: si el agente está corriendo o hay archivos
//     modificados, "Próxima acción" sube arriba; sino orden por defecto.
//  4) Quick action bar fija abajo con accesos rápidos al chat/files/terminal.
//  5) Width redimensionable con drag splitter en el borde izquierdo.
//  6) Stats con sparkline mini de mensajes/min en últimos 30 min.
//  7) Animaciones de novedad: framer collapse/expand suave; status dot pulsa.

const SIDEBAR_COLLAPSE_KEY = 'eco.detail.sidebar.collapsed';
const SIDEBAR_WIDTH_KEY = 'eco.detail.sidebar.width';
const SIDEBAR_WIDTH_MIN = 280;
const SIDEBAR_WIDTH_MAX = 520;
const SIDEBAR_WIDTH_DEFAULT = 360;

type SectionId = 'agent' | 'skills' | 'git' | 'obsidian';

function sectionCollapseStorageKey(bubbleId: string): string {
  return `eco.detail.sidebar.sections.${bubbleId}`;
}

function useSectionCollapse(bubbleId: string) {
  const key = sectionCollapseStorageKey(bubbleId);
  const [state, setState] = useState<Partial<Record<SectionId, boolean>>>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(state)); } catch { /* noop */ }
  }, [key, state]);
  return {
    isCollapsed: (s: SectionId) => !!state[s],
    toggle: (s: SectionId) => setState((p) => ({ ...p, [s]: !p[s] })),
  };
}

// Wrapper de sección con header clickeable para colapsar. Reemplaza al uso
// directo de <SectionLabel> cuando queremos comportamiento colapsable.
function CollapsibleSection({
  id, title, count, collapsed, onToggle, action, children, accentDot,
}: {
  id?: string;
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
  // Cuando hay novedad (ej. count cambió hacia arriba), el header parpadea.
  accentDot?: boolean;
}) {
  const t = useTokens();
  return (
    <div data-section={id} className="eco-card eco-panelcard">
      <button type="button" onClick={onToggle} className="eco-panelcard__head">
        <span className="eco-panelcard__title">{title}</span>
        {count != null && (
          <span className="eco-count">{count}</span>
        )}
        {accentDot && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: t.accent,
            animation: 'eco-shimmer 1.4s ease-in-out infinite',
          }}/>
        )}
        <span style={{ flex: 1 }}/>
        {action}
        <span className="eco-faint" style={{
          display: 'inline-flex',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 180ms ease',
        }}><IconChevD size={14}/></span>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}>
            <div style={{ paddingTop: 14 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Panel de contexto colapsado: chips compactos en la fila de tabs (rama, PR,
// contexto del agente, skills). Cualquiera reabre el panel.
function ContextChips({ bubble, filesCount, onExpand }: { bubble: Bubble; filesCount: number; onExpand: () => void }) {
  const t = useTokens();
  const tr = useT();
  const ws = bubble.workspace || '';
  const { data: branches } = useBranches(ws, bubble.id);
  const { pr } = useCurrentPr(ws, bubble.id);
  const status = useAgentStatus(bubble.id);
  const { skills } = useSkills(bubble.workspace);
  const tokens = status?.contextTokens ?? null;
  const limit = tokens != null && tokens > CONTEXT_STANDARD ? CONTEXT_LARGE : CONTEXT_STANDARD;
  const pct = tokens != null ? Math.min(100, Math.round((tokens / limit) * 100)) : null;
  const working = status?.state === 'working';
  const prColor = pr ? (pr.checks && pr.checks.failed > 0 ? t.err : prStateColor(t, pr.state)) : t.text3;
  const label = tr('detail.sidebar.show');
  return (
    <div className="eco-ctxchips">
      <button type="button" className="eco-chip eco-chip--btn eco-chip--lg eco-mono" onClick={onExpand} title={label}>
        <IconBranch size={13}/><span className="eco-truncate" style={{ maxWidth: 180 }}>{branches?.current ?? '–'}</span>
      </button>
      {pr && (
        <button type="button" className="eco-chip eco-chip--btn eco-chip--lg" onClick={onExpand} title={pr.title}>
          <span className="eco-dot" style={{ background: prColor }}/>
          <span className="eco-mono">#{pr.number}</span>
          {pr.checks && pr.checks.total > 0 && <span className="eco-faint">{pr.checks.passed}/{pr.checks.total}</span>}
        </button>
      )}
      {(pct != null || filesCount > 0) && <button type="button" className="eco-chip eco-chip--btn eco-chip--lg" onClick={onExpand} title={label}>
        <span className="eco-dot" style={{ background: working ? t.ok : t.text3 }}/>
        {pct != null && (
          <>
            <span className="eco-meter"><span style={{ width: `${pct}%` }}/></span>
            <span className="eco-mono">{pct}%</span>
          </>
        )}
        {filesCount > 0 && <span className="eco-faint eco-mono">{filesCount}</span>}
      </button>}
      <button type="button" className="eco-chip eco-chip--btn eco-chip--lg" onClick={onExpand} title={label}>
        <IconZap size={13}/><span className="eco-mono">{skills.length}</span>
      </button>
      <button type="button" className="eco-iconbtn eco-iconbtn--soft" onClick={onExpand} title={label} aria-label={label}>
        <IconChevD size={14}/>
      </button>
    </div>
  );
}

function AgentSidebar({
  bubble, filesChanged, onGoTab, collapsed, setCollapsed,
}: {
  bubble: Bubble;
  filesChanged: FileChange[];
  onGoTab: (tab: Tab) => void;
  onRename: (title: string) => void;
  // El colapso lo controla AgentDetail: en móvil el rail no se dibuja inline
  // y el disparador vive en el header, así que el estado tiene que ser
  // compartido entre los dos.
  collapsed: boolean;
  setCollapsed: (fn: (v: boolean) => boolean) => void;
}) {
  const filesChangedCount = filesChanged.length;
  const t = useTokens();
  const tr = useT();
  const isPhone = useIsPhone();
  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n >= SIDEBAR_WIDTH_MIN && n <= SIDEBAR_WIDTH_MAX) return n;
    } catch { /* noop */ }
    return SIDEBAR_WIDTH_DEFAULT;
  });
  const widthRef = useRef(width);
  useEffect(() => { widthRef.current = width; }, [width]);

  const sectionCollapse = useSectionCollapse(bubble.id);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, [setCollapsed]);

  // Drag para redimensionar: listener global mientras dura el drag.
  const onSplitterDown = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (e2: MouseEvent) => {
      // Drag hacia la IZQUIERDA aumenta el width (el sidebar está a la derecha).
      const dx = startX - e2.clientX;
      const next = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, startW + dx));
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try { window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(widthRef.current)); } catch { /* noop */ }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  }, []);

  // Esc colapsa el sidebar — atajo consistente.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !collapsed) {
        // Solo colapsamos si no hay un input/textarea/modal focuseado.
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        // Modal abierto? Detectamos por presencia de dialog con backdrop.
        // El portal a body crea elementos con position:fixed; saltamos.
        // (Conservador: si el target del key no es body, dejamos.)
        if (document.activeElement && document.activeElement !== document.body) return;
        toggleCollapsed();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, toggleCollapsed]);


  // Detecta "novedades" comparando el último count con el anterior — usado
  // por las secciones para parpadear el accentDot cuando algo cambió.
  const prevFilesRef = useRef(filesChangedCount);
  const [filesNovel, setFilesNovel] = useState(false);
  useEffect(() => {
    if (filesChangedCount > prevFilesRef.current) {
      setFilesNovel(true);
      const tid = setTimeout(() => setFilesNovel(false), 2500);
      return () => clearTimeout(tid);
    }
    prevFilesRef.current = filesChangedCount;
  }, [filesChangedCount]);

  // Git va FIJO arriba para que la rama actual sea siempre lo primero
  // que se ve del agente.
  const sectionOrder: SectionId[] = ['git', 'agent', 'skills', 'obsidian'];

  // En móvil colapsado no queda ni la barra de 36px: el disparador está en
  // el header y esos 36px son el 11% del ancho útil del teléfono.
  if (collapsed) {
    // En escritorio el panel colapsado vive como chips en la fila de tabs (ContextChips).
    return null;
  }

  const renderSection = (id: SectionId): ReactNode => {
    switch (id) {
      case 'skills':
        return (
          <CollapsibleSection key="skills" id="skills"
            title="Skills"
            collapsed={sectionCollapse.isCollapsed('skills')}
            onToggle={() => sectionCollapse.toggle('skills')}>
            <SkillsCard bubbleId={bubble.id} workspace={bubble.workspace}/>
          </CollapsibleSection>
        );

      case 'git':
        if (!bubble.workspace) return null;
        // Git va fijo arriba — header sin chevron ni toggle, así la rama
        // actual siempre está visible.
        return (
          <div key="git" data-section="git" className="eco-card eco-panelcard">
            <div className="eco-panelcard__title" style={{ paddingBottom: 14 }}>Git</div>
            <GitMiniDock
              workspace={bubble.workspace}
              bubbleId={bubble.id}
              baseBranch={bubble.baseBranch}
              onGoToGit={() => onGoTab('git')}
            />
          </div>
        );

      case 'agent':
        return (
          <CollapsibleSection key="agent" id="agent"
            title={tr('detail.sidebar.agent')}
            collapsed={sectionCollapse.isCollapsed('agent')}
            onToggle={() => sectionCollapse.toggle('agent')}
            accentDot={filesNovel}>
            <AgentStateCard bubbleId={bubble.id} filesCount={filesChangedCount}
              onGoToTerminal={() => onGoTab('terminal')} onGoToGit={() => onGoTab('git')}/>
          </CollapsibleSection>
        );

      case 'obsidian':
        return <SaveToObsidianButton key="obsidian" bubble={bubble}/>;
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: isPhone ? t.sheet : 'transparent',
      ...(isPhone ? {
        // Sheet a pantalla completa por encima del panel activo: un rail de
        // 360px al lado de 326px de contenido no entra de ninguna forma.
        position: 'absolute', inset: 0, zIndex: 60,
        borderLeft: 0,
      } : {
        position: 'relative',
        width, flexShrink: 0,
      }),
    }}>
      {/* Splitter — área de 6 px en el borde izquierdo. Hover muestra el
          accent; durante el drag, cursor col-resize global. Es mouse-only, así
          que en táctil no se dibuja. */}
      {!isPhone && (
        <div
          onMouseDown={onSplitterDown}
          title={tr('detail.resize_split_tooltip')}
          style={{
            position: 'absolute', left: -3, top: 0, bottom: 0, width: 6,
            cursor: 'col-resize', zIndex: 10,
            background: 'transparent',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background =
              `linear-gradient(90deg, transparent 0%, ${t.accent} 50%, transparent 100%)`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }}
        />
      )}

      {/* Botón discreto arriba a la derecha para colapsar el panel. Esc
          también funciona (atajo registrado en el sidebar). */}
      <button type="button" onClick={toggleCollapsed}
        title={tr('detail.sidebar.hide')} aria-label={tr('detail.sidebar.hide')}
        className="eco-edge-btn"
        style={{ position: 'absolute', top: isPhone ? 26 : 12, right: isPhone ? 32 : 16, zIndex: 8, boxShadow: 'none' }}>
        <IconChevU size={15}/>
      </button>

      {/* Scrollable area — top padding ajustado: el botón flotante de
          colapsar (›) vive en top:8/right:8 y la primera sección (Git)
          tiene su header a la izquierda, así que no se traslapan. */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: isPhone ? '16px 20px 20px' : '0 2px 4px 0',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {sectionOrder.map(renderSection)}
      </div>
    </div>
  );
}

function remoteSlugOf(title: string): string {
  return (title || 'eco')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'eco';
}

function remoteStorageKey(bubbleId: string): string {
  return `eco.remote.${bubbleId}`;
}

function readRemoteSlug(bubbleId: string): string | null {
  try { return window.localStorage.getItem(remoteStorageKey(bubbleId)); } catch { return null; }
}

function writeRemoteSlug(bubbleId: string, slug: string | null) {
  try {
    if (slug) window.localStorage.setItem(remoteStorageKey(bubbleId), slug);
    else window.localStorage.removeItem(remoteStorageKey(bubbleId));
  } catch { /* noop */ }
}

// Manda `/remote-control <slug>` directo al PTY del agente (donde corre
// Claude Code CLI, que sí soporta el comando). El SDK del chat NO lo soporta
// — por eso enviar el slash al chat devolvía "no disponible en este
// environment". Esta función abre un WS efímero al /ws/pty, espera a que
// el shell + Claude CLI estén listos, escribe el comando y cierra el WS.
// El PTY persiste en el backend, así que el remote control queda activo.
async function activateRemoteControlViaPty(opts: {
  bubbleId: string;
  workspace: string;
  slug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return writeToBubblePty({
    bubbleId: opts.bubbleId,
    workspace: opts.workspace,
    text: `/remote-control ${opts.slug}\r`,
  });
}

// ─── Helper: emite un evento global para que otras vistas (Dashboard graph)
//     reaccionen al cambio de estado del remote control sin tener que re-fetch.
function emitRemoteChange(bubbleId: string, slug: string | null) {
  try {
    window.dispatchEvent(new CustomEvent('eco:remote-changed', { detail: { bubbleId, slug } }));
  } catch { /* noop */ }
}

function RemoteControlNavButton({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const tr = useT();
  const isPhone = useIsPhone();
  const [active, setActive] = useState<string | null>(() => readRemoteSlug(bubble.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const slug = remoteSlugOf(bubble.title);
  const isOn = active !== null;

  async function activate() {
    if (busy) return;
    setBusy(true); setErr(null);
    const r = await activateRemoteControlViaPty({
      bubbleId: bubble.id,
      workspace: bubble.workspace ?? '',
      slug,
    });
    setBusy(false);
    if (r.ok) {
      writeRemoteSlug(bubble.id, slug);
      setActive(slug);
      emitRemoteChange(bubble.id, slug);
    } else {
      setErr(r.error);
    }
  }
  function deactivate() {
    writeRemoteSlug(bubble.id, null);
    setActive(null);
    emitRemoteChange(bubble.id, null);
  }

  const box = isPhone ? 40 : 44;
  const tipTitle = busy
    ? tr('detail.remote.activating_short')
    : err ? tr('detail.remote.err_tooltip', { err })
      : isOn ? tr('detail.remote.on') : tr('detail.remote.off');
  const tipSub = busy ? null : isOn ? tr('detail.remote.click_disable') : tr('detail.remote.click_enable');
  return (
    <span className="eco-tipwrap">
      <button
        type="button"
        onClick={isOn ? deactivate : (() => void activate())}
        disabled={busy}
        aria-label={isOn ? tr('detail.remote.disable') : tr('detail.remote.enable')}
        className="eco-iconbtn"
        style={{
          position: 'relative', width: box, height: box, flexShrink: 0, background: t.card,
          cursor: busy ? 'wait' : 'pointer',
          ...(err ? { boxShadow: `inset 0 0 0 1px ${t.err}` } : null),
        }}
      >
        <IconSmartphone size={20}/>
        {busy ? (
          <svg width="10" height="10" viewBox="0 0 24 24"
            style={{ position: 'absolute', top: 8, right: 8, animation: 'eco-spin 1s linear infinite' }}>
            <circle cx="12" cy="12" r="9" fill="none" stroke={t.text2} strokeWidth="3" strokeDasharray="14 50" strokeLinecap="round"/>
          </svg>
        ) : isOn ? (
          <span className="eco-iconbtn__dot" style={{ background: t.ok }}/>
        ) : null}
      </button>
      <span className="eco-tipbox" role="tooltip">
        <b>
          <span className="eco-dot" style={{ background: isOn ? t.ok : t.text3, opacity: 1 }}/>
          {tipTitle}
        </b>
        {tipSub && <span>{tipSub}</span>}
      </span>
    </span>
  );
}

function SaveToObsidianButton({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const tr = useT();
  const { status: obs } = useObsidian();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Se muestra si Obsidian está activado y hay una forma válida de guardar:
  //  - modo builtin: el vault debe existir.
  //  - modo custom: debe haber un comando configurado.
  if (!obs.enabled) return null;
  if (obs.mode === 'custom') {
    if (!obs.customCommand.trim()) return null;
  } else {
    if (!obs.vaultExists) return null;
  }

  async function save() {
    setBusy(true);
    setResult(null);
    const r = await saveSessionToObsidian({
      bubbleId: bubble.id,
      title: bubble.title || tr('detail.obsidian.session_default'),
      workspace: bubble.workspace ?? '',
      createdAt: bubble.createdAt,
      updatedAt: bubble.updatedAt,
      messages: bubble.messages.map((m) => ({
        role: (m.role === 'assistant' || m.role === 'user' || m.role === 'system' || m.role === 'tool') ? m.role : 'assistant',
        text: m.text || '',
        createdAt: m.createdAt,
      })),
    });
    if (r.ok) setResult({ ok: true, text: tr('detail.obsidian.saved', { path: r.path.split('/').slice(-2).join('/') }) });
    else setResult({ ok: false, text: r.error });
    setBusy(false);
    setTimeout(() => setResult(null), 5000);
  }

  return (
    <div>
      <SectionLabel>{tr('detail.obsidian.label')}</SectionLabel>
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        style={{
          width: '100%', padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${t.glassBorder}`,
          background: t.bg2,
          color: t.text0,
          cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
          opacity: busy ? 0.6 : 1,
          transition: 'background 140ms',
        }}
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = t.bg3; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = t.bg2; }}>
        <IconLayers size={13}/>
        {busy ? tr('detail.obsidian.saving') : tr('detail.obsidian.save_btn')}
      </button>
      {result && (
        <div style={{
          marginTop: 6, padding: '6px 10px', borderRadius: 6,
          background: result.ok ? t.accentFaint : t.bg2,
          color: result.ok ? t.accent : t.err,
          fontSize: 11, fontFamily: t.fontMono, lineHeight: 1.4,
          wordBreak: 'break-word',
        }}>{result.text}</div>
      )}
    </div>
  );
}

// Wrapper que mantiene el BrowserPanel montado entre cambios de pestaña.
// Solo se monta la PRIMERA vez que el user entra al tab Navegador; después
// queda vivo y se oculta con display:none cuando cambiás de tab. Eso preserva
// el iframe (no recarga la página), su scroll, cookies, etc.
function KeepAliveBrowser({ visible, slot, bubbleId, workspace, immersive, onToggleImmersive }: {
  visible: boolean; slot: React.CSSProperties; bubbleId: string; workspace: string;
  immersive?: boolean; onToggleImmersive?: () => void;
}) {
  const [hasMounted, setHasMounted] = useState(visible);
  useEffect(() => { if (visible && !hasMounted) setHasMounted(true); }, [visible, hasMounted]);
  if (!hasMounted) return null;
  return (
    <div style={slot}>
      <BrowserPanel bubbleId={bubbleId} workspace={workspace} immersive={immersive} onToggleImmersive={onToggleImmersive}/>
    </div>
  );
}

// Mismo patrón que KeepAliveBrowser: el ServerPanel monta UNA SOLA VEZ (la
// primera vez que entrás a la tab Server) y queda vivo con display:none al
// cambiar de tab. Sin esto, cada vuelta a la tab Server remontaba el panel
// → re-fetch del ring buffer de logs (hasta 64 KB por slot) + re-render
// completo del xterm — lento y con parpadeo. Manteniéndolo vivo, el stream
// WS de logs sigue appendando en background y al volver ya está todo ahí.
function KeepAliveServer({ visible, slot, bubbleId, workspace }: { visible: boolean; slot: React.CSSProperties; bubbleId: string; workspace: string }) {
  const [hasMounted, setHasMounted] = useState(visible);
  useEffect(() => { if (visible && !hasMounted) setHasMounted(true); }, [visible, hasMounted]);
  if (!hasMounted) return null;
  return (
    <div style={slot}>
      <ServerPanel bubbleId={bubbleId} workspace={workspace} visible={visible}/>
    </div>
  );
}

// Mismo patrón: FilesPanel queda montado una vez visitado para preservar el
// EditorView de CodeMirror (cursor, scroll, selección) + openFiles en memoria
// + el árbol cargado. Sin esto, cada vuelta a la tab re-fetcheaba todo y
// reseteaba el editor a la línea 1.
function KeepAliveFiles({ visible, slot, bubbleId, workspace }: { visible: boolean; slot: React.CSSProperties; bubbleId: string; workspace: string }) {
  const [hasMounted, setHasMounted] = useState(visible);
  useEffect(() => { if (visible && !hasMounted) setHasMounted(true); }, [visible, hasMounted]);
  if (!hasMounted) return null;
  return (
    <div style={slot}>
      <FilesPanel bubbleId={bubbleId} workspace={workspace}/>
    </div>
  );
}

