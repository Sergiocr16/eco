import { useEffect, useRef, useState, type FormEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import {
  Glass, glassEffect, IconBtn, StatusDot, Pill, Kbd, AgentGlyph, SectionLabel, bubbleLetter,
} from '@/design/primitives';
import {
  IconWave, IconMic, IconSend, IconPlus, IconGrid, IconGraph, IconExt, IconColumns,
  IconPause, IconPlay, IconResume, IconMore, IconFolder, IconTerminal,
  IconClock, IconAlert, IconZap, IconCpu, IconEdit, IconTrash,
  IconGlobe, IconLayers, IconShield, type IconProps,
} from '@/design/icons';
import type { Bubble, VoiceState } from '@/lib/types';
import { stateColor, type AgentState } from '@/design/tokens';
import { useT } from '@/hooks/useI18n';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { useProfile } from '@/hooks/useProfile';

type Props = {
  bubbles: Bubble[];
  activeBubbleId: string | null;
  voiceState: VoiceState;
  listening: boolean;
  wakeActive: boolean;
  interimText: string;
  onSend: (text: string) => void;
  onMicToggle: () => void;
  onOpenAgent: (id: string) => void;
  onCreateAgent: (title?: string) => void;
  onFocus: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onChangeWorkspace: (id: string, workspace: string) => void;
  availableWorkspaces: string[];
  voiceError?: string | null;
};

export function Dashboard(props: Props) {
  const t = useTokens();
  const tr = useT();
  const { bubbles, activeBubbleId, voiceState, onMicToggle, onOpenAgent, onCreateAgent, onFocus, onRename, onRemove, onChangeWorkspace, availableWorkspaces, wakeActive } = props;
  const { username } = useProfile();
  // onSend / interimText / voiceError siguen llegando por contrato pero ya
  // no se usan en el Dashboard tras remover la CommandBar — el input vive
  // dentro de cada conversación.
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

  const active = bubbles.filter((b) => ['running', 'thinking', 'executing', 'waiting'].includes(b.status as string));
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
        wakeActive={wakeActive}
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
          <VoiceOrb state={voiceState} onClick={onMicToggle}/>

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
            <CreateAgentButton onCreate={onCreateAgent}/>
          </div>
        }>{tr('dash.section.agents')}</SectionLabel>

        {view === 'grid' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}>
            <AnimatePresence initial={false} mode="popLayout">
              {bubbles.map((b, i) => (
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
                    workspaces={availableWorkspaces}
                    onClick={() => onOpenAgent(b.id)}
                    onRename={(title) => onRename(b.id, title)}
                    onRemove={() => onRemove(b.id)}
                    onChangeWorkspace={(ws) => onChangeWorkspace(b.id, ws)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.1 }}
              whileHover={{ y: -2 }}
            >
              <NewAgentCard onCreate={onCreateAgent}/>
            </motion.div>
          </div>
        ) : view === 'kanban' ? (
          <KanbanView
            bubbles={bubbles}
            onOpenAgent={onOpenAgent}
            onCreateAgent={onCreateAgent}
          />
        ) : (
          <GraphView bubbles={bubbles} onOpenAgent={onOpenAgent}/>
        )}
      </div>

      {/* CommandBar global removida del Dashboard — el input/mic vive ahora
          dentro de cada conversación (AgentDetail). Para crear un agente
          nuevo, usar el botón "+" del grid o el comando de voz «Eco crea ...». */}
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
  const running = bubbles.filter((b) => b.status === 'running' || b.status === 'thinking' || b.status === 'executing').length;
  const waiting = bubbles.filter((b) => b.status === 'waiting').length;
  const errors = bubbles.filter((b) => b.status === 'error').length;
  const idle = bubbles.length - running - waiting - errors;
  const active = running + waiting;
  const total = bubbles.length;
  const pct = (n: number) => total === 0 ? 0 : (n / total) * 100;

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
      <div style={{
        display: 'flex', gap: 10, marginTop: 7,
        fontSize: 10.5, color: t.text2, fontFamily: t.fontMono,
      }}>
        <span><span style={{ color: t.ok }}>●</span> {running}</span>
        <span><span style={{ color: t.warn }}>●</span> {waiting}</span>
        {errors > 0 && <span><span style={{ color: t.err }}>●</span> {errors}</span>}
      </div>
    </CardShell>
  );
}

