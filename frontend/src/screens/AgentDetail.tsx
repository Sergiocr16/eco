import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '@/lib/api';
import { useTokens } from '@/design/theme';
import { RealTerminal, type AgentCli } from '@/components/RealTerminal';
import { SkillsPicker } from '@/components/SkillsPicker';
import { useSkills, type SkillInfo } from '@/hooks/useSkills';
import { useSkillFavorites, skillIdOf } from '@/hooks/useSkillFavorites';
import { useBubbleBusy } from '@/hooks/usePtyBusyNotifier';
import { useCliAuth } from '@/hooks/useCliAuth';
import { ecoToken } from '@/lib/eco-config';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { useGitChanges } from '@/hooks/useGitChanges';
import { useCategories } from '@/hooks/useCategories';
import { GitPanel } from '@/components/GitPanel/GitPanel';
import { GitMiniDock } from '@/components/GitMiniDock';
import { BrowserPanel } from '@/components/BrowserPanel';
import { ServerPanel } from '@/components/ServerPanel';
import { FilesPanel } from '@/components/FilesPanel/FilesPanel';
import { NotesPanel } from '@/components/NotesPanel/NotesPanel';
import { GitBusyToast } from '@/components/GitBusyToast';
import {
  Btn, IconBtn, Pill, AgentGlyph, SectionLabel, bubbleLetter,
} from '@/design/primitives';
import {
  IconArrowL, IconStop, IconMore,
  IconTerminal, IconFile, IconLayers, IconSend, IconMic, IconGlobe, IconCpu,
  IconCheck, IconX, IconGithub, IconEdit, IconTrash,
  IconAgent, IconFolder, IconArchive, IconNewWindow,
  type IconProps,
} from '@/design/icons';
import type { Bubble } from '@/lib/types';
import { stateColor, type AgentState } from '@/design/tokens';
import { useT } from '@/hooks/useI18n';
import { useObsidian, saveSessionToObsidian } from '@/hooks/useObsidian';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';

function HeaderMenu({
  workspaces, currentWorkspace, onClose, onRename, onChangeWorkspace,
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
  const t = useTokens();
  const tr = useT();
  const [wsOpen, setWsOpen] = useState(false);
  const { categories } = useCategories();
  useEffect(() => {
    if (wsOpen) return;
    const onDocClick = () => onClose();
    document.addEventListener('click', onDocClick, { once: true });
    return () => document.removeEventListener('click', onDocClick);
  }, [onClose, wsOpen]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 38, right: 0, zIndex: 30,
        minWidth: 220, padding: 4,
        background: t.bg1, border: `1px solid ${t.glassBorder}`,
        borderRadius: 12, boxShadow: t.shadowLg,
        display: 'flex', flexDirection: 'column',
      }}>
      <button type="button" onClick={onRename} style={menuItemStyleAt(t)}>
        <IconAgent size={13}/> {tr('detail.menu.rename')}
      </button>
      {/* Categoría — solo si hay categorías configuradas en Settings. */}
      {categories.length > 0 && (
        <>
          <div style={{
            fontSize: 9.5, color: t.text3, letterSpacing: 0.4,
            textTransform: 'uppercase', fontWeight: 600,
            padding: '6px 10px 3px',
          }}>{tr('dash.category.label')}</div>
          {categories.map((c) => {
            const active = currentCategoryIds?.includes(c.id) ?? false;
            return (
              <button
                key={c.id}
                type="button"
                // Toggle multi-selección: el menú queda abierto para marcar varias.
                onClick={() => onToggleCategory(c.id)}
                style={{ ...menuItemStyleAt(t), color: active ? t.text0 : t.text1 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: c.color, flexShrink: 0,
                  boxShadow: active ? `0 0 0 2px ${t.bg1}, 0 0 0 3px ${c.color}` : 'none',
                }}/>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                {active && <IconCheck size={12}/>}
              </button>
            );
          })}
          {(currentCategoryIds?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => { onToggleCategory(undefined); onClose(); }}
              style={{ ...menuItemStyleAt(t), color: t.text3 }}>
              <IconX size={11}/> {tr('dash.category.none')}
            </button>
          )}
          <div style={{ height: 1, background: t.glassBorder, margin: '4px 8px' }}/>
        </>
      )}
      <button type="button" onClick={() => setWsOpen((v) => !v)} style={menuItemStyleAt(t)}>
        <IconFolder size={12}/>
        <span style={{ flex: 1 }}>{tr('detail.menu.change_workspace')}</span>
        <span style={{
          fontFamily: t.fontMono, fontSize: 10.5, color: t.text3,
          maxWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{currentWorkspace.split('/').filter(Boolean).slice(-2).join('/') || '—'}</span>
      </button>
      {wsOpen && (
        <div style={{
          marginLeft: 22, padding: 4, display: 'flex', flexDirection: 'column', gap: 1,
          maxHeight: 200, overflow: 'auto',
          borderLeft: `1px solid ${t.glassBorder}`,
        }}>
          {workspaces.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 11, color: t.text3 }}>
              {tr('detail.menu.workspace_empty_picker')}
            </div>
          ) : workspaces.map((ws) => (
            <button
              key={ws} type="button"
              onClick={() => { setWsOpen(false); onChangeWorkspace(ws); }}
              style={{
                ...menuItemStyleAt(t), fontFamily: t.fontMono, fontSize: 11,
                color: ws === currentWorkspace ? t.accent : t.text1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
              {ws}
            </button>
          ))}
        </div>
      )}
      {onOpenInNewWindow && (
        <button type="button" onClick={onOpenInNewWindow} style={menuItemStyleAt(t)}>
          <IconNewWindow size={12}/> {tr('detail.menu.open_window')}
        </button>
      )}
      <div style={{ height: 1, background: t.glassBorder, margin: '4px 8px' }}/>
      <button type="button" onClick={onCloseBubble} style={{ ...menuItemStyleAt(t), color: t.text1 }}>
        <IconArchive size={12}/> {tr('detail.menu.archive')}
      </button>
    </div>
  );
}

