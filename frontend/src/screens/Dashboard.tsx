import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import {
  Glass, glassEffect, IconBtn, StatusDot, Pill, AgentGlyph, SectionLabel, bubbleLetter,
} from '@/design/primitives';
import {
  IconGrid, IconGraph, IconExt, IconColumns,
  IconPause, IconPlay, IconResume, IconMore, IconFolder, IconTerminal, IconCheck, IconAgent,
  IconClock, IconAlert, IconZap, IconCpu, IconTrash, IconX,
  IconGlobe, IconLayers, IconShield, IconGithub, IconCommand, type IconProps,
} from '@/design/icons';
import type { Bubble } from '@/lib/types';
import { stateColor, type AgentState } from '@/design/tokens';
import { useT } from '@/hooks/useI18n';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { useProfile } from '@/hooks/useProfile';
import { useBubbleActive, useActiveBubbleIds } from '@/hooks/useBubbleActive';
import { useBubbleBusy, useBusyBubbleIds } from '@/hooks/usePtyBusyNotifier';
import { useCategories, getCategoryById } from '@/hooks/useCategories';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { useBubbleHasFilesMap, useBubbleChangeCountMap } from '@/hooks/useGitChanges';
import { useTeamBubbles } from '@/components/AdminGraph';

type Props = {
  bubbles: Bubble[];
  activeBubbleId: string | null;
  onSend: (text: string) => void;
  onOpenAgent: (id: string) => void;
  onCreateAgent: (title?: string, workspace?: string, baseBranch?: string) => void;
  onFocus: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onChangeWorkspace: (id: string, workspace: string) => void;
  onToggleCategory: (id: string, categoryId: string | undefined) => void;
  availableWorkspaces: string[];
  role?: 'admin' | 'member' | null;
  userId?: string | null;
};

export function Dashboard(props: Props) {
  const t = useTokens();
  const tr = useT();
  const { bubbles: rawBubbles, activeBubbleId, onOpenAgent, onCreateAgent, onFocus, onRename, onRemove, onChangeWorkspace, onToggleCategory, availableWorkspaces, role, userId } = props;
  // Filtramos los archivados: no aparecen en Dashboard (viven en su propia
  // pantalla). Esto incluye stats, vistas y nodos del grafo.
  const bubbles = rawBubbles.filter((b) => !b.archived);
  const { username } = useProfile();
  const isAdmin = role === 'admin';
  // Grafo de equipo del admin: bubbles propias (reales) + las de otros usuarios
  // (sintetizadas desde /admin/overview). Para members el hook no hace nada.
  const { teamBubbles, ownerNames } = useTeamBubbles(bubbles, userId ?? null, isAdmin);
  // Vista del Dashboard persistida en localStorage — al volver al dashboard
  // se mantiene la última vista elegida (grid / kanban / graph).
  type DashView = 'grid' | 'graph' | 'kanban';
  const [view, setViewState] = useState<DashView>(() => {
    try {
      const saved = window.localStorage.getItem('eco.dashboard.view');
      if (saved === 'grid' || saved === 'graph' || saved === 'kanban') return saved;
    } catch { /* noop */ }
    return 'grid';
  });
  const setView = (v: DashView) => {
    setViewState(v);
    try { window.localStorage.setItem('eco.dashboard.view', v); } catch { /* noop */ }
  };

  // "Activos" usa el criterio compartido (Claude SDK busy, PTY busy, server
  // up, browser abierto, archivos modificados) — mismo que la card "Agentes
  // en vivo" y la vista de nodos. Sin esto, el header decía "0 agentes
  // activos" mientras la card mostraba 1.
  const activeIds = useActiveBubbleIds(bubbles);
  const active = bubbles.filter((b) => activeIds.has(b.id));
  const running = active.filter((b) => b.status === 'running' || b.status === 'thinking' || b.status === 'executing');
  const waiting = active.filter((b) => b.status === 'waiting' as string);
  const errors = bubbles.filter((b) => b.status === 'error' as string);

  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => ecoOn('eco:scroll', ({ dir }) => {
    const el = mainScrollRef.current;
    if (!el) return;
    const step = el.clientHeight * 0.85;
    if (dir === 'top') el.scrollTo({ top: 0, behavior: 'smooth' });
    else if (dir === 'bottom') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else if (dir === 'up') el.scrollBy({ top: -step, behavior: 'smooth' });
    else if (dir === 'down') el.scrollBy({ top: step, behavior: 'smooth' });
  }), []);

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      <DashboardRail
        bubbles={bubbles}
        activeBubbleId={activeBubbleId}
        availableWorkspaces={availableWorkspaces}
        onFocus={onFocus}
        onOpenAgent={onOpenAgent}
      />

      <div ref={mainScrollRef} style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '28px 32px 110px', overflowY: 'auto', overflowX: 'hidden', position: 'relative',
      }}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '12px 8px 32px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', maxWidth: 380, minWidth: 240 }}>
            <div style={{
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
              color: t.accent, letterSpacing: 1.5, textTransform: 'uppercase',
            }}>{greetingFor(new Date(), tr)}{username ? `, ${username}` : ''}</div>
            <h1 style={{
              margin: '6px 0 14px', fontFamily: t.fontSans, fontSize: 30,
              fontWeight: 600, color: t.text0, letterSpacing: -0.8,
              lineHeight: 1.15,
            }}>
              {tr(active.length === 1 ? 'dash.active_summary_one' : 'dash.active_summary_many', { n: active.length })}
              <br/>
              {(() => {
                const projects = new Set(bubbles.map((b) => b.workspace).filter(Boolean)).size || 1;
                return tr(projects === 1 ? 'dash.in_projects' : 'dash.in_projects_many', { n: projects });
              })()}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {running.length > 0 && <Pill color={t.ok} icon={IconZap}>{tr('dash.stat.running', { n: running.length })}</Pill>}
              {waiting.length > 0 && <Pill color={t.warn} icon={IconClock}>{tr('dash.stat.waiting', { n: waiting.length })}</Pill>}
              {errors.length > 0 && <Pill color={t.err} icon={IconAlert}>{tr('dash.stat.errors', { n: errors.length })}</Pill>}
              {running.length === 0 && waiting.length === 0 && errors.length === 0 && (
                <Pill color={t.text2}>{tr('dash.stat.idle')}</Pill>
              )}
            </div>
          </div>

          <DashboardCards bubbles={bubbles} onOpenAgent={onOpenAgent}/>
        </motion.div>

        <SectionLabel count={bubbles.length} action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <IconBtn icon={IconGrid} size={28} active={view === 'grid'} onClick={() => setView('grid')}/>
              <IconBtn icon={IconColumns} size={28} active={view === 'kanban'} onClick={() => setView('kanban')}/>
              <IconBtn icon={IconGraph} size={28} active={view === 'graph'} onClick={() => setView('graph')}/>
            </div>
            <CreateAgentButton onCreate={onCreateAgent} workspaces={availableWorkspaces}/>
          </div>
        }>{tr('dash.section.agents')}</SectionLabel>

        {view === 'grid' ? (
          <GridView
            bubbles={bubbles}
            workspaces={availableWorkspaces}
            onOpenAgent={onOpenAgent}
            onRename={onRename}
            onRemove={onRemove}
            onChangeWorkspace={onChangeWorkspace}
            onToggleCategory={onToggleCategory}
            onCreateAgent={onCreateAgent}
          />
        ) : view === 'kanban' ? (
          <KanbanView
            bubbles={bubbles}
            onOpenAgent={onOpenAgent}
            onCreateAgent={onCreateAgent}
            workspaces={availableWorkspaces}
          />
        ) : isAdmin ? (
          // Admin: el MISMO GraphView pero agrupado por usuario (Eco → usuario →
          // sus bubbles), con todas las animaciones/controles. Solo abre las propias.
          <GraphView
            bubbles={teamBubbles}
            groupMode="owner"
            ownerNames={ownerNames}
            onOpenAgent={(id) => { if (bubbles.some((b) => b.id === id)) onOpenAgent(id); }}
          />
        ) : (
          <GraphView bubbles={bubbles} onOpenAgent={onOpenAgent}/>
        )}
      </div>

      {/* El input global se removió del Dashboard. Para crear un agente
          nuevo, usar el botón "+" del grid. */}
    </div>
  );
}

function greetingFor(d: Date, tr: (k: string, v?: Record<string, string | number>) => string): string {
  const h = d.getHours();
  if (h < 6) return tr('dash.greeting.evening');
  if (h < 12) return tr('dash.greeting.morning');
  if (h < 19) return tr('dash.greeting.afternoon');
  return tr('dash.greeting.evening');
}

// ─────────────────────────── Dashboard top cards
// 4 cards con info útil: próxima acción, agentes en vivo, recursos en uso,
// estado del sistema. Diseño Liquid Glass con icono prominente + número
// grande + sub-label.

function DashboardCards({
  bubbles,
}: {
  bubbles: Bubble[];
  onOpenAgent: (id: string) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'stretch',
      gap: 14,
      marginBottom: 8,
      // Las cards viven en el lado DERECHO del header — usamos marginLeft
      // auto para empujarlas al borde derecho dentro del flex padre.
      marginLeft: 'auto',
      // Cards encogibles: cada una mínimo 180px, crecen equitativamente.
      // Si no entran en una fila, el flex-wrap del padre las envía abajo.
      flex: '1 1 auto',
      maxWidth: 760, // 3 × 240 + 2 × gap; tope para no estirarse demás
    }}>
      <div style={{ flex: '1 1 180px', minWidth: 180, display: 'flex' }}><LiveAgentsCard bubbles={bubbles}/></div>
      <div style={{ flex: '1 1 180px', minWidth: 180, display: 'flex' }}><ResourcesCard bubbles={bubbles}/></div>
      <div style={{ flex: '1 1 180px', minWidth: 180, display: 'flex' }}><SystemStatusCard/></div>
    </div>
  );
}

function CardShell({
  icon: Icon, iconColor, accentBorder = false, onClick, children,
}: {
  icon: (p: IconProps) => JSX.Element;
  iconColor: string;
  accentBorder?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const t = useTokens();
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...glassEffect(t, { hovered: hover, intensity: 'normal' }),
        borderRadius: 14,
        padding: '14px 16px',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        transition: 'transform 200ms ease, border-color 200ms ease',
        transform: hover && onClick ? 'translateY(-2px)' : 'translateY(0)',
        border: `1px solid ${accentBorder ? t.accent : (hover ? t.glassBorderHi : t.glassBorder)}`,
        boxShadow: accentBorder
          ? `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px ${t.accentGlow}, ${t.shadowMd}`
          : `inset 0 1px 0 rgba(255,255,255,0.06), ${t.shadowMd}`,
        overflow: 'hidden',
        // Llena 100% del slot del flex container — así todas las cards
        // quedan exactamente del mismo ancho y alto aunque su contenido varíe.
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: iconColor,
        color: t.accentOn,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
        boxShadow: `0 0 10px ${iconColor}`,
      }}>
        <Icon size={17} strokeWidth={2}/>
      </div>
      {children}
    </div>
  );
}


function LiveAgentsCard({ bubbles }: { bubbles: Bubble[] }) {
  const t = useTokens();
  const tr = useT();
  // Mismo criterio que la graph view: contamos agentes "activos" usando
  // dev server / browser / archivos modificados / Claude busy. El
  // bubble.status solo NO alcanza — está en 'idle' aunque haya server up.
  const activeIds = useActiveBubbleIds(bubbles);
  const active = activeIds.size;
  const running = bubbles.filter((b) => b.status === 'running' || b.status === 'thinking' || b.status === 'executing').length;
  const waiting = bubbles.filter((b) => b.status === 'waiting').length;
  const errors = bubbles.filter((b) => b.status === 'error').length;
  const idle = bubbles.length - active - errors;
  const total = bubbles.length;
  const pct = (n: number) => total === 0 ? 0 : (n / total) * 100;
  void running; void waiting;

  return (
    <CardShell icon={IconZap} iconColor={t.accent}>
      <div style={{
        fontSize: 10.5, color: t.text2, fontFamily: t.fontSans,
        letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 500,
        marginBottom: 4,
      }}>{tr('dash.card.live.title')}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontSize: 28, fontFamily: t.fontSans, fontWeight: 700,
          color: active > 0 ? t.accent : t.text0, letterSpacing: -0.8,
        }}>{active}</span>
        <span style={{ fontSize: 13, color: t.text3 }}>/ {total}</span>
      </div>
      {/* Mini barra horizontal apilada: running | waiting | errors | idle */}
      <div style={{
        height: 6, borderRadius: 3, marginTop: 8,
        background: t.bg3, overflow: 'hidden',
        display: 'flex',
      }}>
        {running > 0 && <div style={{ width: `${pct(running)}%`, background: t.ok }}/>}
        {waiting > 0 && <div style={{ width: `${pct(waiting)}%`, background: t.warn }}/>}
        {errors > 0 && <div style={{ width: `${pct(errors)}%`, background: t.err }}/>}
        {idle > 0 && <div style={{ width: `${pct(idle)}%`, background: t.text3, opacity: 0.4 }}/>}
      </div>
      {/* Solo mostramos los conteos que aportan info — un "● 0" no sirve. */}
      <div style={{
        display: 'flex', gap: 10, marginTop: 7,
        fontSize: 10.5, color: t.text2, fontFamily: t.fontMono,
      }}>
        {running > 0 && <span><span style={{ color: t.ok }}>●</span> {running}</span>}
        {waiting > 0 && <span><span style={{ color: t.warn }}>●</span> {waiting}</span>}
        {errors > 0 && <span><span style={{ color: t.err }}>●</span> {errors}</span>}
        {idle > 0 && <span><span style={{ color: t.text3 }}>●</span> {idle}</span>}
      </div>
    </CardShell>
  );
}