function ResourcesCard({ bubbles }: { bubbles: Bubble[] }) {
  const t = useTokens();
  const tr = useT();
  // PTYs abiertos: bubble.ptyOpen === true
  const ptys = bubbles.filter((b) => b.ptyOpen).length;
  // Worktrees: workspaces únicos en uso (cada bubble con workspace tiene worktree).
  const worktrees = new Set(bubbles.map((b) => b.workspace).filter(Boolean)).size;
  // Servers + browsers: leemos del localStorage (servers via dev_status NO se
  // persiste — usamos un fallback simple por ahora). Para el conteo exacto
  // habría que escuchar eco:dev_status; lo dejamos como mejora futura.
  let browsers = 0;
  try {
    for (const b of bubbles) {
      if (window.localStorage.getItem(`eco.browser.url.${b.id}`)) browsers += 1;
    }
  } catch { /* noop */ }

  const items = [
    { icon: IconTerminal, count: ptys,      color: t.warn,   label: tr('dash.card.res.ptys') },
    { icon: IconCpu,      count: 0,         color: t.busy,   label: tr('dash.card.res.servers') }, // TODO live
    { icon: IconGlobe,    count: browsers,  color: t.accent, label: tr('dash.card.res.browsers') },
    { icon: IconFolder,   count: worktrees, color: t.ok,     label: tr('dash.card.res.worktrees') },
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
  const [listenerUp, setListenerUp] = useState<boolean>(false);
  useEffect(() => {
    let cancel = false;
    apiFetch('/config/api-key').then(async (r) => {
      if (cancel) return;
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        setApiKey(data?.configured ? 'ok' : 'missing');
      }
    }).catch(() => { /* noop */ });
    // El listener Python expone /voice/ping a través del backend. Si no
    // está corriendo, /voice/status retorna { running: false }.
    apiFetch('/info').then(async (r) => {
      if (cancel || !r.ok) return;
      const data = await r.json().catch(() => ({}));
      setListenerUp(!!data?.listener?.running);
    }).catch(() => { /* noop */ });
    return () => { cancel = true; };
  }, []);

  const rows = [
    { label: tr('dash.card.sys.backend'),  color: t.ok },
    { label: tr('dash.card.sys.apikey'),   color: apiKey === 'ok' ? t.ok : (apiKey === 'invalid' ? t.err : t.warn) },
    { label: tr('dash.card.sys.listener'), color: listenerUp ? t.ok : t.text3 },
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


function VoiceOrb({ state, onClick }: { state: VoiceState; onClick: () => void }) {
  const t = useTokens();
  const tr = useT();
  const labels: Record<VoiceState, { label: string; sub: string }> = {
    idle: { label: tr('voice.idle.label'), sub: tr('voice.idle.sub') },
    listening: { label: tr('voice.listening.label'), sub: '' },
    thinking: { label: tr('voice.thinking.label'), sub: '' },
    executing: { label: tr('voice.executing.label'), sub: '' },
    speaking: { label: tr('voice.speaking.label'), sub: '' },
  };
  const meta = labels[state] ?? labels.idle;
  const active = state !== 'idle';
  const bars = [0.35, 0.7, 1, 0.7, 0.35];

  return (
    <div onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
      cursor: 'pointer', userSelect: 'none',
    }}>
      <div style={{
        height: 64, display: 'flex', alignItems: 'center', gap: 6,
        opacity: active ? 1 : 0.55,
        transition: 'opacity 300ms ease',
      }}>
        {bars.map((h, i) => (
          <span key={i} style={{
            width: 3, borderRadius: 2,
            background: active ? t.accent : t.text2,
            height: active ? `${h * 100}%` : '20%',
            animation: state === 'listening'
              ? `eco-wave-bar ${0.9 + (i % 3) * 0.15}s ease-in-out infinite`
              : 'none',
            animationDelay: `${i * 0.08}s`,
            transition: 'height 300ms ease, background 200ms ease',
          }}/>
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: t.fontSans, fontSize: 15, fontWeight: 500,
          color: t.text0, letterSpacing: -0.2,
        }}>{meta.label}</div>
        {meta.sub && (
          <div style={{ marginTop: 4, color: t.text2, fontSize: 12.5 }}>{meta.sub}</div>
        )}
      </div>
    </div>
  );
}

function AgentBubble({
  bubble, workspaces, onClick, onRename, onRemove, onChangeWorkspace,
}: {
  bubble: Bubble;
  workspaces: string[];
  onClick: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  onChangeWorkspace: (ws: string) => void;
}) {
  const t = useTokens();
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bubble.title);
  const tr = useT();
  const state = (bubble.status as AgentState) || 'idle';
  const sColor = stateColor(state, t);
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
        <div style={{ position: 'relative' }}>
          <IconBtn
            icon={IconMore}
            size={26}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          />
          {menuOpen && (
            <BubbleMenu
              onClose={() => setMenuOpen(false)}
              onRename={startRename}
              onRemove={(e) => { e.stopPropagation(); onRemove(); setMenuOpen(false); }}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <StatusDot color={sColor} pulse={state === 'running' || state === 'thinking' || state === 'executing'} size={7}/>
        <span style={{ fontSize: 11.5, color: sColor, fontWeight: 500 }}>{STATE_LABELS_I18N[state] || tr('state.idle')}</span>
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

// Hook + modal compartido para naming de agente nuevo. Lo usan el botón
// del header del Dashboard y la columna idle del Kanban.
function useNameAgentDialog(onCreate: (title?: string) => void) {
  const [open, setOpen] = useState(false);
  const dialog = <NameAgentDialog open={open} onClose={() => setOpen(false)} onCreate={onCreate}/>;
  return { open: () => setOpen(true), dialog };
}

function NameAgentDialog({
  open, onClose, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (title?: string) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft('');
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    const v = draft.trim();
    onClose();
    onCreate(v || undefined);
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
            <IconPlus size={17} strokeWidth={2.4}/>
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
      </div>
    </div>
  );
}

// Botón "Nuevo agente" (header del Dashboard) — pill prominent.
function CreateAgentButton({ onCreate }: { onCreate: (title?: string) => void }) {
  const t = useTokens();
  const tr = useT();
  const { open, dialog } = useNameAgentDialog(onCreate);
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
        <IconPlus size={13} strokeWidth={2.5}/>
        {tr('dash.bubble.new')}
      </button>
      {dialog}
    </>
  );
}

function NewAgentCard({ onCreate }: { onCreate: (title?: string) => void }) {
  const t = useTokens();
  const tr = useT();
  const [h, setH] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  function submit() {
    const v = draft.trim();
    onCreate(v || undefined);
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
          <IconPlus size={22}/>
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
        <IconPlus size={22}/>
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
  onClose, onRename, onRemove,
}: {
  onClose: () => void;
  onRename: (e: React.MouseEvent) => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const t = useTokens();
  const tr = useT();
  useEffect(() => {
    const onDocClick = () => onClose();
    document.addEventListener('click', onDocClick, { once: true });
    return () => document.removeEventListener('click', onDocClick);
  }, [onClose]);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 30, right: 0, zIndex: 30,
        minWidth: 160, padding: 4,
        background: t.bg1, border: `1px solid ${t.glassBorder}`,
        borderRadius: 12, boxShadow: t.shadowLg,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <button type="button" onClick={onRename} style={menuItemStyle(t)}>
        <IconEdit size={12}/> {tr('menu.rename')}
      </button>
      <button type="button" onClick={onRemove} style={{ ...menuItemStyle(t), color: t.err }}>
        <IconTrash size={12}/> {tr('menu.close_bubble')}
      </button>
    </div>
  );
}

function menuItemStyle(t: ReturnType<typeof useTokens>): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderRadius: 8, border: 0, background: 'transparent',
    color: t.text1, fontFamily: t.fontSans, fontSize: 12.5, cursor: 'pointer',
    textAlign: 'left',
  };
}