function menuItemStyleAt(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderRadius: 8, border: 0, background: 'transparent',
    color: t.text1, fontFamily: t.fontSans, fontSize: 12.5, cursor: 'pointer',
    textAlign: 'left' as const,
  };
}

type Props = {
  bubble: Bubble;
  workspaces: string[];
  onBack: () => void;
  onRename: (title: string) => void;
  onClose: () => void;
  onChangeWorkspace: (workspace: string) => void;
  onToggleCategory: (categoryId: string | undefined) => void;
  // Dictado a la terminal: el botón de la cabecera enciende el mic en modo
  // dictado; lo dictado se acumula en `dictationText` y se muestra como burbuja
  // arriba. "Enviar a terminal" lo escribe en el PTY principal sin Enter.
  // Soporte de dictado en esta plataforma (false en Windows/Linux empaquetado,
  // donde no hay STT nativo). Cuando es false se oculta el botón de dictar.
  dictationSupported?: boolean;
  dictationActive?: boolean;
  dictationText?: string;
  onStartDictation?: () => void;
  onSendDictation?: () => void;
  onCancelDictation?: () => void;
  onClearDictation?: () => void;
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

// Burbuja de dictado a la terminal. Aparece arriba (encima del contenido de
// pestañas, visible en cualquier tab) mientras el dictado está activo. Muestra
// lo dictado en vivo y permite enviarlo al PTY principal sin Enter.
function DictationBar({
  text, onSend, onClear, onCancel,
}: {
  text: string;
  onSend: () => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const hasText = text.trim().length > 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 24px',
      borderBottom: `1px solid ${t.glassBorder}`,
      background: `color-mix(in oklch, ${t.accent} 8%, transparent)`,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        flexShrink: 0, marginTop: 4,
        color: t.accent, fontSize: 11.5, fontWeight: 600,
        fontFamily: t.fontSans, whiteSpace: 'nowrap',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: t.accent,
          animation: 'eco-pulse 1.2s ease-in-out infinite',
        }}/>
        {tr('detail.btn.dictating')}
      </span>
      <div style={{
        flex: 1, minWidth: 0,
        fontSize: 14, lineHeight: 1.5,
        color: hasText ? t.text1 : t.text3,
        fontFamily: t.fontSans,
        maxHeight: 120, overflowY: 'auto',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {hasText ? text : tr('detail.dictation.placeholder')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Btn icon={IconSend} kind="primary" size="sm" onClick={onSend} disabled={!hasText}>
          {tr('detail.dictation.send')}
        </Btn>
        <Btn icon={IconTrash} kind="ghost" size="sm" onClick={onClear} disabled={!hasText}
          title={tr('detail.dictation.clear')}/>
        <Btn icon={IconX} kind="secondary" size="sm" onClick={onCancel}>
          {tr('detail.dictation.cancel')}
        </Btn>
      </div>
    </div>
  );
}

export function AgentDetail({
  bubble, workspaces, onBack, onRename, onClose, onChangeWorkspace,
  onToggleCategory,
  dictationSupported = false, dictationActive = false, dictationText = '',
  onStartDictation, onSendDictation, onCancelDictation, onClearDictation,
  onOpenInNewWindow, solo: _solo = false,
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
  // Tab activo persistido por agente — al volver a entrar al detalle del
  // mismo agente, recuperamos el último tab que vimos. Las entradas viejas
  // con 'chat' (tab removido) caen al default.
  const tabStorageKey = `eco.detail.tab.${bubble.id}`;
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const saved = window.localStorage.getItem(tabStorageKey);
      if (saved && (ALL_TABS as ReadonlyArray<string>).includes(saved)) return saved as Tab;
    } catch { /* noop */ }
    return 'terminal';
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    try { window.localStorage.setItem(tabStorageKey, next); } catch { /* noop */ }
  };
  // Orden global de los tabs (persistido para TODOS los agentes en
  // `eco.detail.tab.order`). El user los reordena por drag-and-drop.
  const [tabOrder, setTabOrder] = useState<Tab[]>(() => loadTabOrder());
  const [draggingTabId, setDraggingTabId] = useState<Tab | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<Tab | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bubble.title);
  const [menuOpen, setMenuOpen] = useState(false);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => ecoOn('eco:switch_tab', (e) => {
    if (e.bubbleId && e.bubbleId !== bubble.id) return;
    setTab(e.tab);
  }), [bubble.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <GitBusyToast bubbleId={bubble.id}/>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 24px', borderBottom: `1px solid ${t.glassBorder}`,
      }}>
        <IconBtn icon={IconArrowL} size={32} onClick={onBack}/>
        <AgentGlyph size={40} state={state} letter={bubbleLetter(bubble.title)} accent={bubble.accent}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                  fontFamily: t.fontSans, fontSize: 18, fontWeight: 600,
                  color: t.text0, letterSpacing: -0.3, outline: 'none',
                  minWidth: 200, maxWidth: 380,
                }}
              />
            ) : (
              <h2
                onDoubleClick={() => { setDraft(bubble.title); setRenaming(true); }}
                title={tr('dash.bubble.rename_tip')}
                style={{
                  margin: 0, fontFamily: t.fontSans, fontSize: 18, fontWeight: 600,
                  color: t.text0, letterSpacing: -0.3, cursor: 'text',
                }}>{bubble.title}</h2>
            )}
            <Pill color={sColor}>{STATE_LABELS_I18N[state] || tr('state.idle')}</Pill>
            {/* Chips de categorías — clickeables: abren el menú para cambiarlas.
                "arriba donde está el nombre", como pidió el user. */}
            {bubbleCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
                title={tr('dash.category.change_tooltip')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 9px', borderRadius: 999,
                  background: `color-mix(in oklch, ${category.color} 16%, transparent)`,
                  border: `1px solid color-mix(in oklch, ${category.color} 45%, transparent)`,
                  color: category.color, fontSize: 11, fontWeight: 500,
                  fontFamily: t.fontSans, cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: category.color }}/>
                {category.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 11.5, color: t.text2 }}>{tr('detail.header.bubble')}</span>
            <span style={{ color: t.text3 }}>·</span>
            <span style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.text2 }}>
              {bubble.workspace || '—'}
            </span>
            <span style={{ color: t.text3 }}>·</span>
            <span style={{ fontSize: 11.5, color: t.text2 }}>
              {tr('detail.header.id')} <span style={{ fontFamily: t.fontMono, color: t.text1 }}>{bubble.id.slice(0, 10)}</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, position: 'relative', alignItems: 'center' }}>
          {dictationSupported && (
            <Btn
              icon={dictationActive ? IconStop : IconMic}
              kind={dictationActive ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => { if (dictationActive) onCancelDictation?.(); else onStartDictation?.(); }}
              title={dictationActive ? tr('detail.btn.dictating_title') : tr('detail.btn.dictate_title')}
            >
              {dictationActive ? tr('detail.btn.dictating') : tr('detail.btn.dictate')}
            </Btn>
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

      {dictationActive && (
        <DictationBar
          text={dictationText}
          onSend={() => onSendDictation?.()}
          onClear={() => onClearDictation?.()}
          onCancel={() => onCancelDictation?.()}
        />
      )}

      <div style={{
        position: 'relative',
        display: 'flex', gap: 2, padding: '0 24px',
        borderBottom: `1px solid ${t.glassBorder}`,
        alignItems: 'center',
      }}>
        {tabOrder.map((id) => {
          const def = TAB_DEFS[id];
          const badge = id === 'git' ? filesChanged.length : undefined;
          return (
            <TabBtn
              key={id}
              tabId={id}
              active={tab === id}
              onClick={() => setTab(id)}
              label={def.labelKey === 'Git' ? 'Git' : tr(def.labelKey)}
              icon={def.icon}
              badge={badge}
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
        })}
        <div style={{ flex: 1 }}/>
        <RemoteControlNavButton bubble={bubble}/>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {tab === 'terminal' && <TerminalTabs bubble={bubble}/>}
          {tab === 'git' && (
            <GitPanel
              workspace={bubble.workspace}
              bubbleId={bubble.id}
              filesChanged={filesChanged}
              gitChangesLoading={gitChangesLoading}
              onRename={onRename}
            />
          )}
          <KeepAliveFiles visible={tab === 'files'} bubbleId={bubble.id} workspace={bubble.workspace}/>
          {tab === 'notes' && <NotesPanel bubble={bubble}/>}
          {/* Navegador queda MONTADO siempre una vez abierto, solo se oculta cuando
              cambiás de pestaña. Así el iframe no recarga y la sesión del browser
              (cookies, localStorage del sitio, scroll position) se preserva. */}
          <KeepAliveBrowser visible={tab === 'browser'} bubbleId={bubble.id} workspace={bubble.workspace}/>
          <KeepAliveServer visible={tab === 'server'} bubbleId={bubble.id} workspace={bubble.workspace}/>
        </div>
        <AgentSidebar
          bubble={bubble}
          filesChangedCount={filesChanged.length}
          onGoTab={(target) => setTab(target)}
          onRename={onRename}
        />
      </div>
    </div>
  );
}

type FileChange = { path: string; change: string; agent: string; unstaged?: boolean };

function TabBtn({
  active, onClick, label, icon: Icon, badge,
  tabId, dragOver, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}: {
  active: boolean; onClick: () => void; label: string; icon: (p: IconProps) => JSX.Element; badge?: number;
  tabId?: string;
  dragOver?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
}) {
  const t = useTokens();
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
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '12px 14px', background: 'transparent', border: 0,
        borderBottom: `2px solid ${active ? t.accent : 'transparent'}`,
        color: active ? t.text0 : t.text2, cursor: 'pointer',
        fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
        transition: 'color 140ms', marginBottom: -1,
        // Marcador visual durante el drag: barra vertical del color accent
        // del lado izquierdo del target.
        boxShadow: dragOver ? `inset 3px 0 0 ${t.accent}` : 'none',
      }}
    >
      <Icon size={14}/>
      {label}
      {badge != null && badge > 0 && (
        <span style={{
          padding: '1px 6px', background: active ? t.accentFaint : t.bg3,
          color: active ? t.accent : t.text2,
          borderRadius: 999, fontSize: 10, fontWeight: 500, fontFamily: t.fontMono,
        }}>{badge}</span>
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
  const t = useTokens();
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 10px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg0,
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
          style={{
            marginLeft: 4,
            padding: '4px 9px', borderRadius: 7, border: `1px dashed ${t.glassBorder}`,
            background: 'transparent', color: t.text2, cursor: 'pointer',
            fontFamily: t.fontSans, fontSize: 12, lineHeight: 1,
          }}
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
  const t = useTokens();
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
        padding: 24, background: '#0c0e14', color: '#e5e7eb',
      }}>
        <div style={{ fontFamily: t.fontSans, fontSize: 14, fontWeight: 600 }}>
          {tr('detail.terminal.codex.missing.title')}
        </div>
        <div style={{ fontFamily: t.fontSans, fontSize: 12.5, color: '#9ca3af', textAlign: 'center', maxWidth: 420, lineHeight: 1.6 }}>
          {tr('detail.terminal.codex.missing.desc')}
        </div>
        <code style={{
          fontFamily: t.fontMono, fontSize: 12, padding: '8px 12px', borderRadius: 7,
          background: '#161923', color: '#e5e7eb', border: '1px solid #262a36',
        }}>npm i -g @openai/codex</code>
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          style={{
            marginTop: 4, padding: '6px 14px', borderRadius: 7,
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
  const t = useTokens();
  const tr = useT();
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: onClose ? '4px 6px 4px 10px' : '4px 10px',
        borderRadius: 7,
        background: active ? t.bg3 : 'transparent',
        color: active ? t.accent : t.text2,
        cursor: 'pointer',
        fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
        transition: 'background 140ms, color 140ms',
        userSelect: 'none',
      }}
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
    token: ecoToken(),
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
          padding: '12px 14px', borderRadius: 12,
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
              fontFamily: t.fontSans, fontSize: 10.5, fontWeight: 600,
              letterSpacing: 0.4, textTransform: 'uppercase',
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
              padding: '1px 7px', background: t.bg3, borderRadius: 999,
              fontSize: 10, color: t.text1, letterSpacing: 0,
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
                  fontFamily: t.fontMono, fontSize: 11.5, fontWeight: 600,
                  color: running ? t.accent : t.text0,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>/{s.name}</code>
                {desc && (
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontSize: 10.5, color: t.text3, lineHeight: 1,
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

type SectionId = 'skills' | 'quick' | 'git' | 'stats' | 'obsidian';

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
    <div data-section={id}>
      <button type="button" onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 4px 10px',
          border: 0, background: 'transparent',
          color: t.text2, cursor: 'pointer',
          fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
          letterSpacing: 0.5, textTransform: 'uppercase',
          textAlign: 'left',
        }}>
        <span style={{
          fontSize: 16, opacity: 0.85, color: t.text1,
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 180ms ease',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, lineHeight: 1,
        }}>▾</span>
        <span>{title}</span>
        {count != null && (
          <span style={{
            padding: '1px 7px', background: t.bg3, borderRadius: 999,
            fontSize: 10, color: t.text1, letterSpacing: 0,
          }}>{count}</span>
        )}
        {accentDot && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: t.accent, boxShadow: `0 0 6px ${t.accent}`,
            animation: 'eco-shimmer 1.4s ease-in-out infinite',
          }} title="Hay novedades"/>
        )}
        <span style={{ flex: 1 }}/>
        {action}
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}>
            <div style={{ paddingTop: 2 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Quick actions inline (sin SectionLabel ni footer fijo). Va como una
// "sección" más del flow del sidebar.
function QuickActions({
  filesChangedCount, onGoTab,
}: {
  filesChangedCount: number;
  onGoTab: (tab: Tab) => void;
}) {
  const t = useTokens();
  const tr = useT();
  type QA = {
    label: string; icon: ReactNode; onClick: () => void;
    badge?: number; disabled?: boolean; tooltip?: string;
  };
  const actions: QA[] = [
    {
      label: tr('cmd.tab.files'), icon: <IconFile size={12}/>,
      onClick: () => onGoTab('git'),
      badge: filesChangedCount > 0 ? filesChangedCount : undefined,
      tooltip: tr('detail.action.files_tooltip'),
    },
    {
      label: tr('cmd.tab.terminal'), icon: <IconTerminal size={12}/>,
      onClick: () => onGoTab('terminal'),
      tooltip: tr('detail.action.terminal_tooltip'),
    },
  ];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${actions.length}, 1fr)`,
      gap: 6,
    }}>
      {actions.map((a, i) => (
        <button key={i} type="button" onClick={a.onClick} disabled={a.disabled}
          title={a.tooltip ?? a.label}
          style={{
            position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '8px 4px',
            border: `1px solid ${t.glassBorder}`, borderRadius: 8,
            background: t.bg2,
            color: t.text1, cursor: a.disabled ? 'not-allowed' : 'pointer',
            opacity: a.disabled ? 0.4 : 1,
            fontFamily: t.fontSans, fontSize: 10, fontWeight: 500,
            transition: 'background 120ms, border-color 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = t.bg3;
            e.currentTarget.style.borderColor = t.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = t.bg2;
            e.currentTarget.style.borderColor = t.glassBorder;
          }}>
          <span style={{
            width: 24, height: 24, borderRadius: 6,
            background: t.bg3, color: t.text1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{a.icon}</span>
          <span>{a.label}</span>
          {a.badge != null && (
            <span style={{
              position: 'absolute', top: 4, right: 6,
              minWidth: 16, height: 16, padding: '0 5px',
              borderRadius: 999,
              background: t.accent, color: t.accentOn,
              fontSize: 9, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxSizing: 'border-box',
            }}>{a.badge > 99 ? '99+' : a.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function CollapsedBar({ onExpand, bubble }: { onExpand: () => void; bubble: Bubble }) {
  const t = useTokens();
  const tr = useT();
  const animated = bubble.status === 'thinking' || bubble.status === 'executing'
    || bubble.status === 'running' || bubble.status === 'pending';
  const color = animated ? t.warn : t.text3;
  return (
    <div style={{
      width: 36, flexShrink: 0,
      borderLeft: `1px solid ${t.glassBorder}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      padding: '12px 0',
    }}>
      <button
        type="button"
        onClick={onExpand}
        title={tr('detail.sidebar.show')}
        style={{
          width: 30, height: 30, border: 0, borderRadius: 8,
          background: 'transparent', color: t.text1, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.fontMono, fontSize: 18, fontWeight: 600,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>‹</button>
      {/* Dot de status — visible aunque el panel esté colapsado */}
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color,
        boxShadow: animated ? `0 0 6px ${color}` : 'none',
        animation: animated ? 'eco-shimmer 1.4s ease-in-out infinite' : 'none',
      }} title={animated ? tr('detail.status.active') : tr('detail.status.inactive')}/>
    </div>
  );
}