function ResourcesCard({ bubbles }: { bubbles: Bubble[] }) {
  const t = useTokens();
  const tr = useT();

  // ─── Counts en vivo de cada subsistema ──────────────────────────────────
  // Todos filtran por burbujas vivas (`liveIds`) y reflejan estado ACTIVO en
  // tiempo real — mismo criterio que los satélites de la vista de nodos.
  const liveIds = new Set(bubbles.map((b) => b.id));

  // Terminales: PTYs abiertos en cualquier bubble viva (mismo criterio que
  // el satélite "pty" en la vista de nodos, que se prende con b.ptyOpen).
  // Antes solo contábamos los busy — pero el label es "Terminales activas"
  // = abiertas, no procesando. Así matchea el satélite.
  const ptys = bubbles.filter((b) => b.ptyOpen).length;
  // Mantenemos referencia al hook para no perder el suscriptor de eventos
  // que actualiza el spinner de "Procesando…" en los satélites individuales.
  void useBusyBubbleIds();

  // Dev servers: escuchamos eco:dev_status para mantener un Map por bubble.
  // Seed inicial con /dev/active para no perder estado al montar el dashboard
  // después de que los servers ya estén corriendo.
  const [serverRoles, setServerRoles] = useState<Record<string, Set<string>>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/dev/active');
        if (!r.ok || cancelled) return;
        const data = await r.json() as { sessions: Array<{ bubbleId: string; role: string; status: string }> };
        const seed: Record<string, Set<string>> = {};
        for (const s of data.sessions ?? []) {
          if (s.status !== 'running' && s.status !== 'starting') continue;
          if (!seed[s.bubbleId]) seed[s.bubbleId] = new Set();
          seed[s.bubbleId]!.add(s.role);
        }
        setServerRoles((prev) => ({ ...prev, ...seed }));
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      const role = d.role ?? 'main';
      const live = d.status === 'running' || d.status === 'starting';
      setServerRoles((prev) => {
        const cur = new Set(prev[d.bubbleId] ?? []);
        if (live) cur.add(role); else cur.delete(role);
        return { ...prev, [d.bubbleId]: cur };
      });
    });
  }, []);
  const servers = Object.entries(serverRoles)
    .filter(([id]) => liveIds.has(id))
    .reduce((sum, [, s]) => sum + s.size, 0);

  // Navegadores con URL: leemos localStorage + escuchamos eco:browser_url_changed
  // para vivos updates sin re-leer todo el storage en cada render.
  const [browsersSet, setBrowsersSet] = useState<Set<string>>(() => {
    const s = new Set<string>();
    try {
      for (const b of bubbles) {
        if (window.localStorage.getItem(`eco.browser.url.${b.id}`)) s.add(b.id);
      }
    } catch { /* noop */ }
    return s;
  });
  useEffect(() => {
    return ecoOn('eco:browser_url_changed', (e) => {
      setBrowsersSet((prev) => {
        const next = new Set(prev);
        if (e.hasUrl) next.add(e.bubbleId); else next.delete(e.bubbleId);
        return next;
      });
    });
  }, []);
  // Filtramos por bubbles vivas — si una se cerró, su entry en el set queda
  // huérfana hasta el siguiente unload.
  const browsers = [...browsersSet].filter((id) => liveIds.has(id)).length;

  // Archivos modificados: comparte cache con FilesPanel y el Dashboard.
  const hasFilesMap = useBubbleHasFilesMap(
    bubbles.map((b) => ({ id: b.id, workspace: b.workspace || '' })),
  );
  const files = bubbles.filter((b) => hasFilesMap.get(b.id)).length;

  // Remote control activo por bubble — usamos el evento del RemoteControlBar.
  const [remoteSet, setRemoteSet] = useState<Set<string>>(() => {
    const s = new Set<string>();
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('eco.remote.') && window.localStorage.getItem(k)) {
          s.add(k.slice('eco.remote.'.length));
        }
      }
    } catch { /* noop */ }
    return s;
  });
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ bubbleId: string; slug: string | null }>).detail;
      if (!detail?.bubbleId) return;
      setRemoteSet((prev) => {
        const next = new Set(prev);
        if (detail.slug) next.add(detail.bubbleId); else next.delete(detail.bubbleId);
        return next;
      });
    }
    window.addEventListener('eco:remote-changed', onChange);
    return () => window.removeEventListener('eco:remote-changed', onChange);
  }, []);
  const remote = [...remoteSet].filter((id) => liveIds.has(id)).length;

  // Worktrees: uno por bubble con workspace git. Cada bubble tiene su propio
  // worktree aislado (~/.eco/worktrees/<bubbleId>), aunque varias bubbles
  // compartan el mismo workspace padre.
  const worktrees = bubbles.filter((b) => !!b.workspace).length;

  // Colores en sync con los satélites de la vista de nodos para que el
  // user reconozca cada subsistema con el mismo color en ambos lados.
  const items = [
    { icon: IconTerminal, count: ptys,      color: t.ok,      label: tr('dash.card.res.ptys') },       // verde
    { icon: IconCpu,      count: servers,   color: '#facc15', label: tr('dash.card.res.servers') },    // amarillo
    { icon: IconGlobe,    count: browsers,  color: '#94a3b8', label: tr('dash.card.res.browsers') },   // gris
    { icon: IconGithub,   count: files,     color: '#a855f7', label: tr('dash.card.res.files') },      // morado
    { icon: IconCommand,  count: remote,    color: '#d97757', label: tr('dash.card.res.remote') },     // naranja Claude
    { icon: IconFolder,   count: worktrees, color: t.text2,   label: tr('dash.card.res.worktrees') },  // gris tema (sin satélite asociado)
  ];

  return (
    <CardShell icon={IconLayers} iconColor={t.busy}>
      <div style={{
        fontSize: 10.5, color: t.text2, fontFamily: t.fontSans,
        letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 500,
        marginBottom: 8,
      }}>{tr('dash.card.res.title')}</div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6,
      }}>
        {items.map((it, i) => (
          <div key={i} title={it.label}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px', borderRadius: 6,
              background: t.bg2,
              color: it.count > 0 ? it.color : t.text3,
            }}>
            <it.icon size={12} strokeWidth={2}/>
            <span style={{
              fontFamily: t.fontMono, fontSize: 12, fontWeight: 600,
              color: it.count > 0 ? t.text0 : t.text3,
            }}>{it.count}</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function SystemStatusCard() {
  const t = useTokens();
  const tr = useT();
  // Estados básicos — backend siempre OK (si estás viendo esto, está vivo).
  const [apiKey, setApiKey] = useState<'ok' | 'missing' | 'invalid'>('missing');
  const [obsidianActive, setObsidianActive] = useState<boolean>(false);
  useEffect(() => {
    let cancel = false;
    apiFetch('/config/api-key').then(async (r) => {
      if (cancel) return;
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        setApiKey(data?.configured ? 'ok' : 'missing');
      }
    }).catch(() => { /* noop */ });
    // Obsidian: activo = configurado + habilitado.
    apiFetch('/integrations/obsidian/status').then(async (r) => {
      if (cancel || !r.ok) return;
      const data = await r.json().catch(() => ({}));
      setObsidianActive(!!(data?.configured && data?.enabled));
    }).catch(() => { /* noop */ });
    return () => { cancel = true; };
  }, []);

  const rows = [
    { label: tr('dash.card.sys.backend'),  color: t.ok },
    { label: tr('dash.card.sys.apikey'),   color: apiKey === 'ok' ? t.ok : (apiKey === 'invalid' ? t.err : t.warn) },
    // Obsidian solo aparece cuando está activo.
    ...(obsidianActive ? [{ label: tr('dash.card.sys.obsidian'), color: t.ok }] : []),
  ];

  return (
    <CardShell icon={IconShield} iconColor={t.ok}>
      <div style={{
        fontSize: 10.5, color: t.text2, fontFamily: t.fontSans,
        letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 500,
        marginBottom: 8,
      }}>{tr('dash.card.sys.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: r.color,
              boxShadow: `0 0 6px ${r.color}`,
            }}/>
            <span style={{ fontSize: 12, color: t.text1, fontFamily: t.fontSans }}>{r.label}</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}


function AgentBubble({
  bubble, workspaces, onClick, onRename, onRemove, onChangeWorkspace, onToggleCategory,
}: {
  bubble: Bubble;
  workspaces: string[];
  onClick: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  onChangeWorkspace: (ws: string) => void;
  onToggleCategory: (categoryId: string | undefined) => void;
}) {
  const t = useTokens();
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bubble.title);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const tr = useT();
  const state = (bubble.status as AgentState) || 'idle';
  const sColor = stateColor(state, t);
  const busy = useBubbleBusy(bubble.id);
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
  const lastMsg = bubble.messages[bubble.messages.length - 1];
  const lastText = lastMsg?.text || tr('dash.bubble.no_msg');
  const minutesAgo = Math.max(1, Math.round((Date.now() - bubble.updatedAt) / 60000));
  const tStr = minutesAgo < 60 ? `${minutesAgo}m` : `${Math.round(minutesAgo / 60)}h`;

  useEffect(() => { setDraft(bubble.title); }, [bubble.title]);

  function commitRename() {
    const v = draft.trim();
    if (v && v !== bubble.title) onRename(v);
    setRenaming(false);
  }

  function startRename(e?: React.MouseEvent) {
    e?.stopPropagation();
    setDraft(bubble.title);
    setRenaming(true);
    setMenuOpen(false);
  }

  return (
    <div
      onClick={() => !renaming && onClick()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
      style={{
        position: 'relative',
        ...glassEffect(t, { hovered: hover, intensity: 'normal' }),
        borderRadius: 18,
        padding: '18px 18px 14px',
        cursor: renaming ? 'default' : 'pointer',
        transition: 'border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        overflow: 'visible',
        minHeight: 200,
        display: 'flex', flexDirection: 'column',
        ...(busy ? {
          borderColor: t.ok,
          boxShadow: `0 0 0 1px ${t.ok}55, 0 0 22px color-mix(in oklch, ${t.ok} 30%, transparent)`,
        } : null),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <AgentGlyph size={38} state={state} letter={bubbleLetter(bubble.title)} accent={bubble.accent}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { setDraft(bubble.title); setRenaming(false); }
              }}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: t.bg3, border: `1px solid ${t.accent}`,
                borderRadius: 8, padding: '4px 8px',
                fontFamily: t.fontSans, fontSize: 14, fontWeight: 600, color: t.text0,
                outline: 'none',
              }}
            />
          ) : (
            <div
              onDoubleClick={(e) => startRename(e)}
              title={tr('dash.bubble.rename_tip')}
              style={{
                fontFamily: t.fontSans, fontSize: 14, fontWeight: 600, color: t.text0,
                letterSpacing: -0.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{bubble.title}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 11.5, color: t.text2 }}>{tr('dash.bubble.agent')}</span>
            <span style={{ color: t.text3 }}>·</span>
            <span style={{ fontSize: 11.5, color: t.text2 }}>{tStr}</span>
          </div>
        </div>
        <div ref={menuAnchorRef} style={{ position: 'relative' }}>
          <IconBtn
            icon={IconMore}
            size={26}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          />
          {menuOpen && (
            <BubbleMenu
              anchorRef={menuAnchorRef}
              onClose={() => setMenuOpen(false)}
              onRename={startRename}
              onRemove={(e) => { e.stopPropagation(); onRemove(); setMenuOpen(false); }}
              currentCategoryIds={bubble.categoryIds}
              // Toggle de categoría deja el menú abierto (multi-selección);
              // "Sin categoría" (undefined) limpia todo y cierra.
              onToggleCategory={(catId) => { onToggleCategory(catId); if (!catId) setMenuOpen(false); }}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <StatusDot color={busy ? t.ok : sColor} pulse={busy || state === 'running' || state === 'thinking' || state === 'executing'} size={7}/>
        <span style={{ fontSize: 11.5, color: busy ? t.ok : sColor, fontWeight: 500 }}>
          {busy ? tr('state.executing') : (STATE_LABELS_I18N[state] || tr('state.idle'))}
        </span>
        {/* Chips de categorías — solo si la burbuja tiene asignadas. */}
        {bubbleCategories.length > 0 && (
          <span style={{
            marginLeft: 'auto', minWidth: 0,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            flexWrap: 'wrap', justifyContent: 'flex-end',
          }}>
            {bubbleCategories.map((category) => (
              <span key={category.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '1px 7px', borderRadius: 999,
                background: `color-mix(in oklch, ${category.color} 16%, transparent)`,
                border: `1px solid color-mix(in oklch, ${category.color} 45%, transparent)`,
                fontSize: 10, fontWeight: 500, color: category.color,
                whiteSpace: 'nowrap', maxWidth: 110,
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: category.color, flexShrink: 0 }}/>
                {category.name}
              </span>
            ))}
          </span>
        )}
      </div>

      <div style={{
        fontFamily: t.fontSans, fontSize: 12.5, color: t.text1,
        lineHeight: 1.5, marginBottom: 14,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>{lastText}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <WorkspaceChip
          workspace={bubble.workspace}
          workspaces={workspaces}
          onChange={onChangeWorkspace}
        />
        <div style={{ display: 'flex', gap: 2 }}>
          {state === 'running' || state === 'thinking' || state === 'executing' ? (
            <IconBtn icon={IconPause} size={26} title={tr('dash.bubble.pause')}/>
          ) : state === 'paused' ? (
            <IconBtn icon={IconPlay} size={26} title={tr('dash.bubble.resume')}/>
          ) : state === 'error' ? (
            <IconBtn icon={IconResume} size={26} title={tr('dash.bubble.retry')}/>
          ) : null}
          <IconBtn icon={IconExt} size={26} title={tr('dash.bubble.open_detail')}/>
        </div>
      </div>
    </div>
  );
}

// Best-effort: detectamos el home del user a partir de un path conocido
// para mostrar los workspaces como `~/Documents/...` en lugar del absoluto.
// Cacheado para no recalcular en cada render.
let _cachedHome = '';
function getHome(): string {
  if (_cachedHome) return _cachedHome;
  try {
    // Buscamos un workspace en localStorage y nos quedamos con el prefijo
    // común estándar de macOS: /Users/<name>/.
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const v = window.localStorage.getItem(k) || '';
      const m = v.match(/^\/Users\/[^/]+/);
      if (m) { _cachedHome = m[0]; return _cachedHome; }
    }
  } catch { /* noop */ }
  return '';
}

// Hook + modal compartido para naming de agente nuevo. Lo usan el botón
// del header del Dashboard y la columna idle del Kanban.
function useNameAgentDialog(
  onCreate: (title?: string, workspace?: string, baseBranch?: string) => void,
  workspaces: string[],
) {
  const [open, setOpen] = useState(false);
  const dialog = <NameAgentDialog open={open} onClose={() => setOpen(false)} onCreate={onCreate} workspaces={workspaces}/>;
  return { open: () => setOpen(true), dialog };
}

function NameAgentDialog({
  open, onClose, onCreate, workspaces,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (title?: string, workspace?: string, baseBranch?: string) => void;
  workspaces: string[];
}) {
  const t = useTokens();
  const tr = useT();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Flujo nuevo: PRIMERO elegís workspace, DESPUÉS el branch. Los branches
  // listados son los favoritos del workspace seleccionado (configurables en
  // Settings → Carpetas). Si no hay favoritos para ese ws, solo "otra…".
  const defaultWs = typeof window !== 'undefined'
    ? (window.localStorage?.getItem('eco.workspace.default') || '')
    : '';
  const [selectedWs, setSelectedWs] = useState<string>(() => {
    if (defaultWs && workspaces.includes(defaultWs)) return defaultWs;
    return workspaces[0] || '';
  });
  const favorites = useMemo<string[]>(() => {
    if (!selectedWs) return [];
    try {
      const raw = getWorkspaceConfig(selectedWs).baseBranches;
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    } catch { return []; }
  }, [selectedWs]);
  const lastChosen = (() => {
    if (!selectedWs) return '';
    try { return window.localStorage.getItem(`eco.worktree.last_branch.${selectedWs}`) || ''; }
    catch { return ''; }
  })();
  const [baseBranch, setBaseBranch] = useState<string>(() => lastChosen || favorites[0] || '');
  // Modo "otra...": el user typea una rama custom no listada.
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  useEffect(() => {
    if (open) {
      setDraft('');
      // Re-evaluamos workspace al abrir (puede haber cambiado el default).
      const ws = (defaultWs && workspaces.includes(defaultWs)) ? defaultWs : (workspaces[0] || '');
      setSelectedWs(ws);
      setCustomMode(false);
      setCustomDraft('');
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cuando cambia el workspace seleccionado, reset al baseBranch desde
  // los favoritos / last_chosen del NUEVO ws.
  useEffect(() => {
    if (!selectedWs) { setBaseBranch(''); return; }
    let last = '';
    try { last = window.localStorage.getItem(`eco.worktree.last_branch.${selectedWs}`) || ''; }
    catch { /* noop */ }
    let favs: string[] = [];
    try {
      const raw = getWorkspaceConfig(selectedWs).baseBranches;
      favs = raw.split(',').map((s) => s.trim()).filter(Boolean);
    } catch { /* noop */ }
    setBaseBranch(last || favs[0] || '');
    setCustomMode(false);
    setCustomDraft('');
  }, [selectedWs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    const v = draft.trim();
    const branch = customMode ? customDraft.trim() : baseBranch.trim();
    if (branch && selectedWs) {
      try { window.localStorage.setItem(`eco.worktree.last_branch.${selectedWs}`, branch); }
      catch { /* noop */ }
    }
    onClose();
    onCreate(v || undefined, selectedWs || undefined, branch || undefined);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
          borderRadius: 16, boxShadow: t.shadowLg,
          padding: 20,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconAgent size={18} strokeWidth={2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text0 }}>
              {tr('dash.bubble.new')}
            </div>
            <div style={{ fontSize: 11.5, color: t.text2, marginTop: 1 }}>
              {tr('dash.bubble.name_label')}
            </div>
          </div>
        </div>
        {workspaces.length === 0 ? (
          <>
            <div style={{
              padding: '14px 4px 6px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ fontSize: 13, color: t.text0, fontWeight: 500 }}>
                {tr('wsp.no_workspaces')}
              </div>
              <div style={{ fontSize: 12, color: t.text2 }}>
                {tr('wsp.ask_admin')}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 36, borderRadius: 999, border: `1px solid ${t.glassBorder}`,
                background: 'transparent', color: t.text1,
                fontFamily: t.fontSans, fontSize: 12.5, cursor: 'pointer',
              }}>
              {tr('common.close')}
            </button>
          </>
        ) : (
        <>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={tr('dash.bubble.name_placeholder')}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 10, padding: '10px 12px',
            fontFamily: t.fontSans, fontSize: 13.5, color: t.text0,
            outline: 'none',
          }}
        />
        {/* Selector de workspace (carpeta). Filas verticales con el path
            completo + el nombre de la carpeta resaltado. Solo si hay más de
            un workspace disponible. */}
        {workspaces.length > 1 && (
          <div>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 6 }}>
              Carpeta
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {workspaces.map((ws) => {
                const active = selectedWs === ws;
                const name = ws.split('/').filter(Boolean).slice(-1)[0] || ws;
                const display = ws.startsWith(getHome())
                  ? '~' + ws.slice(getHome().length)
                  : ws;
                return (
                  <button
                    key={ws}
                    type="button"
                    onClick={() => setSelectedWs(ws)}
                    title={ws}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      border: `1px solid ${active ? t.accent : t.glassBorder}`,
                      background: active ? t.accentFaint : t.bg2,
                      color: active ? t.accent : t.text1,
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 140ms',
                    }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: active ? t.accent : t.bg3,
                      color: active ? t.accentOn : t.text2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <IconFolder size={11}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500,
                        color: active ? t.accent : t.text0,
                      }}>{name}</div>
                      <div style={{
                        fontFamily: t.fontMono, fontSize: 10.5, color: t.text3,
                        marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{display}</div>
                    </div>
                    {active && <IconCheck size={13}/>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Selector de rama base — siempre visible cuando hay workspace
            seleccionado. Favoritos vienen de Settings → Carpetas → ws actual.
            Si no hay favoritos para este ws, mostramos solo "otra…". */}
        <div>
          <div style={{ fontSize: 11, color: t.text2, marginBottom: 6 }}>
            Rama base del worktree {favorites.length === 0 && (
              <span style={{ color: t.text3, fontWeight: 400 }}>
                · sin favoritos para esta carpeta
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {favorites.map((b: string) => {
                const active = !customMode && baseBranch === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => { setCustomMode(false); setBaseBranch(b); }}
                    style={{
                      padding: '5px 10px', borderRadius: 999,
                      border: `1px solid ${active ? t.accent : t.glassBorder}`,
                      background: active ? t.accentFaint : t.bg2,
                      color: active ? t.accent : t.text1,
                      fontFamily: t.fontMono, fontSize: 11, cursor: 'pointer',
                    }}>{b}</button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                style={{
                  padding: '5px 10px', borderRadius: 999,
                  border: `1px solid ${customMode ? t.accent : t.glassBorder}`,
                  background: customMode ? t.accentFaint : t.bg2,
                  color: customMode ? t.accent : t.text2,
                  fontFamily: t.fontSans, fontSize: 11, cursor: 'pointer',
                }}>otra…</button>
            </div>
          {customMode && (
            <input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder={tr('dash.branch_name_placeholder')}
              spellCheck={false}
              autoCorrect="off"
              style={{
                marginTop: 6, width: '100%', boxSizing: 'border-box',
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                borderRadius: 8, padding: '7px 10px',
                fontFamily: t.fontMono, fontSize: 12, color: t.text0,
                outline: 'none',
              }}
            />
          )}
        </div>
        <div style={{ fontSize: 10.5, color: t.text3 }}>
          {tr('dash.bubble.enter_hint')}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, height: 36, borderRadius: 999,
              border: `1px solid ${t.glassBorder}`,
              background: 'transparent', color: t.text1,
              fontFamily: t.fontSans, fontSize: 12.5, cursor: 'pointer',
            }}>
            {tr('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            style={{
              flex: 1, height: 36, borderRadius: 999, border: 0,
              background: t.accent, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer',
            }}>
            {tr('common.create')}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

// Botón "Nuevo agente" (header del Dashboard) — pill prominent.
function CreateAgentButton({
  onCreate, workspaces,
}: {
  onCreate: (title?: string, workspace?: string, baseBranch?: string) => void;
  workspaces: string[];
}) {
  const t = useTokens();
  const tr = useT();
  const { open, dialog } = useNameAgentDialog(onCreate, workspaces);
  return (
    <>
      <button
        type="button"
        onClick={open}
        title={tr('dash.bubble.new')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8, border: 0,
          background: t.accent, color: t.accentOn,
          fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
          cursor: 'pointer',
          boxShadow: `0 0 12px ${t.accentGlow}`,
        }}>
        <IconAgent size={14} strokeWidth={2}/>
        {tr('dash.bubble.new')}
      </button>
      {dialog}
    </>
  );
}

function NewAgentCard({
  onCreate, workspaces,
}: {
  onCreate: (title?: string, workspace?: string, baseBranch?: string) => void;
  workspaces: string[];
}) {
  const t = useTokens();
  const tr = useT();
  const [h, setH] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Mismo flujo que el dialog del header: workspace primero, branch después
  // basado en los favoritos del workspace.
  const defaultWs = typeof window !== 'undefined'
    ? (window.localStorage?.getItem('eco.workspace.default') || '')
    : '';
  const [selectedWs, setSelectedWs] = useState<string>(() => {
    if (defaultWs && workspaces.includes(defaultWs)) return defaultWs;
    return workspaces[0] || '';
  });
  const favorites = useMemo<string[]>(() => {
    if (!selectedWs) return [];
    try {
      const raw = getWorkspaceConfig(selectedWs).baseBranches;
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    } catch { return []; }
  }, [selectedWs]);
  const [baseBranch, setBaseBranch] = useState<string>('');
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  useEffect(() => {
    if (naming) {
      inputRef.current?.focus();
      const ws = (defaultWs && workspaces.includes(defaultWs)) ? defaultWs : (workspaces[0] || '');
      setSelectedWs(ws);
      setCustomMode(false);
      setCustomDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naming]);

  useEffect(() => {
    if (!selectedWs) { setBaseBranch(''); return; }
    let last = '';
    try { last = window.localStorage.getItem(`eco.worktree.last_branch.${selectedWs}`) || ''; }
    catch { /* noop */ }
    let favs: string[] = [];
    try {
      const raw = getWorkspaceConfig(selectedWs).baseBranches;
      favs = raw.split(',').map((s) => s.trim()).filter(Boolean);
    } catch { /* noop */ }
    setBaseBranch(last || favs[0] || '');
    setCustomMode(false);
    setCustomDraft('');
  }, [selectedWs]);

  function submit() {
    const v = draft.trim();
    const branch = customMode ? customDraft.trim() : baseBranch.trim();
    if (branch && selectedWs) {
      try { window.localStorage.setItem(`eco.worktree.last_branch.${selectedWs}`, branch); }
      catch { /* noop */ }
    }
    onCreate(v || undefined, selectedWs || undefined, branch || undefined);
    setDraft('');
    setNaming(false);
  }

  if (naming) {
    return (
      <div
        style={{
          ...glassEffect(t, { intensity: 'normal' }),
          border: `1px solid ${t.accentDim}`,
          background: `linear-gradient(135deg, ${t.accentFaint}, ${t.glassBg})`,
          borderRadius: 18, minHeight: 200,
          padding: 22,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: t.bg3, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${t.glassBorder}`, color: t.accent,
        }}>
          <IconAgent size={22} strokeWidth={1.8}/>
        </div>
        <div style={{ fontSize: 12.5, color: t.text2 }}>{tr('dash.bubble.name_label')}</div>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={tr('dash.bubble.name_placeholder')}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { setDraft(''); setNaming(false); }
          }}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 10, padding: '10px 12px',
            fontFamily: t.fontSans, fontSize: 13.5, color: t.text0,
            outline: 'none',
          }}
        />
        {/* Selector de workspace — filas con path completo. */}
        {workspaces.length > 1 && (
          <div>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 6 }}>
              Carpeta
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {workspaces.map((ws) => {
                const active = selectedWs === ws;
                const name = ws.split('/').filter(Boolean).slice(-1)[0] || ws;
                const display = ws.startsWith(getHome())
                  ? '~' + ws.slice(getHome().length)
                  : ws;
                return (
                  <button
                    key={ws}
                    type="button"
                    onClick={() => setSelectedWs(ws)}
                    title={ws}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      border: `1px solid ${active ? t.accent : t.glassBorder}`,
                      background: active ? t.accentFaint : t.bg2,
                      color: active ? t.accent : t.text1,
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 140ms',
                    }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: active ? t.accent : t.bg3,
                      color: active ? t.accentOn : t.text2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <IconFolder size={11}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500,
                        color: active ? t.accent : t.text0,
                      }}>{name}</div>
                      <div style={{
                        fontFamily: t.fontMono, fontSize: 10.5, color: t.text3,
                        marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{display}</div>
                    </div>
                    {active && <IconCheck size={13}/>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Picker de rama base — favoritos del workspace seleccionado. */}
        <div>
          <div style={{ fontSize: 11, color: t.text2, marginBottom: 6 }}>
            Rama base del worktree {favorites.length === 0 && (
              <span style={{ color: t.text3, fontWeight: 400 }}>
                · sin favoritos para esta carpeta
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {favorites.map((b: string) => {
              const active = !customMode && baseBranch === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => { setCustomMode(false); setBaseBranch(b); }}
                  style={{
                    padding: '5px 10px', borderRadius: 999,
                    border: `1px solid ${active ? t.accent : t.glassBorder}`,
                    background: active ? t.accentFaint : t.bg2,
                    color: active ? t.accent : t.text1,
                    fontFamily: t.fontMono, fontSize: 11, cursor: 'pointer',
                  }}>{b}</button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              style={{
                padding: '5px 10px', borderRadius: 999,
                border: `1px solid ${customMode ? t.accent : t.glassBorder}`,
                background: customMode ? t.accentFaint : t.bg2,
                color: customMode ? t.accent : t.text2,
                fontFamily: t.fontSans, fontSize: 11, cursor: 'pointer',
              }}>otra…</button>
          </div>
          {customMode && (
            <input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder={tr('dash.branch_name_placeholder')}
              spellCheck={false}
              autoCorrect="off"
              style={{
                marginTop: 6, width: '100%', boxSizing: 'border-box',
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                borderRadius: 8, padding: '7px 10px',
                fontFamily: t.fontMono, fontSize: 12, color: t.text0,
                outline: 'none',
              }}
            />
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <button
            type="button"
            onClick={() => { setDraft(''); setNaming(false); }}
            style={{
              flex: 1, height: 32, borderRadius: 999, border: `1px solid ${t.glassBorder}`,
              background: 'transparent', color: t.text1, fontFamily: t.fontSans, fontSize: 12.5,
              cursor: 'pointer',
            }}>{tr('common.cancel')}</button>
          <button
            type="button"
            onClick={submit}
            style={{
              flex: 1, height: 32, borderRadius: 999, border: `1px solid ${t.accent}`,
              background: t.accent, color: t.accentOn, fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer',
            }}>{tr('common.create')}</button>
        </div>
        <div style={{ fontSize: 10.5, color: t.text3 }}>{tr('dash.bubble.enter_hint')}</div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setNaming(true)}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        ...glassEffect(t, { hovered: h, intensity: 'subtle' }),
        border: `1px dashed ${h ? t.accentDim : t.glassBorder}`,
        background: h ? t.accentFaint : t.glassBg,
        borderRadius: 18, minHeight: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 10, cursor: 'pointer',
        color: h ? t.accent : t.text2,
        transform: h ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'background 200ms ease, border-color 200ms ease, transform 200ms ease',
      }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: t.bg3, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${t.glassBorder}`,
      }}>
        <IconAgent size={22} strokeWidth={1.8}/>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{tr('dash.new_bubble')}</div>
      <div style={{ fontSize: 11, color: t.text3 }} dangerouslySetInnerHTML={{ __html: tr('dash.new_bubble_hint') }}/>
    </div>
  );
}

function WorkspaceChip({
  workspace, workspaces, onChange,
}: {
  workspace: string;
  workspaces: string[];
  onChange: (ws: string) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const label = workspace
    ? workspace.split('/').filter(Boolean).slice(-2).join('/')
    : tr('wsp.chip.none');
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close, { once: true });
    return () => document.removeEventListener('click', close);
  }, [open]);
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={workspace || tr('wsp.chip.assign')}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: t.bg3, border: `1px solid ${t.glassBorder}`,
          borderRadius: 999, padding: '4px 10px',
          fontFamily: t.fontMono, fontSize: 10.5, color: workspace ? t.text1 : t.text3,
          cursor: 'pointer', maxWidth: '100%', minWidth: 0,
        }}>
        <IconFolder size={10}/>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </span>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: '110%', left: 0, zIndex: 30,
            minWidth: 240, maxWidth: 320, padding: 4,
            background: t.bg1, border: `1px solid ${t.glassBorder}`,
            borderRadius: 12, boxShadow: t.shadowLg,
            display: 'flex', flexDirection: 'column',
          }}>
          {workspaces.length === 0 ? (
            <div style={{ padding: 10, fontSize: 11.5, color: t.text3 }}>
              {tr('wsp.chip.empty_picker')}
            </div>
          ) : workspaces.map((ws) => (
            <button
              key={ws} type="button"
              onClick={() => { onChange(ws); setOpen(false); }}
              style={{
                ...menuItemStyle(t), fontFamily: t.fontMono, fontSize: 11.5,
                color: ws === workspace ? t.accent : t.text1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
              <IconFolder size={11}/> {ws}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BubbleMenu({
  anchorRef, onClose, onRename, onRemove, currentCategoryIds, onToggleCategory,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onRename: (e: React.MouseEvent) => void;
  onRemove: (e: React.MouseEvent) => void;
  currentCategoryIds?: string[];
  onToggleCategory: (categoryId: string | undefined) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const { categories } = useCategories();
  // Posición fija calculada desde el botón ancla. Portaleamos a <body> para
  // que el menú no quede atrapado bajo el card del agente vecino — cada card
  // es un motion.div con transform → su propio stacking context, así que un
  // z-index local no alcanzaba.
  const [rect] = useState<DOMRect | null>(() =>
    anchorRef.current?.getBoundingClientRect() ?? null);
  useEffect(() => {
    const onDocClick = () => onClose();
    document.addEventListener('click', onDocClick, { once: true });
    return () => document.removeEventListener('click', onDocClick);
  }, [onClose]);
  const menu = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 400,
        top: rect ? rect.bottom + 4 : 0,
        right: rect ? Math.max(8, window.innerWidth - rect.right) : 8,
        minWidth: 180, padding: 4,
        background: t.bg1, border: `1px solid ${t.glassBorder}`,
        borderRadius: 12, boxShadow: t.shadowLg,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <button type="button" onClick={onRename} style={menuItemStyle(t)}>
        <IconAgent size={13}/> {tr('menu.rename')}
      </button>
      {/* Sección de categorías — solo si hay categorías configuradas. */}
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
                onClick={() => onToggleCategory(c.id)}
                style={{ ...menuItemStyle(t), color: active ? t.text0 : t.text1 }}>
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
              onClick={() => onToggleCategory(undefined)}
              style={{ ...menuItemStyle(t), color: t.text3 }}>
              <IconX size={11}/> {tr('dash.category.none')}
            </button>
          )}
          <div style={{ height: 1, background: t.glassBorder, margin: '4px 6px' }}/>
        </>
      )}
      <button type="button" onClick={onRemove} style={{ ...menuItemStyle(t), color: t.err }}>
        <IconTrash size={12}/> {tr('menu.close_bubble')}
      </button>
    </div>
  );
  return createPortal(menu, document.body);
}

function menuItemStyle(t: ReturnType<typeof useTokens>): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderRadius: 8, border: 0, background: 'transparent',
    color: t.text1, fontFamily: t.fontSans, fontSize: 12.5, cursor: 'pointer',
    textAlign: 'left',
  };
}

// ──────────────────── Vista Grid ───────────────────────────────────────────
// Cards de agentes. Si hay más de un workspace en uso, se agrupan por carpeta
// con un header por grupo; con una sola carpeta es un grid plano (un header
// sería ruido).
function GridView({
  bubbles, workspaces, onOpenAgent, onRename, onRemove,
  onChangeWorkspace, onToggleCategory, onCreateAgent,
}: {
  bubbles: Bubble[];
  workspaces: string[];
  onOpenAgent: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onChangeWorkspace: (id: string, workspace: string) => void;
  onToggleCategory: (id: string, categoryId: string | undefined) => void;
  onCreateAgent: (title?: string, workspace?: string, baseBranch?: string) => void;
}) {
  const t = useTokens();
  const tr = useT();

  const groups = (() => {
    const map = new Map<string, Bubble[]>();
    for (const b of bubbles) {
      const key = b.workspace || '__none__';
      const arr = map.get(key);
      if (arr) arr.push(b);
      else map.set(key, [b]);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: key === '__none__'
        ? tr('dash.no_folder')
        : (key.split('/').filter(Boolean).pop() || key),
      path: key === '__none__' ? '' : key,
      items,
    }));
  })();
  const grouped = groups.length > 1;

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 14,
  };

  const renderCard = (b: Bubble, i: number) => (
    <motion.div
      key={b.id}
      layout
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: -8 }}
      transition={{
        type: 'spring', stiffness: 320, damping: 28,
        delay: Math.min(i * 0.03, 0.25),
      }}
      whileHover={{ y: -2 }}
    >
      <AgentBubble
        bubble={b}
        workspaces={workspaces}
        onClick={() => onOpenAgent(b.id)}
        onRename={(title) => onRename(b.id, title)}
        onRemove={() => onRemove(b.id)}
        onChangeWorkspace={(ws) => onChangeWorkspace(b.id, ws)}
        onToggleCategory={(catId) => onToggleCategory(b.id, catId)}
      />
    </motion.div>
  );

  const newCard = (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.1 }}
      whileHover={{ y: -2 }}
    >
      <NewAgentCard onCreate={onCreateAgent} workspaces={workspaces}/>
    </motion.div>
  );

  if (!grouped) {
    return (
      <div style={gridStyle}>
        <AnimatePresence initial={false} mode="popLayout">
          {bubbles.map(renderCard)}
        </AnimatePresence>
        {newCard}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {groups.map((g) => (
        <div key={g.key}>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10,
          }}>
            <IconLayers size={13} strokeWidth={2}/>
            <span style={{
              fontFamily: t.fontSans, fontSize: 13, fontWeight: 600, color: t.text0,
            }}>{g.label}</span>
            {g.path && (
              <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.text3 }}>
                {g.path}
              </span>
            )}
            <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.text3 }}>
              · {g.items.length}
            </span>
          </div>
          <div style={gridStyle}>
            <AnimatePresence initial={false} mode="popLayout">
              {g.items.map(renderCard)}
            </AnimatePresence>
          </div>
        </div>
      ))}
      <div style={gridStyle}>{newCard}</div>
    </div>
  );
}