// ──────────────────── Vista Kanban ─────────────────────────────────────────
// Columnas por estado. Cada agente es una card chiquita arrastrable visualmente
// (drag real es feature aparte — por ahora click para abrir).
function KanbanView({
  bubbles, onOpenAgent, onCreateAgent,
}: {
  bubbles: Bubble[];
  onOpenAgent: (id: string) => void;
  onCreateAgent: (title?: string) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const { open: openNameDialog, dialog: nameDialog } = useNameAgentDialog(onCreateAgent);

  type ColumnDef = {
    id: string;
    label: string;
    color: string;
    match: (b: Bubble) => boolean;
  };

  const columns: ColumnDef[] = [
    {
      id: 'active',
      label: 'Activos',
      color: t.accent,
      match: (b) =>
        b.status === 'thinking' || b.status === 'executing' || b.status === 'running',
    },
    {
      id: 'waiting',
      label: 'En espera',
      color: t.warn,
      match: (b) => b.status === 'waiting' || b.status === 'paused' || b.status === 'pending',
    },
    {
      id: 'idle',
      label: 'Inactivos',
      color: t.text2,
      match: (b) =>
        (b.status === 'idle' || !b.status) &&
        !(b.ptyOpen) /* idle puros, sin shell abierto */,
    },
    {
      id: 'shell',
      label: 'Con shell abierto',
      color: t.busy,
      match: (b) => (b.status === 'idle' || !b.status) && !!b.ptyOpen,
    },
    {
      id: 'done',
      label: 'Terminados',
      color: t.ok,
      match: (b) => b.status === 'done',
    },
    {
      id: 'error',
      label: 'Con error',
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
                }}>Vacío.</div>
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
                <IconPlus size={12}/> {tr('dash.new_bubble')}
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
  server: (
    <>
      <rect x="2" y="3" width="20" height="18" rx="2"/>
      <path d="M8 21V11M16 21V11M2 11h20"/>
    </>
  ),
  browser: (
    <>
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z"/>
    </>
  ),
  // Claude remote control — antena con ondas, da idea de "control remoto activo"
  remote: (
    <>
      <path d="M12 13v8"/>
      <circle cx="12" cy="11" r="2"/>
      <path d="M7 7a7 7 0 0110 0M4.5 4.5a11 11 0 0115 0"/>
    </>
  ),
} as const;

// Mapeo de cada satélite a la tab que se abre en AgentDetail.
type SatKey = 'chat' | 'pty' | 'server' | 'browser' | 'remote';
const SAT_TO_TAB: Record<SatKey, 'chat' | 'terminal' | 'server' | 'browser'> = {
  chat: 'chat',
  pty: 'terminal',
  server: 'server',
  browser: 'browser',
  remote: 'terminal', // click en el satélite remote te lleva a la terminal
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
    hasChat: boolean; hasPty: boolean; hasServer: boolean; hasBrowser: boolean; hasRemote: boolean;
  };
  t: ReturnType<typeof useTokens>;
  onItemClick?: (subsystem: SatKey) => void;
}) {
  const [hoverKey, setHoverKey] = useState<SatKey | null>(null);
  const items: { key: SatKey; on: boolean; color: string; label: string; icon: JSX.Element; pulse?: boolean }[] = [
    { key: 'chat',    on: n.hasChat,    color: t.text2,  label: 'Conversación',          icon: SAT_ICONS.chat },
    { key: 'pty',     on: n.hasPty,     color: t.warn,   label: 'Terminal',              icon: SAT_ICONS.pty },
    { key: 'server',  on: n.hasServer,  color: t.busy,   label: 'Server',                icon: SAT_ICONS.server },
    { key: 'browser', on: n.hasBrowser, color: t.accent, label: 'Navegador',             icon: SAT_ICONS.browser },
    { key: 'remote',  on: n.hasRemote,  color: t.accent, label: 'Claude remote control', icon: SAT_ICONS.remote, pulse: true },
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
            {/* Hit area invisible más grande para que sea fácil hover/click */}
            <circle cx={sx} cy={sy} r={chipR + 6} fill="transparent"/>
            {/* Halo cuando hovereado */}
            {isHovered && (
              <circle cx={sx} cy={sy} r={chipR + 4}
                fill="none" stroke={it.color} strokeWidth={1.5}
                style={{ filter: `drop-shadow(0 0 6px ${it.color})` }}
                pointerEvents="none"/>
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
  const sColor = stateColor(state, t);
  const isActive = state === 'thinking' || state === 'executing' || state === 'running';
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
        {(isActive || bubble.ptyOpen) && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: sColor,
            boxShadow: `0 0 6px ${sColor}`,
            animation: isActive ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
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

function GraphView({ bubbles, onOpenAgent }: { bubbles: Bubble[]; onOpenAgent: (id: string) => void }) {
  const t = useTokens();
  const tr = useT();
  const [hover, setHover] = useState<string | null>(null);
  // Estados live de servers por bubbleId — escuchamos el eco-bus.
  const [serverRunning, setServerRunning] = useState<Record<string, boolean>>({});
  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      setServerRunning((prev) => ({ ...prev, [d.bubbleId]: d.status === 'running' || d.status === 'starting' }));
    });
  }, []);
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
  const tilt = 0.45;
  // Anillos orbitales: cada agente vive en SU PROPIO anillo. Cuando hay
  // pocos agentes, expandimos los anillos para que ocupen mejor el canvas
  // y no se vean apretados contra el hub Eco. A más agentes, más juntos.
  const n = Math.max(1, bubbles.length);
  const orbitBaseR =
    n <= 2 ? 160 :
    n <= 4 ? 120 :
    n <= 6 ? 100 :
    80;
  const orbitSpacing =
    n <= 2 ? 60 :
    n <= 4 ? 44 :
    n <= 6 ? 36 :
    32;
  const nodes = bubbles.map((b, i) => {
    const orbitIdx = i;
    const orbitR = orbitBaseR + orbitIdx * orbitSpacing;
    // Período: planetas más alejados giran más lento (T ∝ R^1.5 aprox Kepler).
    // Base 12s para el más cercano, hasta ~28s para los lejanos.
    const period = 12 + orbitIdx * 2.5;
    // Fase inicial — distribuye los planetas para que no arranquen alineados.
    const phaseDeg = (i * 67) % 360;
    const state = (b.status as AgentState) || 'idle';
    const hasChat = b.messages.length > 0;
    const hasPty = !!b.ptyOpen;
    const hasServer = !!serverRunning[b.id];
    let hasBrowser = false;
    try { hasBrowser = !!window.localStorage.getItem(`eco.browser.url.${b.id}`); } catch { /* noop */ }
    const hasRemote = !!remoteByBubble[b.id];
    return {
      ...b, state,
      orbitR, period, phaseDeg,
      // Posición estática para las líneas iniciales (las línea/connection ya
      // no aplica con órbitas — usamos un anillo en su lugar).
      x: cx + Math.cos((phaseDeg * Math.PI) / 180) * orbitR,
      y: cy + Math.sin((phaseDeg * Math.PI) / 180) * orbitR * tilt,
      size: 22 + (state === 'running' ? 8 : 0),
      hasChat, hasPty, hasServer, hasBrowser, hasRemote,
    };
  });

  return (
    <Glass radius={20} style={{
      position: 'relative',
      // Altura responsive — 92vh para que el modelo aproveche casi toda la
      // ventana, con tope a 1600px para pantallas muy altas. Mínimo 520px.
      height: 'min(92vh, 1600px)', minHeight: 520,
      padding: 0, overflow: 'hidden',
    }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}/>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
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
        <rect width={W} height={H} fill="url(#eco-grid)"/>
        <motion.circle
          cx={cx} cy={cy} r={Math.min(W, H) * 0.5} fill="url(#eco-glow)"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* (Anillos orbitales removidos — el sistema se ve más limpio sin
            las elipses de fondo, dejando solo enlaces vivos núcleo→electrón.) */}

        {/* Hub central — respira sutil (escala el círculo de fondo) y
            emite 2 anillos expansivos cuando hay actividad en cualquier nodo. */}
        <motion.g
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3.6, ease: 'easeInOut', repeat: Infinity }}>
          <circle cx={cx} cy={cy} r="34" fill={t.bg1}
            stroke={t.accent} strokeWidth="1" strokeOpacity="0.6"/>
        </motion.g>
        {/* Anillo expansivo 1 */}
        <motion.circle
          cx={cx} cy={cy} r="28" fill="none"
          stroke={t.accent} strokeWidth="0.5"
          animate={{ r: [28, 44, 28], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        />
        {/* Anillo expansivo 2, desfasado */}
        <motion.circle
          cx={cx} cy={cy} r="28" fill="none"
          stroke={t.accent} strokeWidth="0.5"
          animate={{ r: [28, 44, 28], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, delay: 1.2 }}
        />
        <motion.text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill={t.text0} fontFamily={t.fontSans} fontSize="15" fontWeight="500"
          letterSpacing="-0.3"
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3.6, ease: 'easeInOut', repeat: Infinity }}>
          Eco
        </motion.text>

        {/* Líneas tenues del núcleo Eco a cada electrón — "enlaces" químicos.
            Van de BORDE a BORDE (no de centro a centro) así no se incrustan
            dentro de los círculos. */}
        {nodes.map((n) => {
          const isActive = n.state === 'running' || n.state === 'thinking' || n.state === 'executing';
          const sColor = stateColor(n.state, t);
          const stroke = hover === n.id ? t.accent : (isActive ? sColor : t.text2);
          const opacity = hover === n.id ? 0.85 : (isActive ? 0.6 : 0.22);
          // Vector unitario del centro de Eco al centro del electrón.
          const dx = n.x - cx;
          const dy = n.y - cy;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const ux = dx / dist;
          const uy = dy / dist;
          // Radio del hub Eco (debe coincidir con el <circle r="34"> del hub).
          const ECO_R = 34;
          // Margen extra para que la línea no toque exactamente el borde.
          const gap = 2;
          const x1 = cx + ux * (ECO_R + gap);
          const y1 = cy + uy * (ECO_R + gap);
          const x2 = n.x - ux * (n.size + gap);
          const y2 = n.y - uy * (n.size + gap);
          return (
            <line key={'bond-' + n.id}
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
          );
        })}

        {/* Electrones — fijos en sus orbitales (como modelo de Bohr). Sin
            rotación. Wobble local muy leve para que se sientan "vivos"
            sin moverse del orbital. */}
        {nodes.map((n, i) => {
          const isActive = n.state === 'running' || n.state === 'thinking' || n.state === 'executing';
          const isHover = hover === n.id;
          const sColor = stateColor(n.state, t);
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
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onOpenAgent(n.id)}>
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
              {/* Cuerpo del electrón */}
              <circle cx={0} cy={0} r={n.size}
                fill={t.bg1}
                stroke={isActive ? sColor : (isHover ? t.accent : t.glassBorder)}
                strokeWidth={isActive ? 2 : (isHover ? 1.5 : 1)}
                style={isActive ? { filter: `drop-shadow(0 0 8px ${sColor})` } : undefined}/>
              <text x={0} y={1} textAnchor="middle" dominantBaseline="middle"
                fill={n.accent} fontFamily={t.fontSans} fontSize="13" fontWeight="600"
                style={{ textTransform: 'uppercase', pointerEvents: 'none' }}>
                {bubbleLetter(n.title)}
              </text>
              <circle cx={n.size * 0.72} cy={-n.size * 0.72} r="4" fill={sColor}
                style={{ filter: isActive ? `drop-shadow(0 0 4px ${sColor})` : 'none' }}/>
              <text x={0} y={n.size + 16} textAnchor="middle"
                fill={isHover ? t.text0 : t.text1}
                fontFamily={t.fontSans} fontSize="11.5" fontWeight="500"
                style={{ pointerEvents: 'none' }}>
                {n.title.length > 14 ? n.title.slice(0, 14) + '…' : n.title}
              </text>
              {/* Satélites del electrón — al clickearlos abre el agente
                  en la tab correspondiente (conversación, terminal, etc.). */}
              <SatellitesLocal n={n} t={t} onItemClick={(sub) => {
                onOpenAgent(n.id);
                // Pequeño delay para que AgentDetail monte antes de cambiar tab.
                window.setTimeout(() => {
                  ecoEmit('eco:switch_tab', { tab: SAT_TO_TAB[sub] });
                }, 60);
              }}/>
            </g>
          );
        })}
      </svg>

      <div style={{
        position: 'absolute', top: 12, right: 16, fontSize: 11,
        color: t.text2, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 4, height: 4, borderRadius: '50%', background: t.accent,
          boxShadow: `0 0 6px ${t.accent}`,
        }}/>
        {tr('graph.legend.nodes', { n: bubbles.length })}
      </div>
    </Glass>
  );
}