function AgentSidebar({
  bubble, filesChangedCount, onGoTab,
}: {
  bubble: Bubble;
  filesChangedCount: number;
  onGoTab: (tab: Tab) => void;
  onRename: (title: string) => void;
}) {
  const t = useTokens();
  const tr = useT();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'; } catch { return false; }
  });
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
  }, []);

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

  const min = Math.max(1, Math.round((Date.now() - bubble.createdAt) / 60_000));

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
  const sectionOrder: SectionId[] = ['git', 'skills', 'quick', 'stats', 'obsidian'];

  if (collapsed) {
    return <CollapsedBar onExpand={toggleCollapsed} bubble={bubble}/>;
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

      case 'quick':
        return (
          <QuickActions key="quick"
            filesChangedCount={filesChangedCount}
            onGoTab={onGoTab}/>
        );

      case 'git':
        if (!bubble.workspace) return null;
        // Git va fijo arriba — header sin chevron ni toggle, así la rama
        // actual siempre está visible.
        return (
          <div key="git" data-section="git">
            <div style={{
              padding: '6px 4px 10px',
              color: t.text2,
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
              letterSpacing: 0.5, textTransform: 'uppercase',
            }}>Git</div>
            <GitMiniDock
              workspace={bubble.workspace}
              bubbleId={bubble.id}
              baseBranch={bubble.baseBranch}
              onGoToGit={() => onGoTab('git')}
            />
          </div>
        );

      case 'stats':
        return (
          <CollapsibleSection key="stats" id="stats"
            title={tr('detail.sidebar.stats')}
            collapsed={sectionCollapse.isCollapsed('stats')}
            onToggle={() => sectionCollapse.toggle('stats')}
            accentDot={filesNovel}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatBox
                label={tr('detail.stat.last_activity')}
                value={fmtAgo(bubble.updatedAt)}
                sub={`activo ${min}m`}/>
              <StatBox
                label={tr('detail.stat.files_changed')}
                value={String(filesChangedCount)}
                onClick={filesChangedCount > 0 ? () => onGoTab('git') : undefined}/>
            </div>
          </CollapsibleSection>
        );

      case 'obsidian':
        return <SaveToObsidianButton key="obsidian" bubble={bubble}/>;
    }
  };

  return (
    <div style={{
      width, flexShrink: 0,
      borderLeft: `1px solid ${t.glassBorder}`,
      display: 'flex', flexDirection: 'column',
      position: 'relative',
      background: t.bg0,
    }}>
      {/* Splitter — área de 6 px en el borde izquierdo. Hover muestra el
          accent; durante el drag, cursor col-resize global. */}
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

      {/* Botón discreto arriba a la derecha para colapsar el panel. Esc
          también funciona (atajo registrado en el sidebar). */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 8,
      }}>
        <button type="button" onClick={toggleCollapsed}
          title="Ocultar panel (Esc)"
          style={{
            width: 30, height: 30, border: 0, borderRadius: 8,
            background: 'transparent', color: t.text2, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'monospace', fontSize: 18, fontWeight: 600,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>›</button>
      </div>

      {/* Scrollable area — top padding ajustado: el botón flotante de
          colapsar (›) vive en top:8/right:8 y la primera sección (Git)
          tiene su header a la izquierda, así que no se traslapan. */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: '14px 18px 20px',
        display: 'flex', flexDirection: 'column', gap: 18,
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
  token: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return writeToBubblePty({
    bubbleId: opts.bubbleId,
    workspace: opts.workspace,
    text: `/remote-control ${opts.slug}\r`,
    token: opts.token,
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
      token: ecoToken(),
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

  return (
    <button
      type="button"
      onClick={isOn ? deactivate : (() => void activate())}
      disabled={busy}
      title={busy
        ? tr('detail.remote.activating')
        : isOn
          ? tr('detail.remote.running_tooltip', { slug: active ?? '' })
          : err
            ? tr('detail.remote.err_tooltip', { err })
            : tr('detail.remote.start_tooltip', { slug })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 26, padding: '0 10px',
        marginBottom: 4,
        borderRadius: 13,
        border: `1px solid ${err ? t.err : t.glassBorder}`,
        background: 'transparent',
        color: t.text1,
        fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
        cursor: busy ? 'wait' : 'pointer',
        transition: 'background 140ms, border-color 140ms',
      }}
      onMouseEnter={(e) => {
        if (!busy) (e.currentTarget as HTMLButtonElement).style.background = t.bg2;
      }}
      onMouseLeave={(e) => {
        if (!busy) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {/* Indicador: dot verde si corriendo, spinner sutil si activando, play si apagado */}
      <span style={{
        width: 10, height: 10,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {busy ? (
          <svg width="10" height="10" viewBox="0 0 24 24" style={{ animation: 'eco-spin 1s linear infinite' }}>
            <circle cx="12" cy="12" r="9" fill="none" stroke={t.text3} strokeWidth="2.5" strokeDasharray="14 50" strokeLinecap="round"/>
          </svg>
        ) : isOn ? (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: t.ok,
          }}/>
        ) : (
          <svg width="8" height="8" viewBox="0 0 24 24" fill={t.text2}>
            <polygon points="7,5 19,12 7,19"/>
          </svg>
        )}
      </span>
      <span>
        {busy
          ? tr('detail.remote.activating_short')
          : isOn ? tr('detail.remote.disable') : tr('detail.remote.enable')}
      </span>
    </button>
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
          fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500,
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
          fontSize: 10.5, fontFamily: t.fontMono, lineHeight: 1.4,
          wordBreak: 'break-word',
        }}>{result.text}</div>
      )}
    </div>
  );
}

function StatBox({ label, value, sub, onClick }: {
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
}) {
  const t = useTokens();
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      style={{
        padding: 10, background: t.bg2, border: `1px solid ${t.glassBorder}`,
        borderRadius: 10,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 140ms, border-color 140ms',
      }}
      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = t.bg3; }}
      onMouseLeave={(e) => { if (clickable) e.currentTarget.style.background = t.bg2; }}
    >
      <div style={{
        fontSize: 10, color: t.text2, letterSpacing: 0.3,
        textTransform: 'uppercase', fontWeight: 500,
      }}>{label}</div>
      <div style={{
        marginTop: 4, fontFamily: t.fontSans, fontSize: 17, fontWeight: 600,
        color: t.text0, letterSpacing: -0.3,
      }}>{value}</div>
      {sub && (
        <div style={{
          marginTop: 2, fontFamily: t.fontMono, fontSize: 10, color: t.text3,
        }}>{sub}</div>
      )}
    </div>
  );
}