// ──────────────────── Vista Kanban ─────────────────────────────────────────
// Columnas por estado. Cada agente es una card chiquita arrastrable visualmente
// (drag real es feature aparte — por ahora click para abrir).
function KanbanView({
  bubbles, onOpenAgent, onCreateAgent, workspaces,
}: {
  bubbles: Bubble[];
  onOpenAgent: (id: string) => void;
  onCreateAgent: (title?: string, workspace?: string, baseBranch?: string) => void;
  workspaces: string[];
}) {
  const t = useTokens();
  const tr = useT();
  const { open: openNameDialog, dialog: nameDialog } = useNameAgentDialog(onCreateAgent, workspaces);

  type ColumnDef = {
    id: string;
    label: string;
    color: string;
    match: (b: Bubble) => boolean;
  };

  const columns: ColumnDef[] = [
    {
      id: 'active',
      label: tr('dash.col.active'),
      color: t.accent,
      match: (b) =>
        b.status === 'thinking' || b.status === 'executing' || b.status === 'running',
    },
    {
      id: 'waiting',
      label: tr('dash.col.waiting'),
      color: t.warn,
      match: (b) => b.status === 'waiting' || b.status === 'paused' || b.status === 'pending',
    },
    {
      id: 'idle',
      label: tr('dash.col.idle'),
      color: t.text2,
      match: (b) =>
        (b.status === 'idle' || !b.status) &&
        !(b.ptyOpen) /* idle puros, sin shell abierto */,
    },
    {
      id: 'shell',
      label: tr('dash.col.shell'),
      color: t.busy,
      match: (b) => (b.status === 'idle' || !b.status) && !!b.ptyOpen,
    },
    {
      id: 'done',
      label: tr('dash.col.done'),
      color: t.ok,
      match: (b) => b.status === 'done',
    },
    {
      id: 'error',
      label: tr('dash.col.error'),
      color: t.err,
      match: (b) => b.status === 'error',
    },
  ];

  // Asignamos cada agente a la primera columna que matchee.
  const byColumn = new Map<string, Bubble[]>();
  for (const col of columns) byColumn.set(col.id, []);
  for (const b of bubbles) {
    for (const col of columns) {
      if (col.match(b)) { byColumn.get(col.id)!.push(b); break; }
    }
  }
  // Mostramos solo columnas con al menos un agente, excepto Activos que siempre.
  const visibleCols = columns.filter((c) => c.id === 'active' || (byColumn.get(c.id)?.length ?? 0) > 0);

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      overflowX: 'auto', paddingBottom: 8,
    }}>
      {nameDialog}
      {visibleCols.map((col) => {
        const items = byColumn.get(col.id) ?? [];
        return (
          <motion.div
            key={col.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            style={{
              flex: '0 0 280px',
              background: t.bg2,
              border: `1px solid ${t.glassBorder}`,
              borderRadius: 14,
              padding: 12,
              minHeight: 200,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '2px 4px',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: col.color,
                boxShadow: col.id === 'active' ? `0 0 6px ${col.color}` : 'none',
              }}/>
              <span style={{
                fontFamily: t.fontSans, fontSize: 12.5, color: t.text0, fontWeight: 600,
                letterSpacing: -0.1, flex: 1,
              }}>{col.label}</span>
              <span style={{
                fontFamily: t.fontMono, fontSize: 11, color: t.text3,
                padding: '1px 7px', borderRadius: 999,
                background: t.bg3,
              }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((b, i) => (
                  <motion.div
                    key={b.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                    transition={{
                      type: 'spring', stiffness: 360, damping: 28,
                      delay: Math.min(i * 0.02, 0.15),
                    }}
                    whileHover={{ y: -2 }}
                  >
                    <KanbanCard bubble={b} onOpen={() => onOpenAgent(b.id)}/>
                  </motion.div>
                ))}
              </AnimatePresence>
              {items.length === 0 && (
                <div style={{
                  padding: '14px 8px', textAlign: 'center',
                  fontSize: 11.5, color: t.text3, fontFamily: t.fontSans,
                }}>{tr('dash.empty.cell')}</div>
              )}
            </div>
            {col.id === 'idle' && (
              <button
                type="button"
                onClick={openNameDialog}
                style={{
                  marginTop: 'auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 10px', border: `1px dashed ${t.glassBorder}`,
                  borderRadius: 10, background: 'transparent', cursor: 'pointer',
                  color: t.text2, fontFamily: t.fontSans, fontSize: 11.5,
                }}>
                <IconAgent size={13} strokeWidth={2}/> {tr('dash.new_bubble')}
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// Paths SVG (24x24 viewBox) de los íconos que mostramos en cada satélite.
// Inline acá para no importar componentes que envuelven con <svg> propio.
const SAT_ICONS = {
  chat: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>,
  pty: <path d="M4 17l5-5-5-5M12 19h8"/>,
  // Icono tipo base de datos — cilindro con dos elipses (tapa + base parcial)
  // que da idea de "almacenamiento corriendo". Coincide más con el modelo
  // mental del user para dev servers (frontend + backend + db).
  server: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
      <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/>
    </>
  ),
  browser: (
    <>
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z"/>
    </>
  ),
  // Claude remote control — sparkle de 4 puntas (mark del logo de Claude).
  // El SVG padre del satélite usa fill="none" stroke=accentOn, así que
  // queda como outline limpio del sparkle.
  remote: (
    <path d="M12 4c.4 4.5 1.5 7 6 8-4.5 1-5.6 3.5-6 8-.4-4.5-1.5-7-6-8 4.5-1 5.6-3.5 6-8z"/>
  ),
  // Cambios pendientes — Mark de GitHub (el satélite ahora abre el tab Git → Cambios).
  files: (
    <>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
      <path d="M9 18c-4.51 2-5-2-7-2"/>
    </>
  ),
} as const;

// Mapeo de cada satélite a la tab que se abre en AgentDetail.
type SatKey = 'chat' | 'pty' | 'server' | 'browser' | 'remote' | 'files';
const SAT_TO_TAB: Record<SatKey, 'chat' | 'terminal' | 'server' | 'browser' | 'git'> = {
  chat: 'chat',
  pty: 'terminal',
  server: 'server',
  browser: 'browser',
  remote: 'terminal', // click en el satélite remote te lleva a la terminal
  files: 'git', // el satélite 'files' (archivos modificados) abre el tab Git → Cambios
};

// Satélites alrededor de un electrón — íconos de cada subsistema (chat,
// terminal, server, browser). Solo se muestran los que están activos.
// Layout: orbitando suave. Centrados en (0,0) — el wrapper exterior ya
// posiciona el grupo en el centro del nodo.
function SatellitesLocal({
  n, t, onItemClick,
}: {
  n: {
    id: string; size: number;
    hasChat: boolean; hasPty: boolean; hasServer: boolean; hasBrowser: boolean; hasRemote: boolean; hasFiles: boolean;
  };
  t: ReturnType<typeof useTokens>;
  onItemClick?: (subsystem: SatKey) => void;
}) {
  const [hoverKey, setHoverKey] = useState<SatKey | null>(null);
  const busy = useBubbleBusy(n.id);
  const items: { key: SatKey; on: boolean; color: string; label: string; icon: JSX.Element; pulse?: boolean }[] = [
    { key: 'chat',    on: n.hasChat,    color: '#3b82f6', label: 'Conversación',          icon: SAT_ICONS.chat },
    { key: 'pty',     on: n.hasPty,     color: t.ok,     label: busy ? 'Procesando…' : 'Terminal', icon: SAT_ICONS.pty, pulse: busy },
    // Color morado para diferenciarlo del satélite Server (busy=naranja/amber).
    { key: 'files',   on: n.hasFiles,   color: '#a855f7', label: 'Cambios sin commitear', icon: SAT_ICONS.files, pulse: true },
    // Color amarillo brillante para Server (antes usaba t.busy del tema).
    { key: 'server',  on: n.hasServer,  color: '#facc15', label: 'Server',                icon: SAT_ICONS.server },
    { key: 'browser', on: n.hasBrowser, color: '#94a3b8', label: 'Navegador',             icon: SAT_ICONS.browser },
    // Color naranja Claude — diferencia del t.accent del tema (que coincidía con el verde PTY en algunos temas).
    { key: 'remote',  on: n.hasRemote,  color: '#d97757', label: 'Claude remote control', icon: SAT_ICONS.remote, pulse: true },
  ];
  const visible = items.filter((it) => it.on);
  if (visible.length === 0) return null;

  const r = n.size + 26; // distancia satélite ↔ borde del electrón
  const phase = Array.from(n.id).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  // Tamaño del chip y del ícono.
  const chipR = 9;
  const iconSize = 12;

  return (
    <motion.g
      animate={{ rotate: [phase, phase + 360] }}
      transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}>
      {visible.map((it, idx) => {
        const θ = ((idx / visible.length) * 2 * Math.PI) - Math.PI / 2;
        const sx = Math.cos(θ) * r;
        const sy = Math.sin(θ) * r;
        const lx = Math.cos(θ) * (n.size + 1);
        const ly = Math.sin(θ) * (n.size + 1);
        const isHovered = hoverKey === it.key;
        const effChipR = isHovered ? chipR + 2 : chipR;
        return (
          <g key={it.key}
            style={{ cursor: onItemClick ? 'pointer' : undefined }}
            onMouseEnter={() => setHoverKey(it.key)}
            onMouseLeave={() => setHoverKey((k) => (k === it.key ? null : k))}
            onClick={(e) => {
              if (!onItemClick) return;
              e.stopPropagation();
              onItemClick(it.key);
            }}>
            <line
              x1={lx} y1={ly} x2={sx} y2={sy}
              stroke={it.color} strokeOpacity={isHovered ? 0.9 : 0.5} strokeWidth={isHovered ? 1.5 : 1}
              pointerEvents="none"
            />
            {/* Pulso pequeño que viaja del nodo al satélite, da idea de
                "datos fluyendo". Más pequeño que el pulso Eco→nodo. */}
            <circle r={1.8} fill={it.color} pointerEvents="none"
              style={{ filter: `drop-shadow(0 0 3px ${it.color})` }}>
              <animateMotion
                path={`M${lx},${ly} L${sx},${sy}`}
                dur="1.4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;0.85;0.85;0"
                keyTimes="0;0.15;0.85;1"
                dur="1.4s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Hit area invisible más grande para que sea fácil hover/click */}
            <circle cx={sx} cy={sy} r={chipR + 6} fill="transparent"/>
            {/* Halo cuando hovereado */}
            {isHovered && (
              <circle cx={sx} cy={sy} r={chipR + 4}
                fill="none" stroke={it.color} strokeWidth={1.5}
                style={{ filter: `drop-shadow(0 0 6px ${it.color})` }}
                pointerEvents="none"/>
            )}
            {/* Anillo expansivo cuando el satélite está "pulse" — ej. PTY
                procesando un comando o cambios en archivos. */}
            {it.pulse && (
              <circle cx={sx} cy={sy} r={chipR}
                fill="none" stroke={it.color} strokeWidth={1.4}
                opacity={0.7}
                pointerEvents="none">
                <animate attributeName="r" values={`${chipR};${chipR + 7}`} dur="1.2s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.7;0" dur="1.2s" repeatCount="indefinite"/>
              </circle>
            )}
            {/* Chip de fondo */}
            <circle cx={sx} cy={sy} r={effChipR}
              fill={it.color}
              style={{
                filter: `drop-shadow(0 0 ${isHovered ? 8 : 5}px ${it.color})`,
                transition: 'r 140ms',
              }}
              pointerEvents="none">
              <title>{`Abrir ${it.label}`}</title>
            </circle>
            {/* Ícono encima */}
            <svg
              x={sx - iconSize / 2}
              y={sy - iconSize / 2}
              width={iconSize}
              height={iconSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke={t.accentOn}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none">
              {it.icon}
            </svg>
            {/* Label flotante cuando hovereado — pill arriba del satélite */}
            {isHovered && (
              <g pointerEvents="none">
                <rect
                  x={sx - it.label.length * 3.4 - 6}
                  y={sy - chipR - 22}
                  width={it.label.length * 6.8 + 12}
                  height={16}
                  rx={4}
                  fill={t.bg1}
                  stroke={it.color}
                  strokeOpacity={0.6}
                  strokeWidth={1}
                  style={{ filter: t.shadowLg }}
                />
                <text
                  x={sx} y={sy - chipR - 11}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={t.text0}
                  fontFamily={t.fontSans}
                  fontSize="10.5"
                  fontWeight="500">
                  {it.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </motion.g>
  );
}

function KanbanCard({ bubble, onOpen }: { bubble: Bubble; onOpen: () => void }) {
  const t = useTokens();
  const state = (bubble.status as AgentState) || 'idle';
  const busy = useBubbleBusy(bubble.id);
  const sColor = busy ? t.ok : stateColor(state, t);
  // "Activo" = Claude procesando, dev server arriba, o página web abierta.
  // Un PTY abierto solo no cuenta (shell idle no es trabajo).
  const isActive = useBubbleActive(bubble) || busy;
  const lastMsg = bubble.messages[bubble.messages.length - 1];
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: '100%', textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: 10, borderRadius: 12,
        ...glassEffect(t, { intensity: 'subtle' }),
        // El border de glassEffect lo sobreescribimos cuando el agente está activo
        // para que muestre el color del estado.
        border: `1px solid ${isActive ? sColor : t.glassBorder}`,
        cursor: 'pointer',
        boxShadow: isActive
          ? `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 14px color-mix(in oklch, ${sColor} 30%, transparent), ${t.shadowMd}`
          : `inset 0 1px 0 rgba(255,255,255,0.06), ${t.shadowMd}`,
        transition: 'border-color 180ms, box-shadow 180ms, transform 180ms',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          background: bubble.accent || t.bg3,
          color: t.text0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.fontSans, fontSize: 12, fontWeight: 600,
        }}>{bubbleLetter(bubble.title)}</span>
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: t.fontSans, fontSize: 12.5, color: t.text0, fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{bubble.title}</span>
        {isActive && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: sColor,
            boxShadow: `0 0 6px ${sColor}`,
            animation: 'eco-shimmer 1.1s ease-in-out infinite',
          }}/>
        )}
      </div>
      {lastMsg && (
        <div style={{
          fontSize: 11, color: t.text2, lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {lastMsg.role === 'user' ? '› ' : '← '}{lastMsg.text.slice(0, 120)}
        </div>
      )}
      {bubble.workspace && (
        <div style={{
          fontFamily: t.fontMono, fontSize: 10, color: t.text3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{bubble.workspace.split('/').pop()}</div>
      )}
    </button>
  );
}

function GraphView({ bubbles, onOpenAgent, groupMode = 'workspace', ownerNames }: {
  bubbles: Bubble[];
  onOpenAgent: (id: string) => void;
  // 'workspace' (default): clusters por carpeta. 'owner': clusters por usuario
  // (grafo de equipo del admin) — usa b.ownerId + ownerNames para el label.
  groupMode?: 'workspace' | 'owner';
  ownerNames?: Record<string, string>;
}) {
  const t = useTokens();
  const tr = useT();
  const [hover, setHover] = useState<string | null>(null);
  // Suscripción al store de categorías — re-renderiza el grafo cuando el
  // user agrega/edita/borra una categoría o reasigna agentes. `getCategoryById`
  // (lectura sync) se usa dentro del map, pero necesitamos este hook para
  // que React sepa que tiene que re-pintar.
  useCategories();
  // Estados live de servers por (bubbleId, role) — un agente puede tener
  // frontend y backend corriendo a la vez; cada role se trackea por separado
  // para que parar uno no apague el indicador del otro.
  const [serverRoles, setServerRoles] = useState<Record<string, Record<string, boolean>>>({});
  // Seed inicial: el Dashboard puede montarse después de que el WS ya replicó
  // el snapshot, así que querríamos perder los eventos. Bajamos un listado de
  // sessions activas al backend para sembrar el estado.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/dev/active');
        if (!r.ok || cancelled) return;
        const data = await r.json() as { sessions: Array<{ bubbleId: string; role: string; status: string }> };
        if (!Array.isArray(data.sessions)) return;
        const seed: Record<string, Record<string, boolean>> = {};
        for (const s of data.sessions) {
          const running = s.status === 'running' || s.status === 'starting';
          if (!seed[s.bubbleId]) seed[s.bubbleId] = {};
          seed[s.bubbleId][s.role] = running;
        }
        setServerRoles((prev) => ({ ...prev, ...seed }));
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      const role = d.role ?? 'main';
      const isRunning = d.status === 'running' || d.status === 'starting';
      setServerRoles((prev) => ({
        ...prev,
        [d.bubbleId]: { ...(prev[d.bubbleId] ?? {}), [role]: isRunning },
      }));
    });
  }, []);
  // Helper: hay algún server corriendo para esa burbuja (cualquier rol)?
  function anyServerRunning(bubbleId: string): boolean {
    const roles = serverRoles[bubbleId];
    if (!roles) return false;
    return Object.values(roles).some(Boolean);
  }
  // Estado live del Claude remote control por bubbleId — leemos del localStorage
  // al inicio y escuchamos un CustomEvent que dispara el botón al cambiar.
  const [remoteByBubble, setRemoteByBubble] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('eco.remote.')) {
          const id = k.slice('eco.remote.'.length);
          if (window.localStorage.getItem(k)) out[id] = true;
        }
      }
    } catch { /* noop */ }
    return out;
  });
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ bubbleId: string; slug: string | null }>).detail;
      if (!detail?.bubbleId) return;
      setRemoteByBubble((prev) => ({ ...prev, [detail.bubbleId]: !!detail.slug }));
    }
    window.addEventListener('eco:remote-changed', onChange);
    return () => window.removeEventListener('eco:remote-changed', onChange);
  }, []);

  // Navegadores con URL — reactivo. nodeFlags leía localStorage directo, así
  // que el satélite de navegador no aparecía hasta el próximo re-render. Acá
  // sembramos del storage y escuchamos eco:browser_url_changed para vivo.
  // OJO: el navegador guarda sus tabs en `eco.browser.tabs.<id>` (JSON); la
  // vieja `eco.browser.url.<id>` es legacy y se borra al migrar — por eso
  // antes el satélite nunca salía. Parseamos la key real + fallback legacy.
  const [browsersByBubble, setBrowsersByBubble] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('eco.browser.tabs.')) {
          const id = k.slice('eco.browser.tabs.'.length);
          try {
            const parsed = JSON.parse(window.localStorage.getItem(k) || '{}') as { tabs?: Array<{ url?: string }> };
            if (parsed.tabs?.some((tab) => !!tab.url && tab.url.trim() !== '')) out[id] = true;
          } catch { /* noop */ }
        } else if (k.startsWith('eco.browser.url.')) {
          const id = k.slice('eco.browser.url.'.length);
          if (window.localStorage.getItem(k)) out[id] = true;
        }
      }
    } catch { /* noop */ }
    return out;
  });
  useEffect(() => {
    return ecoOn('eco:browser_url_changed', (e) => {
      setBrowsersByBubble((prev) => ({ ...prev, [e.bubbleId]: !!e.hasUrl }));
    });
  }, []);

  // Dimensiones del canvas — se miden del container real con ResizeObserver.
  // Así el viewBox siempre coincide con los píxeles reales y el contenido
  // no se comprime para caber en una aspect ratio fija.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [{ W, H }, setSize] = useState({ W: 920, H: 980 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(400, Math.round(rect.width));
      const h = Math.max(400, Math.round(rect.height));
      setSize((prev) => (prev.W === w && prev.H === h ? prev : { W: w, H: h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cx = W / 2, cy = H / 2;
  // TILT del plano orbital. 1 = sin tilt (círculos). <1 = elipse achatada
  // verticalmente = vista en perspectiva 3D (sistema solar visto de costado).
  const tilt = 0.62;
  const busyIds = useBusyBubbleIds();
  // hasFiles real basado en `git status` (no heurística sobre history de
  // tool calls del agente). Comparte cache con la FilesPanel — el dot ámbar
  // y el satélite naranja se calculan con la misma fuente de verdad.
  const hasFilesMap = useBubbleHasFilesMap(
    bubbles.map((b) => ({ id: b.id, workspace: b.workspace || '' })),
  );

  // Flags de estado/recursos de un agente — compartido por ambos layouts.
  function nodeFlags(b: Bubble) {
    const state = (b.status as AgentState) || 'idle';
    const hasChat = b.messages.length > 0;
    const hasPty = !!b.ptyOpen;
    const hasServer = anyServerRunning(b.id);
    const hasBrowser = !!browsersByBubble[b.id];
    const hasRemote = !!remoteByBubble[b.id];
    // hasFiles real: viene de `git status` via `useBubbleHasFilesMap`.
    const hasFiles = hasFilesMap.get(b.id) ?? false;
    // "Activo" = el agente está EJECUTANDO algo ahora mismo: Claude procesando
    // o PTY con output. Server up / browser abierto / archivos modificados son
    // estados pasivos — los satélites ya los indican.
    const claudeBusy = state === 'thinking' || state === 'executing' || state === 'running' || state === 'pending';
    const ptyBusy = busyIds.has(b.id);
    const isActive = claudeBusy || ptyBusy;
    return { state, hasChat, hasPty, hasServer, hasBrowser, hasRemote, hasFiles, isActive };
  }
  type GraphNode = Bubble & ReturnType<typeof nodeFlags> & {
    x: number; y: number; size: number;
    parentX: number; parentY: number; parentR: number;
  };

  // --- Agrupación por workspace ---
  // El dashboard se organiza jerárquicamente: el hub Eco conecta a un nodo
  // por carpeta/workspace, y de cada nodo de carpeta salen sus agentes.
  // Excepción: si solo hay UN workspace, los agentes salen directo del hub
  // Eco (sin nodo intermedio) — no aporta nada con un solo proyecto.
  // En modo owner agrupamos por (usuario, workspace) — clave compuesta — para
  // que cada workspace de cada usuario sea su propio cluster (Eco → usuario →
  // workspace → bubbles). En modo normal, por workspace.
  const wsGroups: Array<{ key: string; label: string; items: Bubble[]; ownerId?: string; workspace?: string }> = (() => {
    const SEP = '';
    const map = new Map<string, Bubble[]>();
    for (const b of bubbles) {
      const ws = b.workspace || '__none__';
      const key = groupMode === 'owner' ? `${b.ownerId || '__none__'}${SEP}${ws}` : ws;
      const arr = map.get(key);
      if (arr) arr.push(b);
      else map.set(key, [b]);
    }
    return [...map.entries()].map(([key, items]) => {
      const ws = groupMode === 'owner' ? (key.split(SEP)[1] ?? '__none__') : key;
      const ownerId = groupMode === 'owner' ? (key.split(SEP)[0] ?? '__none__') : undefined;
      return {
        key,
        label: ws === '__none__' ? tr('dash.no_folder') : (ws.split('/').filter(Boolean).pop() || ws),
        items,
        ownerId,
        workspace: ws,
      };
    });
  })();
  // En modo owner SIEMPRE jerárquico: cada usuario debe tener su nodo y sus
  // bubbles colgando de él — aunque haya un solo usuario con agentes (sino
  // colgarían de Eco directamente y parecería que son de "eco").
  const hierarchical = groupMode === 'owner' || wsGroups.length > 1;

  // Nodos de workspace (solo en modo jerárquico). Por defecto se reparten en
  // un arco HORIZONTAL debajo del hub Eco — un anillo completo dejaba (con 2
  // carpetas) una arriba y otra abajo; horizontal se lee mejor al primer
  // acomodo. El user puede arrastrar la vista después.
  // --- Controles de vista independientes, todos persistidos ---
  // SEPARACIÓN (no escala el grupo SVG — multiplica radios de órbita, así
  // cambia la distancia entre nodos sin agrandar círculos ni texto). Dos
  // controles separados, ambos hasta 600%:
  //   · `spreadNodes` (eco.graph.spread_nodes): separación entre los agentes
  //     y su nodo de carpeta (en modo plano, agentes ↔ Eco).
  //   · `spreadWs` (eco.graph.spread_ws): separación entre los nodos de
  //     carpeta y el hub Eco.
  // ZOOM VISUAL (`viewScale` / eco.graph.scale): un `scale()` sobre todo el
  // grupo paneable — agranda/achica TODA la vista (nodos, texto, líneas).
  // Se declaran acá arriba porque entran en el cálculo de posiciones.
  const ZOOM_MIN = 0.4;
  const SPREAD_MAX = 6;    // separación: hasta 600%
  const SCALE_MAX = 2.4;   // zoom visual: hasta 240%
  const clamp = (v: number, max: number) =>
    Math.min(max, Math.max(ZOOM_MIN, Math.round(v * 100) / 100));
  const loadZoom = (key: string, max: number) => {
    try {
      const raw = window.localStorage.getItem(key);
      const v = raw ? parseFloat(raw) : 1;
      return Number.isFinite(v) ? clamp(v, max) : 1;
    } catch { return 1; }
  };
  const makeSetter = (key: string, max: number, set: (fn: (z: number) => number) => void) =>
    (next: number | ((z: number) => number)) => {
      set((prev) => {
        const v = clamp(typeof next === 'function' ? next(prev) : next, max);
        try { window.localStorage.setItem(key, String(v)); } catch { /* noop */ }
        return v;
      });
    };

  const SPREAD_NODES_KEY = 'eco.graph.spread_nodes';
  const SPREAD_WS_KEY = 'eco.graph.spread_ws';
  const SCALE_KEY = 'eco.graph.scale';
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [spreadNodes, setSpreadNodesState] = useState<number>(() => loadZoom(SPREAD_NODES_KEY, SPREAD_MAX));
  const [spreadWs, setSpreadWsState] = useState<number>(() => loadZoom(SPREAD_WS_KEY, SPREAD_MAX));
  const [viewScale, setViewScaleState] = useState<number>(() => loadZoom(SCALE_KEY, SCALE_MAX));
  // Escritura inline (no useEffect) — mismo patrón que el zoom del BrowserPanel,
  // evita timing raro con HMR/unmount.
  const setSpreadNodes = makeSetter(SPREAD_NODES_KEY, SPREAD_MAX, setSpreadNodesState);
  const setSpreadWs = makeSetter(SPREAD_WS_KEY, SPREAD_MAX, setSpreadWsState);
  const setViewScale = makeSetter(SCALE_KEY, SCALE_MAX, setViewScaleState);

  // --- Offset manual por nodo de workspace (persistido) ---
  // El user puede arrastrar el nodo de una carpeta a donde quiera; sus agentes
  // se mueven con él (sus posiciones se calculan relativas a ws.x/ws.y). El
  // offset vive en coords del grupo (sin escalar) — al arrastrar dividimos el
  // delta de pantalla por `viewScale`. Se declara acá arriba porque entra en
  // el cálculo de posiciones de los nodos de workspace.
  const WS_OFFSETS_KEY = 'eco.graph.ws_offsets';
  const [wsOffsets, setWsOffsets] = useState<Record<string, { dx: number; dy: number }>>(() => {
    try {
      const raw = window.localStorage.getItem(WS_OFFSETS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch { return {}; }
  });
  const persistWsOffsets = (v: Record<string, { dx: number; dy: number }>) => {
    try { window.localStorage.setItem(WS_OFFSETS_KEY, JSON.stringify(v)); } catch { /* noop */ }
  };

  // --- Offset manual por nodo de agente (persistido) ---
  // Igual que los workspace: el user puede arrastrar un agente a donde quiera.
  // El offset se suma a la posición calculada por la órbita.
  const AGENT_OFFSETS_KEY = 'eco.graph.agent_offsets';
  const [agentOffsets, setAgentOffsets] = useState<Record<string, { dx: number; dy: number }>>(() => {
    try {
      const raw = window.localStorage.getItem(AGENT_OFFSETS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch { return {}; }
  });
  const persistAgentOffsets = (v: Record<string, { dx: number; dy: number }>) => {
    try { window.localStorage.setItem(AGENT_OFFSETS_KEY, JSON.stringify(v)); } catch { /* noop */ }
  };

  const WS_NODE_R = 26;
  // El radio del anillo de carpetas se calcula según cuántas carpetas hay:
  // más carpetas → anillo más grande para que el arco horizontal no se
  // amontone. Tope al 46% del lado menor del canvas. `spreadWs` multiplica
  // esta separación (carpetas ↔ Eco).
  const OWNER_NODE_R = 30;
  const ownerMode = groupMode === 'owner';
  // En el grafo de admin el núcleo "eco" es más grande para diferenciarse de
  // los nodos de usuario (que también son círculos con acento).
  const ECO_HUB_R = ownerMode ? 46 : 34;

  // Tier de USUARIO (solo owner mode): un nodo por dueño, en arco horizontal
  // alrededor de Eco. Los workspaces de cada usuario orbitan SU nodo.
  const ownerGroupsArr: Array<[string, Bubble[]]> = ownerMode
    ? (() => {
        const m = new Map<string, Bubble[]>();
        for (const b of bubbles) {
          const k = b.ownerId || '__none__';
          const a = m.get(k);
          if (a) a.push(b); else m.set(k, [b]);
        }
        return [...m.entries()];
      })()
    : [];
  const ownerOrbitR = Math.min(
    Math.min(W, H) * 0.46,
    Math.max(180, 120 + ownerGroupsArr.length * 46),
  ) * spreadWs;
  const ownerNodes = ownerGroupsArr.map(([id, items], i) => {
    const N = ownerGroupsArr.length;
    const aStart = Math.PI * (175 / 180);
    const aEnd = Math.PI * (5 / 180);
    const angle = N === 1 ? Math.PI / 2 : aStart + (i / (N - 1)) * (aEnd - aStart);
    // Offset manual si el admin arrastró este nodo de usuario (reusa wsOffsets
    // con clave 'owner:<id>'). Sus workspaces y bubbles cuelgan de o.x/o.y, así
    // que se mueven con él automáticamente.
    const off = wsOffsets['owner:' + id] ?? { dx: 0, dy: 0 };
    return {
      id, key: 'owner:' + id,
      label: ownerNames?.[id] ?? '—',
      items, angle, angleDeg: (angle * 180) / Math.PI,
      x: cx + Math.cos(angle) * ownerOrbitR + off.dx,
      y: cy + Math.sin(angle) * ownerOrbitR * tilt + off.dy,
      active: items.some((b) => nodeFlags(b).isActive),
    };
  });

  const wsOrbitR = Math.min(
    Math.min(W, H) * 0.46,
    Math.max(170, 110 + wsGroups.length * 42),
  ) * spreadWs;
  const wsAroundOwnerR = 110 * spreadNodes;
  const wsNodes = !hierarchical
    ? []
    : ownerMode
      ? ownerNodes.flatMap((o) => {
          const owWs = wsGroups.filter((g) => g.ownerId === o.id);
          const k = owWs.length;
          const span = Math.min(280, 60 + k * 40);
          return owWs.map((g, j) => {
            const phaseDeg = k === 1 ? o.angleDeg : o.angleDeg - span / 2 + (j / (k - 1)) * span;
            const ph = (phaseDeg * Math.PI) / 180;
            const off = wsOffsets[g.key] ?? { dx: 0, dy: 0 };
            return {
              ...g, angle: ph, angleDeg: phaseDeg,
              x: o.x + Math.cos(ph) * wsAroundOwnerR + off.dx,
              y: o.y + Math.sin(ph) * wsAroundOwnerR * tilt + off.dy,
              parentX: o.x, parentY: o.y, parentR: OWNER_NODE_R,
              active: g.items.some((b) => nodeFlags(b).isActive),
            };
          });
        })
      : wsGroups.map((g, i) => {
          const N = wsGroups.length;
          const aStart = Math.PI * (175 / 180);
          const aEnd = Math.PI * (5 / 180);
          const angle = N === 1 ? Math.PI / 2 : aStart + (i / (N - 1)) * (aEnd - aStart);
          const off = wsOffsets[g.key] ?? { dx: 0, dy: 0 };
          return {
            ...g, angle, angleDeg: (angle * 180) / Math.PI,
            x: cx + Math.cos(angle) * wsOrbitR + off.dx,
            y: cy + Math.sin(angle) * wsOrbitR * tilt + off.dy,
            parentX: cx, parentY: cy, parentR: 34,
            active: g.items.some((b) => nodeFlags(b).isActive),
          };
        });

  const nodes: GraphNode[] = [];
  if (!hierarchical) {
    // Layout plano: todos los agentes orbitan el hub Eco. El radio base y el
    // espaciado entre anillos se calculan según la cantidad de agentes en
    // pantalla — pocos agentes → anillos más amplios para ocupar el canvas;
    // muchos → más juntos para que el conjunto no se disperse de más.
    const cnt = Math.max(1, bubbles.length);
    const orbitBaseR = Math.max(88, 165 - cnt * 14);
    const orbitSpacing = Math.max(34, 60 - cnt * 5);
    bubbles.forEach((b, i) => {
      const orbitR = (orbitBaseR + i * orbitSpacing) * spreadNodes;
      const phaseDeg = (i * 67) % 360;
      const f = nodeFlags(b);
      const aoff = agentOffsets[b.id] ?? { dx: 0, dy: 0 };
      nodes.push({
        ...b, ...f,
        parentX: cx, parentY: cy, parentR: 34,
        x: cx + Math.cos((phaseDeg * Math.PI) / 180) * orbitR + aoff.dx,
        y: cy + Math.sin((phaseDeg * Math.PI) / 180) * orbitR * tilt + aoff.dy,
        size: 22 + (f.state === 'running' ? 8 : 0),
      });
    });
  } else {
    // Layout jerárquico: los agentes orbitan su nodo de workspace, abriéndose
    // en abanico hacia afuera del hub Eco para no cruzar el enlace Eco→carpeta.
    wsNodes.forEach((ws) => {
      const m = ws.items.length;
      // El radio de la órbita de agentes se calcula según cuántos agentes
      // tiene la carpeta — más agentes → órbita más amplia para que el
      // abanico no se amontone.
      const miniBaseR = Math.max(86, 58 + m * 17);
      const arcSpan = Math.min(300, 70 + m * 38);
      ws.items.forEach((b, j) => {
        const phaseDeg = m === 1
          ? ws.angleDeg
          : ws.angleDeg - arcSpan / 2 + (j / (m - 1)) * arcSpan;
        const orbitR = (miniBaseR + (j % 2) * 28) * spreadNodes;
        const f = nodeFlags(b);
        const aoff = agentOffsets[b.id] ?? { dx: 0, dy: 0 };
        nodes.push({
          ...b, ...f,
          parentX: ws.x, parentY: ws.y, parentR: WS_NODE_R,
          x: ws.x + Math.cos((phaseDeg * Math.PI) / 180) * orbitR + aoff.dx,
          y: ws.y + Math.sin((phaseDeg * Math.PI) / 180) * orbitR * tilt + aoff.dy,
          size: 22 + (f.state === 'running' ? 8 : 0),
        });
      });
    });
  }

  // --- Pan de la vista completa ---
  // Click + arrastre sobre el espacio vacío (la grilla de fondo) desplaza todo
  // el contenido del grafo. El viewBox es 1:1 con los píxeles del container
  // (W/H se miden del container real), así que el delta de mouse en px se
  // aplica directo como traslación en unidades del viewBox.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  // --- Drag manual de nodos de workspace y de agentes ---
  const [wsDragging, setWsDragging] = useState<string | null>(null);
  const wsDragRef = useRef<{ key: string; sx: number; sy: number; dx0: number; dy0: number } | null>(null);
  const [agentDragging, setAgentDragging] = useState<string | null>(null);
  const agentDragRef = useRef<{ id: string; sx: number; sy: number; dx0: number; dy0: number; moved: boolean } | null>(null);
  // Tras un drag real de agente, suprimimos el click que dispara el mouseup
  // para no abrir el agente sin querer.
  const agentClickSuppressedRef = useRef(false);
  // Ref siempre-actual de viewScale — el listener de mousemove se registra una
  // sola vez y necesita el valor vigente para convertir px de pantalla a
  // unidades del grupo escalado.
  const viewScaleRef = useRef(viewScale);
  viewScaleRef.current = viewScale;

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (d) {
        setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
        return;
      }
      const s = viewScaleRef.current || 1;
      const w = wsDragRef.current;
      if (w) {
        const dx = w.dx0 + (e.clientX - w.sx) / s;
        const dy = w.dy0 + (e.clientY - w.sy) / s;
        setWsOffsets((prev) => ({ ...prev, [w.key]: { dx, dy } }));
        return;
      }
      const a = agentDragRef.current;
      if (a) {
        if (Math.hypot(e.clientX - a.sx, e.clientY - a.sy) > 4) a.moved = true;
        const dx = a.dx0 + (e.clientX - a.sx) / s;
        const dy = a.dy0 + (e.clientY - a.sy) / s;
        setAgentOffsets((prev) => ({ ...prev, [a.id]: { dx, dy } }));
      }
    }
    function onUp() {
      if (dragRef.current) { dragRef.current = null; setDragging(false); }
      if (wsDragRef.current) {
        wsDragRef.current = null;
        setWsDragging(null);
        // Persistimos al soltar (no en cada move — evita escrituras masivas).
        setWsOffsets((cur) => { persistWsOffsets(cur); return cur; });
      }
      if (agentDragRef.current) {
        const moved = agentDragRef.current.moved;
        agentDragRef.current = null;
        setAgentDragging(null);
        if (moved) {
          agentClickSuppressedRef.current = true;
          setAgentOffsets((cur) => { persistAgentOffsets(cur); return cur; });
        }
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  function startPan(e: ReactMouseEvent) {
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
  }
  function startWsDrag(key: string, e: ReactMouseEvent) {
    e.stopPropagation();
    const cur = wsOffsets[key] ?? { dx: 0, dy: 0 };
    wsDragRef.current = { key, sx: e.clientX, sy: e.clientY, dx0: cur.dx, dy0: cur.dy };
    setWsDragging(key);
  }
  function startAgentDrag(id: string, e: ReactMouseEvent) {
    e.stopPropagation();
    const cur = agentOffsets[id] ?? { dx: 0, dy: 0 };
    agentDragRef.current = { id, sx: e.clientX, sy: e.clientY, dx0: cur.dx, dy0: cur.dy, moved: false };
    setAgentDragging(id);
  }

  // Zoom con la rueda/pinch del mouse sobre el grafo → zoom visual de toda la
  // vista (`viewScale`), no la separación de nodos. Listener no-pasivo para
  // poder hacer preventDefault y que la página no scrollee.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setViewScale((z) => z * (1 - e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const zoomBtnStyle: CSSProperties = {
    width: 26, height: 26, borderRadius: 999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 0, color: t.text1,
    cursor: 'pointer', fontFamily: t.fontSans,
  };
  const pillStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 2,
    padding: 3, borderRadius: 999,
    background: t.bg2, border: `1px solid ${t.glassBorder}`,
    boxShadow: t.shadowMd,
  };
  const pillIconStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 26, color: t.text3, flexShrink: 0,
  };
  const pctBtnStyle: CSSProperties = {
    ...zoomBtnStyle, width: 'auto', minWidth: 42, padding: '0 8px',
    fontSize: 11, fontVariantNumeric: 'tabular-nums',
  };
  const viewBtnStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 10px', borderRadius: 999,
    background: t.bg2, border: `1px solid ${t.glassBorder}`,
    color: t.text1, fontFamily: t.fontSans, fontSize: 11,
    cursor: 'pointer', boxShadow: t.shadowMd, whiteSpace: 'nowrap',
  };

  // --- Pantalla completa de la vista de nodos ---
  // "Fake fullscreen" con position:fixed — funciona igual en web y Electron,
  // y no depende de la Fullscreen API. Esc sale. El estado se persiste, así
  // que si dejaste la vista en full, vuelve en full. Cuando está en full la
  // vista se renderiza vía portal a <body> para escapar de los stacking
  // contexts de los ancestros — sin esto el dock (fixed) quedaba por encima.
  const FULL_KEY = 'eco.graph.fullscreen';
  const [isFull, setIsFull] = useState<boolean>(() => {
    try { return window.localStorage.getItem(FULL_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(FULL_KEY, isFull ? '1' : '0'); } catch { /* noop */ }
  }, [isFull]);
  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setIsFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFull]);

  const graph = (
    <Glass radius={isFull ? 0 : 20} style={{
      position: isFull ? 'fixed' : 'relative',
      ...(isFull
        ? { inset: 0, height: '100vh', width: '100vw', zIndex: 9000 }
        : { height: 'min(92vh, 1600px)', minHeight: 520 }),
      padding: 0, overflow: 'hidden',
    }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}/>
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="eco-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="16" cy="16" r="0.6" fill={t.text3} opacity="0.3"/>
          </pattern>
          <radialGradient id="eco-glow">
            <stop offset="0%" stopColor={t.accent} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={t.accent} stopOpacity="0"/>
          </radialGradient>
          {/* Filtro gooey — hace que nodos cercanos se fundan tipo gota de mercurio */}
          <filter id="eco-gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feColorMatrix in="blur" mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo"/>
            <feBlend in="SourceGraphic" in2="goo"/>
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#eco-grid)"
          onMouseDown={startPan}
          style={{ cursor: dragging ? 'grabbing' : 'grab', pointerEvents: 'all' }}/>

        {/* Partículas tipo "estrellas" en el fondo. Twinkleando (opacity + r)
            y drifteando muy lentamente en un loop pequeño para que se sientan
            vivas. Coordenadas relativas al viewBox W×H. */}
        {[
          { fx: 0.08, fy: 0.12, r: 2.5, dur: 7,  color: t.accent },
          { fx: 0.25, fy: 0.78, r: 2,   dur: 8,  color: 'oklch(72% 0.16 290)' },
          { fx: 0.42, fy: 0.90, r: 2.5, dur: 7,  color: 'oklch(78% 0.15 220)' },
          { fx: 0.55, fy: 0.08, r: 2,   dur: 9,  color: t.accent },
          { fx: 0.74, fy: 0.22, r: 2.5, dur: 10, color: 'oklch(78% 0.15 220)' },
          { fx: 0.92, fy: 0.14, r: 2,   dur: 9,  color: 'oklch(72% 0.16 290)' },
          { fx: 0.05, fy: 0.55, r: 2,   dur: 10, color: 'oklch(78% 0.15 220)' },
        ].map((p, i) => {
          const x = p.fx * W;
          const y = p.fy * H;
          const delay = (i * 0.71) % p.dur;
          // Wander — cada partícula recorre lentamente una curva amplia a
          // través del canvas (no flotando en su lugar, sino migrando).
          // Generamos dos puntos de control determinísticos por índice para
          // que cada trayectoria sea única.
          const wanderDur = 50 + (i % 7) * 8;          // 50-98s
          const wanderDelay = (i * 3.7) % wanderDur;
          const seed1x = ((i * 73) % 100) / 100;
          const seed1y = ((i * 41) % 100) / 100;
          const seed2x = ((i * 89) % 100) / 100;
          const seed2y = ((i * 67) % 100) / 100;
          const cp1x = (seed1x * 0.7 + 0.15) * W;
          const cp1y = (seed1y * 0.7 + 0.15) * H;
          const cp2x = (seed2x * 0.7 + 0.15) * W;
          const cp2y = (seed2y * 0.7 + 0.15) * H;
          // Path cerrado tipo "figura 8" — recorre dos puntos del canvas y
          // regresa al origen sin acumular drift.
          const path = `M ${x},${y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${cp1x},${cp2y} S ${cp2x},${cp1y} ${x},${y}`;
          return (
            <g key={'particle-' + i} style={{ pointerEvents: 'none' }}>
              <circle cx={0} cy={0} r={p.r}
                fill={p.color}
                style={{ filter: `drop-shadow(0 0 4px ${p.color})`, opacity: 0.5 }}>
                <animate attributeName="opacity"
                  values="0.12;0.5;0.12"
                  dur={`${p.dur}s`}
                  begin={`-${delay}s`}
                  repeatCount="indefinite"/>
                <animate attributeName="r"
                  values={`${p.r * 0.7};${p.r * 1.3};${p.r * 0.7}`}
                  dur={`${p.dur}s`}
                  begin={`-${delay}s`}
                  repeatCount="indefinite"/>
                <animateMotion
                  path={path}
                  dur={`${wanderDur}s`}
                  begin={`-${wanderDelay}s`}
                  repeatCount="indefinite"/>
              </circle>
            </g>
          );
        })}

        {/* (Anillos orbitales removidos — el sistema se ve más limpio sin
            las elipses de fondo, dejando solo enlaces vivos núcleo→electrón.) */}

        {/* Grupo paneable — glow + hub + nodos de workspace + electrones +
            enlaces. La grilla y las partículas quedan fijas como fondo.
            `pan` desplaza; `viewScale` hace zoom visual de TODA la vista
            (escala alrededor del centro del canvas). La separación entre
            nodos es otro control aparte (`zoom`, sobre los radios). */}
        <g transform={`translate(${pan.x},${pan.y}) translate(${cx},${cy}) scale(${viewScale}) translate(${-cx},${-cy})`}>
        {/* Glow radial del centro — se mueve junto con el hub Eco al panear. */}
        <motion.circle
          cx={cx} cy={cy} r={Math.min(W, H) * 0.5} fill="url(#eco-glow)"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
          style={{ transformOrigin: `${cx}px ${cy}px`, pointerEvents: 'none' }}
        />
        {/* Hub central — respira sutil (escala el círculo de fondo) y
            emite 2 anillos expansivos cuando hay actividad en cualquier nodo. */}
        <motion.g
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3.6, ease: 'easeInOut', repeat: Infinity }}>
          <circle cx={cx} cy={cy} r={ECO_HUB_R} fill={t.bg1}
            stroke={t.accent} strokeWidth="1" strokeOpacity="0.6"/>
        </motion.g>
        {/* Anillo expansivo 1 */}
        <motion.circle
          cx={cx} cy={cy} r={ECO_HUB_R - 6} fill="none"
          stroke={t.accent} strokeWidth="0.5"
          animate={{ r: [ECO_HUB_R - 6, ECO_HUB_R + 10, ECO_HUB_R - 6], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        />
        {/* Anillo expansivo 2, desfasado */}
        <motion.circle
          cx={cx} cy={cy} r={ECO_HUB_R - 6} fill="none"
          stroke={t.accent} strokeWidth="0.5"
          animate={{ r: [ECO_HUB_R - 6, ECO_HUB_R + 10, ECO_HUB_R - 6], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, delay: 1.2 }}
        />
        {/* Wordmark "eco" dentro del hub — replica /assets/eco-wordmark.svg.
            SF Pro Display, weight 300, tracking sutil. Más limpio que el arco
            para el centro del modelo de Bohr. */}
        <motion.text
          x={cx} y={cy + 1}
          textAnchor="middle" dominantBaseline="middle"
          fill={t.text0}
          fontFamily='-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif'
          fontSize={ownerMode ? 30 : 24} fontWeight="300" letterSpacing="0.6"
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3.6, ease: 'easeInOut', repeat: Infinity }}>
          eco
        </motion.text>

        {/* Enlaces hub Eco → nodo de usuario (solo modo owner / admin). */}
        {ownerMode && ownerNodes.map((o) => {
          const dx = o.x - cx, dy = o.y - cy;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const ux = dx / dist, uy = dy / dist;
          const gap = 2;
          const x1 = cx + ux * (ECO_HUB_R + gap);
          const y1 = cy + uy * (ECO_HUB_R + gap);
          const x2 = o.x - ux * (OWNER_NODE_R + gap);
          const y2 = o.y - uy * (OWNER_NODE_R + gap);
          const stroke = o.active ? t.accent : t.text2;
          const opacity = o.active ? 0.6 : 0.28;
          return (
            <line key={'owner-bond-' + o.id}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={stroke} strokeOpacity={opacity}
              strokeWidth={o.active ? 1.6 : 1.2}
              strokeLinecap="round"/>
          );
        })}

        {/* Enlaces hub Eco → nodo de workspace (solo modo jerárquico). */}
        {hierarchical && wsNodes.map((ws) => {
          // El padre es Eco (modo normal) o el nodo de usuario (modo owner).
          const px = ws.parentX, py = ws.parentY, pr = ws.parentR;
          const dx = ws.x - px;
          const dy = ws.y - py;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const ux = dx / dist;
          const uy = dy / dist;
          const gap = 2;
          const x1 = px + ux * (pr + gap);
          const y1 = py + uy * (pr + gap);
          const x2 = ws.x - ux * (WS_NODE_R + gap);
          const y2 = ws.y - uy * (WS_NODE_R + gap);
          const stroke = ws.active ? t.accent : t.text2;
          const opacity = ws.active ? 0.6 : 0.28;
          const pulseDur = Math.max(1.1, Math.min(2.6, dist / 240));
          return (
            <g key={'ws-bond-' + ws.key}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={stroke} strokeOpacity={opacity}
                strokeWidth={ws.active ? 1.6 : 1.2}
                strokeDasharray={ws.active ? '4 6' : '0'}
                strokeLinecap="round"
                style={ws.active ? {
                  animation: 'eco-flow 1.1s linear infinite',
                  filter: `drop-shadow(0 0 4px ${t.accent})`,
                } : undefined}
              />
              {ws.active && (
                <circle r={3} fill={t.ok}
                  style={{ filter: `drop-shadow(0 0 6px ${t.ok})` }}>
                  <animateMotion path={`M${x1},${y1} L${x2},${y2}`}
                    dur={`${pulseDur}s`} repeatCount="indefinite" rotate="0"/>
                  <animate attributeName="opacity" values="0;1;1;0"
                    keyTimes="0;0.1;0.85;1" dur={`${pulseDur}s`} repeatCount="indefinite"/>
                </circle>
              )}
            </g>
          );
        })}

        {/* Líneas tenues del núcleo (hub Eco o nodo de workspace) a cada
            electrón — "enlaces" químicos. Van de BORDE a BORDE (no de centro
            a centro) así no se incrustan dentro de los círculos. */}
        {nodes.map((n) => {
          // Activo = SDK corriendo o PTY abierto (la terminal cuenta como vida).
          const isActive = n.isActive;
          const sColor = stateColor(n.state, t);
          const stroke = hover === n.id ? t.accent : (isActive ? sColor : t.text2);
          const opacity = hover === n.id ? 0.85 : (isActive ? 0.6 : 0.22);
          // Vector unitario del centro del padre (hub Eco o nodo de workspace)
          // al centro del electrón.
          const dx = n.x - n.parentX;
          const dy = n.y - n.parentY;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const ux = dx / dist;
          const uy = dy / dist;
          // Margen extra para que la línea no toque exactamente el borde.
          const gap = 2;
          const x1 = n.parentX + ux * (n.parentR + gap);
          const y1 = n.parentY + uy * (n.parentR + gap);
          const x2 = n.x - ux * (n.size + gap);
          const y2 = n.y - uy * (n.size + gap);
          // Distancia → duración del pulso (más lejos, un poco más lento).
          const pulseDur = Math.max(0.9, Math.min(2.2, dist / 240));
          return (
            <g key={'bond-' + n.id}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={stroke}
                strokeOpacity={opacity}
                strokeWidth={isActive ? 1.4 : 1}
                strokeDasharray={isActive ? '4 6' : '0'}
                strokeLinecap="round"
                style={isActive ? {
                  animation: 'eco-flow 1.1s linear infinite',
                  filter: `drop-shadow(0 0 4px ${sColor})`,
                } : undefined}
              />
              {/* Pulso verde viajando de Eco al nodo. Solo cuando el agente
                  está activo. Es un círculo pequeño con animateMotion que
                  recorre la línea + un pulse de opacidad / radio. */}
              {isActive && (
                <circle r={3} fill={t.ok}
                  style={{ filter: `drop-shadow(0 0 6px ${t.ok})` }}>
                  <animateMotion
                    path={`M${x1},${y1} L${x2},${y2}`}
                    dur={`${pulseDur}s`}
                    repeatCount="indefinite"
                    rotate="0"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.1;0.85;1"
                    dur={`${pulseDur}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="r"
                    values="1.6;3.2;3.2;1.6"
                    keyTimes="0;0.15;0.85;1"
                    dur={`${pulseDur}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}

        {/* Nodos de usuario (modo owner / admin) — inicial + nombre. */}
        {ownerMode && ownerNodes.map((o) => (
          <g key={'owner-node-' + o.id} transform={`translate(${o.x},${o.y})`}
            onMouseDown={(e) => startWsDrag(o.key, e)}
            style={{ cursor: wsDragging === o.key ? 'grabbing' : 'grab' }}>
            {o.active && (
              <motion.circle cx={0} cy={0} r={OWNER_NODE_R}
                fill="none" stroke={t.accent} strokeWidth={1.4}
                animate={{ r: [OWNER_NODE_R, OWNER_NODE_R + 16], opacity: [0.45, 0] }}
                transition={{ duration: 2.2, ease: 'easeOut', repeat: Infinity }}/>
            )}
            <circle cx={0} cy={0} r={OWNER_NODE_R}
              fill={t.accentFaint} stroke={t.accent}
              strokeWidth={o.active ? 2 : 1.4} strokeOpacity={0.85}/>
            <text x={0} y={5} textAnchor="middle" fill={t.accent}
              fontFamily={t.fontSans} fontSize="16" fontWeight="700"
              style={{ pointerEvents: 'none' }}>
              {o.label.charAt(0).toUpperCase()}
            </text>
            <text x={0} y={OWNER_NODE_R + 16} textAnchor="middle" fill={t.text0}
              fontFamily={t.fontSans} fontSize="12.5" fontWeight="600"
              style={{ pointerEvents: 'none' }}>
              {o.label.length > 16 ? o.label.slice(0, 16) + '…' : o.label}
            </text>
          </g>
        ))}

        {/* Nodos de workspace — un círculo por carpeta, con glifo de folder
            y el nombre de la carpeta. Solo en modo jerárquico (2+ proyectos). */}
        {hierarchical && wsNodes.map((ws) => (
          <g key={'ws-node-' + ws.key} transform={`translate(${ws.x},${ws.y})`}
            onMouseDown={(e) => startWsDrag(ws.key, e)}
            style={{ cursor: wsDragging === ws.key ? 'grabbing' : 'grab' }}>
            {ws.active && (
              <motion.circle cx={0} cy={0} r={WS_NODE_R}
                fill="none" stroke={t.accent} strokeWidth={1.4}
                animate={{ r: [WS_NODE_R, WS_NODE_R + 14], opacity: [0.45, 0] }}
                transition={{ duration: 2.2, ease: 'easeOut', repeat: Infinity }}/>
            )}
            <circle cx={0} cy={0} r={WS_NODE_R}
              fill={t.bg1}
              stroke={ws.active ? t.accent : t.glassBorder}
              strokeWidth={ws.active ? 1.6 : 1}
              strokeOpacity={ws.active ? 0.8 : 0.7}/>
            {/* Glifo de workspace — capas apiladas (layers): un proyecto con
                varias partes. Rombo superior + dos ecos hacia abajo. */}
            <g fill="none" stroke={t.text1} strokeWidth={1.5}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M0,-8 L9,-3.5 L0,1 L-9,-3.5 Z"/>
              <path d="M-9,0 L0,4.5 L9,0"/>
              <path d="M-9,3.5 L0,8 L9,3.5"/>
            </g>
            <text x={0} y={WS_NODE_R + 15} textAnchor="middle"
              fill={t.text1} fontFamily={t.fontSans} fontSize="11.5" fontWeight="600"
              style={{ pointerEvents: 'none' }}>
              {ws.label.length > 18 ? ws.label.slice(0, 18) + '…' : ws.label}
            </text>
            <text x={0} y={WS_NODE_R + 28} textAnchor="middle"
              fill={t.text3} fontFamily={t.fontSans} fontSize="10"
              style={{ pointerEvents: 'none' }}>
              {tr(ws.items.length === 1 ? 'graph.ws.agents_one' : 'graph.ws.agents_many', { n: ws.items.length })}
            </text>
          </g>
        ))}

        {/* Electrones — fijos en sus orbitales (como modelo de Bohr). Sin
            rotación. Wobble local muy leve para que se sientan "vivos"
            sin moverse del orbital. */}
        {nodes.map((n, i) => {
          const isActive = n.isActive;
          const isHover = hover === n.id;
          // Si la burbuja tiene categoría, su color tiñe el electrón —
          // así agrupás visualmente los agentes por categoría. Sin
          // categoría, cae al color del estado (legacy).
          // Con multi-categoría, la primera asignada manda el color del nodo;
          // todas se muestran como dots debajo del label (cap 4).
          const nodeCategories = (n.categoryIds ?? [])
            .map(getCategoryById)
            .filter((c): c is NonNullable<ReturnType<typeof getCategoryById>> => c !== null)
            .slice(0, 4);
          const nodeCategory = nodeCategories[0] ?? null;
          const sColor = nodeCategory ? nodeCategory.color : stateColor(n.state, t);
          // Wobble local de 2-3 px alrededor de la posición fija — apenas
          // perceptible, da sensación de que el electrón "vibra" en su
          // estado cuántico sin desplazarse del orbital.
          const wobbleAmp = isActive ? 3 : 2;
          const wobbleDur = 3 + (i % 4) * 0.8;
          const phase = ((i * 0.27) % 1) * wobbleDur;
          const wx = [0, wobbleAmp, 0, -wobbleAmp, 0];
          const wy = [0, -wobbleAmp * 0.7, 0, wobbleAmp * 0.7, 0];

          return (
            <g key={n.id}
              transform={`translate(${n.x},${n.y})`}
              style={{ cursor: agentDragging === n.id ? 'grabbing' : 'pointer' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onMouseDown={(e) => startAgentDrag(n.id, e)}
              onClick={() => {
                // Si venimos de un drag real, no abrimos el agente.
                if (agentClickSuppressedRef.current) {
                  agentClickSuppressedRef.current = false;
                  return;
                }
                onOpenAgent(n.id);
              }}>
              {/* Wobble cuántico — micromovimiento local */}
              <animateTransform
                attributeName="transform"
                type="translate"
                additive="sum"
                values={wx.map((x, idx) => `${x},${wy[idx]}`).join('; ')}
                keyTimes="0; 0.25; 0.5; 0.75; 1"
                dur={`${wobbleDur}s`}
                begin={`-${phase}s`}
                repeatCount="indefinite"
              />

              {isHover && (
                <circle cx={0} cy={0} r={n.size + 6} fill="none"
                  stroke={t.accent} strokeWidth="1" strokeOpacity="0.5"/>
              )}
              {/* Triple anillo + halo cuando activo */}
              {isActive && (
                <>
                  <motion.circle cx={0} cy={0} r={n.size}
                    fill="none" stroke={sColor} strokeWidth={1.5}
                    animate={{ r: [n.size, n.size + 16], opacity: [0.55, 0] }}
                    transition={{ duration: 2, ease: 'easeOut', repeat: Infinity }}/>
                  <motion.circle cx={0} cy={0} r={n.size}
                    fill="none" stroke={sColor} strokeWidth={1.2}
                    animate={{ r: [n.size, n.size + 16], opacity: [0.4, 0] }}
                    transition={{ duration: 2, ease: 'easeOut', repeat: Infinity, delay: 0.66 }}/>
                  <motion.circle cx={0} cy={0} r={n.size + 4}
                    fill={sColor}
                    animate={{ opacity: [0.18, 0.32, 0.18] }}
                    transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
                    style={{ filter: `blur(8px)` }}/>
                </>
              )}
              {/* Cuerpo del electrón — si tiene categoría, el fill se tiñe
                  sutilmente con su color y el borde lo usa siempre (no solo
                  cuando está activo), así se ve "un poco" del color de la
                  categoría aunque el agente esté idle. */}
              <circle cx={0} cy={0} r={n.size}
                fill={nodeCategory
                  ? `color-mix(in oklch, ${nodeCategory.color} 16%, ${t.bg1})`
                  : t.bg1}
                stroke={isActive
                  ? sColor
                  : (isHover ? t.accent
                    : (nodeCategory
                      ? `color-mix(in oklch, ${nodeCategory.color} 55%, ${t.glassBorder})`
                      : t.glassBorder))}
                strokeWidth={isActive ? 2 : (isHover ? 1.5 : (nodeCategory ? 1.5 : 1))}
                style={isActive ? { filter: `drop-shadow(0 0 8px ${sColor})` } : undefined}/>
              <text x={0} y={1} textAnchor="middle" dominantBaseline="middle"
                fill={n.accent} fontFamily={t.fontSans} fontSize="13" fontWeight="600"
                style={{ textTransform: 'uppercase', pointerEvents: 'none' }}>
                {bubbleLetter(n.title)}
              </text>
              <text x={0} y={n.size + 16} textAnchor="middle"
                fill={isHover ? t.text0 : t.text1}
                fontFamily={t.fontSans} fontSize="11.5" fontWeight="500"
                style={{ pointerEvents: 'none' }}>
                {n.title.length > 14 ? n.title.slice(0, 14) + '…' : n.title}
              </text>
              {/* Dots de categorías — sobre el borde del círculo, arrancando
                  a -45° (top-right, donde vivía el viejo dot de estado que
                  se quitó por redundante) y siguiendo en sentido horario. */}
              {nodeCategories.map((c, ci) => {
                const ang = ((-45 + ci * 32) * Math.PI) / 180;
                // 1.02 ≈ la distancia del status dot (0.72·√2) — misma órbita.
                const d = n.size * 1.02;
                return (
                  <circle
                    key={c.id}
                    cx={d * Math.cos(ang)}
                    cy={d * Math.sin(ang)}
                    r={3.5}
                    fill={c.color}
                    stroke={t.bg1}
                    strokeWidth={1}
                    style={{ pointerEvents: 'none' }}>
                    <title>{c.name}</title>
                  </circle>
                );
              })}
              {/* Satélites del electrón — al clickearlos abre el agente
                  en la tab correspondiente (conversación, terminal, etc.). */}
              <SatellitesLocal n={n} t={t} onItemClick={(sub) => {
                onOpenAgent(n.id);
                // Pequeño delay para que AgentDetail monte antes de cambiar tab.
                window.setTimeout(() => {
                  ecoEmit('eco:switch_tab', { tab: SAT_TO_TAB[sub], bubbleId: n.id });
                }, 60);
              }}/>
            </g>
          );
        })}
        </g>
      </svg>

      {/* Botones de vista (top-left):
          · Centrar vista — devuelve el pan al centro (no toca la disposición).
          · Restablecer disposición — además limpia los offsets manuales de
            nodos de workspace y de agentes. */}
      {(pan.x !== 0 || pan.y !== 0
        || Object.keys(wsOffsets).length > 0
        || Object.keys(agentOffsets).length > 0) && (
        <div style={{
          position: 'absolute', top: 12, left: 16,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
        }}>
          {(pan.x !== 0 || pan.y !== 0) && (
            <button type="button"
              onClick={() => setPan({ x: 0, y: 0 })}
              title={tr('graph.recenter')} style={viewBtnStyle}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3"/>
              </svg>
              {tr('graph.recenter')}
            </button>
          )}
          {(Object.keys(wsOffsets).length > 0 || Object.keys(agentOffsets).length > 0) && (
            <button type="button"
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setWsOffsets({}); persistWsOffsets({});
                setAgentOffsets({}); persistAgentOffsets({});
              }}
              title={tr('graph.reset_layout')} style={viewBtnStyle}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 1 2.6 6.3 M3 18v-4h4"/>
              </svg>
              {tr('graph.reset_layout')}
            </button>
          )}
        </div>
      )}

      {/* Pantalla completa — esquina inferior derecha. */}
      <button
        type="button"
        onClick={() => setIsFull((v) => !v)}
        title={tr(isFull ? 'graph.exit_fullscreen' : 'graph.fullscreen')}
        style={{
          position: 'absolute', bottom: 12, right: 16,
          width: 30, height: 30, borderRadius: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
          color: t.text1, cursor: 'pointer', boxShadow: t.shadowMd,
        }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isFull
            ? <path d="M8 3v3a2 2 0 0 1-2 2H3 M21 8h-3a2 2 0 0 1-2-2V3 M3 16h3a2 2 0 0 1 2 2v3 M16 21v-3a2 2 0 0 1 2-2h3"/>
            : <path d="M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M3 16v3a2 2 0 0 0 2 2h3 M16 21h3a2 2 0 0 0 2-2v-3"/>}
        </svg>
      </button>

      {/* Controles de vista — separación de nodos, separación de carpetas y
          zoom visual; los tres independientes y persistidos. */}
      <div style={{
        position: 'absolute', bottom: 12, left: 16,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {/* Separación agentes ↔ carpeta (en modo plano, agentes ↔ Eco) */}
        <div style={pillStyle}>
          <span style={pillIconStyle} title={tr('graph.spread_nodes')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h20 M6 8l-4 4 4 4 M18 8l4 4-4 4"/>
            </svg>
          </span>
          <button type="button" onClick={() => setSpreadNodes((z) => z - 0.2)}
            title={tr('graph.spread_less')} style={zoomBtnStyle}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 12h14"/>
            </svg>
          </button>
          <button type="button" onClick={() => setSpreadNodes(1)}
            title={tr('graph.spread_reset')} style={pctBtnStyle}>
            {Math.round(spreadNodes * 100)}%
          </button>
          <button type="button" onClick={() => setSpreadNodes((z) => z + 0.2)}
            title={tr('graph.spread_more')} style={zoomBtnStyle}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
        {/* Separación carpetas ↔ Eco — solo en modo jerárquico (2+ carpetas) */}
        {hierarchical && (
          <div style={pillStyle}>
            <span style={pillIconStyle} title={tr('graph.spread_ws')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M0,-8 L9,-3.5 L0,1 L-9,-3.5 Z M-9,0 L0,4.5 L9,0 M-9,3.5 L0,8 L9,3.5"
                  transform="translate(12 12)"/>
              </svg>
            </span>
            <button type="button" onClick={() => setSpreadWs((z) => z - 0.2)}
              title={tr('graph.spread_less')} style={zoomBtnStyle}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h14"/>
              </svg>
            </button>
            <button type="button" onClick={() => setSpreadWs(1)}
              title={tr('graph.spread_reset')} style={pctBtnStyle}>
              {Math.round(spreadWs * 100)}%
            </button>
            <button type="button" onClick={() => setSpreadWs((z) => z + 0.2)}
              title={tr('graph.spread_more')} style={zoomBtnStyle}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        )}
        {/* Zoom visual de toda la vista */}
        <div style={pillStyle}>
          <span style={pillIconStyle} title={tr('graph.view_zoom')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7"/>
              <path d="M21 21l-4.3-4.3"/>
            </svg>
          </span>
          <button type="button" onClick={() => setViewScale((z) => z - 0.2)}
            title={tr('graph.zoom_out')} style={zoomBtnStyle}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 12h14"/>
            </svg>
          </button>
          <button type="button" onClick={() => setViewScale(1)}
            title={tr('graph.zoom_reset')} style={pctBtnStyle}>
            {Math.round(viewScale * 100)}%
          </button>
          <button type="button" onClick={() => setViewScale((z) => z + 0.2)}
            title={tr('graph.zoom_in')} style={zoomBtnStyle}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
      </div>

      <div style={{
        position: 'absolute', top: 12, right: 16, fontSize: 11,
        color: t.text2, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 4, height: 4, borderRadius: '50%', background: t.accent,
          boxShadow: `0 0 6px ${t.accent}`,
        }}/>
        {tr('graph.legend.nodes', { n: bubbles.length })}
        {hierarchical && (
          <span style={{ color: t.text3 }}>
            {' · '}{tr('dash.in_projects_many', { n: wsGroups.length })}
          </span>
        )}
      </div>
    </Glass>
  );

  // En pantalla completa portaleamos a <body> para escapar de los stacking
  // contexts de los ancestros (el Dashboard vive anidado) — así la vista
  // cubre todo, incluido el dock.
  return isFull ? createPortal(graph, document.body) : graph;
}

function DashboardRail({
  bubbles, activeBubbleId, availableWorkspaces, onOpenAgent,
}: {
  bubbles: Bubble[];
  activeBubbleId: string | null;
  availableWorkspaces: string[];
  onFocus: (id: string) => void;
  onOpenAgent: (id: string) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const recent = [...bubbles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  // Cambios git por burbuja (archivos modificados sin commitear). Lo sumamos
  // por carpeta para mostrar cuántos cambios pendientes hay en cada workspace.
  const changeCounts = useBubbleChangeCountMap(bubbles);
  // Combinar carpetas que tienen burbujas con todas las disponibles
  const usedFolders = new Set(bubbles.map((b) => b.workspace).filter(Boolean));
  const folders = Array.from(new Set([
    ...Array.from(usedFolders),
    ...availableWorkspaces.filter((w) => !usedFolders.has(w)),
  ]));

  return (
    <div style={{
      width: 280, flexShrink: 0,
      borderRight: `1px solid ${t.glassBorder}`,
      padding: '20px 16px',
      display: 'flex', flexDirection: 'column', gap: 18,
      overflow: 'auto',
    }}>
      <div>
        <SectionLabel>{tr('dash.rail.recent')}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recent.length === 0 ? (
            <div style={{ fontSize: 12, color: t.text3, padding: 8 }}>{tr('dash.rail.no_activity')}</div>
          ) : recent.map((b) => (
            <RecentRow key={b.id} bubble={b} active={b.id === activeBubbleId} onClick={() => onOpenAgent(b.id)}/>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel count={folders.length}>{tr('dash.rail.active_folders')}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {folders.length === 0 ? (
            <div style={{ fontSize: 12, color: t.text3, padding: 8 }}>{tr('dash.rail.no_folders')}</div>
          ) : folders.map((f) => {
            const inFolder = bubbles.filter((b) => b.workspace === f);
            const changes = inFolder.reduce((sum, b) => sum + (changeCounts.get(b.id) ?? 0), 0);
            return (
              <FolderRow
                key={f}
                path={f}
                count={inFolder.length}
                changes={changes}
                onClick={() => {
                  const target = inFolder.sort((a, b) => b.updatedAt - a.updatedAt)[0];
                  if (target) onOpenAgent(target.id);
                }}
              />
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1 }}/>
    </div>
  );
}

function RecentRow({ bubble, active, onClick }: { bubble: Bubble; active: boolean; onClick: () => void }) {
  const t = useTokens();
  const [h, setH] = useState(false);
  const lastMsg = bubble.messages[bubble.messages.length - 1];
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
        background: active ? t.bg3 : (h ? t.bg2 : 'transparent'),
      }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
        background: t.bg3, color: t.text2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconTerminal size={12}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: t.fontSans, fontSize: 12, color: t.text1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{bubble.title}</div>
        {lastMsg && (
          <div style={{
            fontFamily: t.fontSans, fontSize: 10.5, color: t.text3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{lastMsg.text.slice(0, 60)}</div>
        )}
      </div>
    </div>
  );
}

function FolderRow({ path, count, changes, onClick }: { path: string; count: number; changes: number; onClick: () => void }) {
  const t = useTokens();
  const tr = useT();
  const [h, setH] = useState(false);
  const empty = count === 0;
  return (
    <div
      onClick={empty ? undefined : onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      title={empty ? tr('rail.folders.tooltip_empty', { p: path }) : tr('rail.folders.tooltip_open', { p: path })}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 10,
        cursor: empty ? 'default' : 'pointer',
        background: !empty && h ? t.bg3 : 'transparent',
        opacity: empty ? 0.55 : 1,
      }}>
      <div style={{ color: count > 0 ? t.accent : t.text2 }}>
        <IconFolder size={14}/>
      </div>
      <span style={{
        flex: 1, fontFamily: t.fontMono, fontSize: 11.5, color: t.text1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{path}</span>
      {changes > 0 && (
        <span
          title={tr('dash.rail.folder_changes', { n: changes })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '1px 6px', background: `color-mix(in oklch, ${t.warn} 16%, transparent)`,
            color: t.warn, borderRadius: 999, fontSize: 10, fontWeight: 600,
          }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.warn }}/>
          {changes}
        </span>
      )}
      {count > 0 && (
        <span
          title={tr('dash.rail.folder_bubbles', { n: count })}
          style={{
            padding: '1px 6px', background: t.accentFaint, color: t.accent,
            borderRadius: 999, fontSize: 10, fontWeight: 500,
          }}>{count}</span>
      )}
    </div>
  );
}