// CommandBar — actualmente no se monta en el Dashboard (la input/mic vive
// dentro de cada conversación). La dejamos definida por si se reusa.
// @ts-expect-error componente preservado intencionalmente sin uso
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CommandBar({
  voiceState, onVoiceToggle, onSubmit, interimText, voiceError,
}: {
  voiceState: VoiceState;
  onVoiceToggle: () => void;
  onSubmit: (text: string) => void;
  interimText: string;
  voiceError?: string | null;
}) {
  const t = useTokens();
  const tr = useT();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!value.trim()) return;
    onSubmit(value);
    setValue('');
  };

  const display = interimText || value;
  const placeholder = voiceError
    ? voiceError
    : voiceState === 'listening'
      ? tr('dash.cmd_placeholder_listening')
      : tr('dash.cmd.placeholder_active');

  const listenStyle: CSSProperties = voiceState === 'listening'
    ? { background: t.accent, color: t.accentOn, border: `1px solid ${t.accent}`, boxShadow: `0 0 24px ${t.accentGlow}` }
    : { background: t.bg3, color: t.text0, border: `1px solid ${t.glassBorder}` };

  return (
    <div style={{
      position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      width: 'min(720px, calc(100% - 320px))', zIndex: 20,
    }}>
      <Glass radius={999} style={{
        padding: 6, display: 'flex', alignItems: 'center', gap: 6,
        boxShadow: focused ? `${t.shadowLg}, 0 0 0 1px ${t.accentDim}` : t.shadowLg,
        transition: 'box-shadow 200ms',
      }}>
        <button
          type="button"
          onClick={onVoiceToggle}
          style={{
            width: 40, height: 40, borderRadius: 20,
            cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 200ms',
            ...listenStyle,
          }}>
          {voiceState === 'listening' ? <IconWave size={18}/> : <IconMic size={18}/>}
        </button>

        <form onSubmit={submit} style={{ flex: 1, display: 'flex' }}>
          <input
            value={display}
            onChange={(e) => setValue(e.target.value)}
            readOnly={!!interimText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            style={{
              flex: 1, height: 40, background: 'transparent', border: 0, outline: 'none',
              fontFamily: t.fontSans, fontSize: 14, color: t.text0,
              padding: '0 4px',
            }}/>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 4 }}>
          <Kbd>⌘</Kbd><Kbd>K</Kbd>
        </div>

        <button
          type="button"
          onClick={() => submit()}
          disabled={!value.trim()}
          style={{
            width: 40, height: 40, borderRadius: 20,
            background: value.trim() ? t.accent : t.bg3,
            color: value.trim() ? t.accentOn : t.text3,
            border: `1px solid ${value.trim() ? t.accent : t.glassBorder}`,
            cursor: value.trim() ? 'pointer' : 'not-allowed', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 160ms',
          }}>
          <IconSend size={16}/>
        </button>
      </Glass>
    </div>
  );
}