function fmtAgo(ts: number): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'ahora';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// Wrapper que mantiene el BrowserPanel montado entre cambios de pestaña.
// Solo se monta la PRIMERA vez que el user entra al tab Navegador; después
// queda vivo y se oculta con display:none cuando cambiás de tab. Eso preserva
// el iframe (no recarga la página), su scroll, cookies, etc.
function KeepAliveBrowser({ visible, bubbleId, workspace }: { visible: boolean; bubbleId: string; workspace: string }) {
  const [hasMounted, setHasMounted] = useState(visible);
  useEffect(() => { if (visible && !hasMounted) setHasMounted(true); }, [visible, hasMounted]);
  if (!hasMounted) return null;
  return (
    <div style={{
      display: visible ? 'flex' : 'none',
      flexDirection: 'column',
      flex: 1, minHeight: 0,
    }}>
      <BrowserPanel bubbleId={bubbleId} workspace={workspace}/>
    </div>
  );
}

// Mismo patrón que KeepAliveBrowser: el ServerPanel monta UNA SOLA VEZ (la
// primera vez que entrás a la tab Server) y queda vivo con display:none al
// cambiar de tab. Sin esto, cada vuelta a la tab Server remontaba el panel
// → re-fetch del ring buffer de logs (hasta 64 KB por slot) + re-render
// completo del xterm — lento y con parpadeo. Manteniéndolo vivo, el stream
// WS de logs sigue appendando en background y al volver ya está todo ahí.
function KeepAliveServer({ visible, bubbleId, workspace }: { visible: boolean; bubbleId: string; workspace: string }) {
  const [hasMounted, setHasMounted] = useState(visible);
  useEffect(() => { if (visible && !hasMounted) setHasMounted(true); }, [visible, hasMounted]);
  if (!hasMounted) return null;
  return (
    <div style={{
      display: visible ? 'flex' : 'none',
      flexDirection: 'column',
      flex: 1, minHeight: 0,
    }}>
      <ServerPanel bubbleId={bubbleId} workspace={workspace} visible={visible}/>
    </div>
  );
}

// Mismo patrón: FilesPanel queda montado una vez visitado para preservar el
// EditorView de CodeMirror (cursor, scroll, selección) + openFiles en memoria
// + el árbol cargado. Sin esto, cada vuelta a la tab re-fetcheaba todo y
// reseteaba el editor a la línea 1.
function KeepAliveFiles({ visible, bubbleId, workspace }: { visible: boolean; bubbleId: string; workspace: string }) {
  const [hasMounted, setHasMounted] = useState(visible);
  useEffect(() => { if (visible && !hasMounted) setHasMounted(true); }, [visible, hasMounted]);
  if (!hasMounted) return null;
  return (
    <div style={{
      display: visible ? 'flex' : 'none',
      flexDirection: 'column',
      flex: 1, minHeight: 0,
    }}>
      <FilesPanel bubbleId={bubbleId} workspace={workspace}/>
    </div>
  );
}