function DashboardRail({
  bubbles, activeBubbleId, availableWorkspaces, onOpenAgent, wakeActive,
}: {
  bubbles: Bubble[];
  activeBubbleId: string | null;
  availableWorkspaces: string[];
  onFocus: (id: string) => void;
  onOpenAgent: (id: string) => void;
  wakeActive: boolean;
}) {
  const t = useTokens();
  const tr = useT();
  const recent = [...bubbles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
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
            return (
              <FolderRow
                key={f}
                path={f}
                count={inFolder.length}
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

      <ListeningWave active={wakeActive} label={tr('wake.listening')}/>
    </div>
  );
}

function ListeningWave({ active, label }: { active: boolean; label: string }) {
  const t = useTokens();
  const BARS = 7;
  return (
    <div
      aria-hidden={!active}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        borderRadius: 12,
        background: active
          ? `color-mix(in oklch, ${t.accent} 12%, transparent)`
          : 'transparent',
        border: `1px solid ${active ? `color-mix(in oklch, ${t.accent} 35%, transparent)` : 'transparent'}`,
        opacity: active ? 1 : 0,
        maxHeight: active ? 60 : 0,
        marginBottom: active ? 4 : 0,
        overflow: 'hidden',
        transition: 'opacity 200ms ease, max-height 240ms cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 240ms',
      }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        height: 22, flexShrink: 0,
      }}>
        {Array.from({ length: BARS }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 3, height: '100%', borderRadius: 2,
              background: t.accent,
              transformOrigin: 'center',
              animation: active
                ? `eco-wave-bar 1s ease-in-out ${i * 0.08}s infinite`
                : 'none',
              opacity: active ? 1 : 0.4,
              boxShadow: active ? `0 0 6px color-mix(in oklch, ${t.accent} 60%, transparent)` : 'none',
            }}
          />
        ))}
      </div>
      <span style={{
        fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500,
        color: t.text0, letterSpacing: -0.1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>
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

function FolderRow({ path, count, onClick }: { path: string; count: number; onClick: () => void }) {
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
      {count > 0 && (
        <span style={{
          padding: '1px 6px', background: t.accentFaint, color: t.accent,
          borderRadius: 999, fontSize: 10, fontWeight: 500,
        }}>{count}</span>
      )}
    </div>
  );
}
