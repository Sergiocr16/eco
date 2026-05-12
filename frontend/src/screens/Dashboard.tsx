import { useEffect, useRef, useState, type FormEvent, type CSSProperties, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import {
  Glass, glassEffect, IconBtn, StatusDot, Pill, Kbd, AgentGlyph, SectionLabel, bubbleLetter,
} from '@/design/primitives';
import {
  IconWave, IconMic, IconSend, IconPlus, IconGrid, IconGraph, IconExt, IconColumns,
  IconPause, IconPlay, IconResume, IconMore, IconFolder, IconTerminal,
  IconClock, IconAlert, IconZap, IconCpu, IconFile, IconEdit, IconTrash,
} from '@/design/icons';
import type { Bubble, VoiceState } from '@/lib/types';
import { stateColor, type AgentState } from '@/design/tokens';
import { useT } from '@/hooks/useI18n';
import { on as ecoOn } from '@/lib/eco-bus';

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
  const { bubbles, activeBubbleId, voiceState, onSend, onMicToggle, onOpenAgent, onCreateAgent, onFocus, onRename, onRemove, onChangeWorkspace, availableWorkspaces, interimText, voiceError, wakeActive } = props;
  const [view, setView] = useState<'grid' | 'graph' | 'kanban'>('grid');

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
        padding: '28px 32px 110px', overflow: 'auto', position: 'relative',
      }}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          style={{ display: 'flex', alignItems: 'center', gap: 32, padding: '12px 8px 32px' }}>
          <VoiceOrb state={voiceState} onClick={onMicToggle}/>

          <div style={{ flex: 1, maxWidth: 380 }}>
            <div style={{
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
              color: t.accent, letterSpacing: 1.5, textTransform: 'uppercase',
            }}>{greetingFor(new Date(), tr)}</div>
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

          <div style={{ display: 'flex', gap: 12 }}>
            <Stat icon={IconCpu} label={tr('dash.stat.messages')} value={String(bubbles.reduce((a, b) => a + b.messages.length, 0))}/>
            <Stat icon={IconZap} label={tr('dash.stat.sessions')} value={String(bubbles.length)}/>
            <Stat icon={IconFile} label={tr('dash.stat.workspaces')} value={String(new Set(bubbles.map((b) => b.workspace).filter(Boolean)).size || 0)}/>
          </div>
        </motion.div>

        <SectionLabel count={bubbles.length} action={
          <div style={{ display: 'flex', gap: 4 }}>
            <IconBtn icon={IconGrid} size={28} active={view === 'grid'} onClick={() => setView('grid')}/>
            <IconBtn icon={IconColumns} size={28} active={view === 'kanban'} onClick={() => setView('kanban')}/>
            <IconBtn icon={IconGraph} size={28} active={view === 'graph'} onClick={() => setView('graph')}/>
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

      <CommandBar
        voiceState={voiceState}
        onVoiceToggle={onMicToggle}
        onSubmit={onSend}
        interimText={interimText}
        voiceError={voiceError}
      />
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

function Stat({ icon: Icon, label, value }: { icon: (p: { size?: number }) => JSX.Element; label: string; value: string }) {
  const t = useTokens();
  return (
    <Glass radius={14} style={{ padding: 14, minWidth: 110 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.text2 }}>
        <Icon size={12}/>
        <span style={{
          fontSize: 10.5, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 500,
        }}>{label}</span>
      </div>
      <div style={{
        marginTop: 6, fontFamily: t.fontSans, fontSize: 22, fontWeight: 600,
        color: t.text0, letterSpacing: -0.5,
      }}>{value}</div>
    </Glass>
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
                onClick={() => onCreateAgent()}
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
  const W = 720, H = 460;
  const cx = W / 2, cy = H / 2;
  const ringR = Math.min(W, H) * 0.36;
  const nodes = bubbles.map((b, i) => {
    const angle = (i / Math.max(1, bubbles.length)) * Math.PI * 2 - Math.PI / 2;
    const jitter = ((i * 37) % 30) - 15;
    const r = ringR + jitter;
    const state = (b.status as AgentState) || 'idle';
    return {
      ...b, state,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      size: 22 + (state === 'running' ? 8 : 0),
    };
  });

  return (
    <Glass radius={20} style={{ position: 'relative', height: H, padding: 0, overflow: 'hidden' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
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
          cx={cx} cy={cy} r={ringR * 1.4} fill="url(#eco-glow)"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Conexiones — siempre visibles. Inactivas en gris suave, activas brillando + flow. */}
        {nodes.map((n) => {
          const isActive = n.state === 'running' || n.state === 'thinking' || n.state === 'executing';
          const sColor = stateColor(n.state, t);
          const stroke = hover === n.id ? t.accent : (isActive ? sColor : t.text2);
          // Inactivas en 0.4 (antes 0.16) → siempre se ven sin distraer.
          const opacity = hover === n.id ? 0.95 : (isActive ? 0.75 : 0.4);
          return (
            <g key={'e-' + n.id}>
              <line
                x1={cx} y1={cy} x2={n.x} y2={n.y}
                stroke={stroke}
                strokeOpacity={opacity}
                strokeWidth={hover === n.id ? 1.6 : (isActive ? 1.6 : 1.1)}
                strokeDasharray={isActive ? '4 6' : (hover === n.id ? '0' : '0')}
                strokeLinecap="round"
                style={isActive ? {
                  animation: 'eco-flow 1.1s linear infinite',
                  filter: `drop-shadow(0 0 6px ${sColor})`,
                } : undefined}
              />
              {/* Partículas: dos puntos que viajan de Eco hacia el nodo, desfasados.
                  Simula "Eco entregando datos a la burbuja". */}
              {isActive && (
                <>
                  <motion.circle
                    r="2.5"
                    fill={sColor}
                    style={{ filter: `drop-shadow(0 0 6px ${sColor})` }}
                    initial={{ cx, cy, opacity: 0 }}
                    animate={{
                      cx: [cx, n.x],
                      cy: [cy, n.y],
                      opacity: [0, 1, 1, 0],
                    }}
                    transition={{
                      duration: 1.5, repeat: Infinity, ease: 'easeIn',
                      times: [0, 0.15, 0.85, 1],
                    }}
                  />
                  <motion.circle
                    r="1.8"
                    fill={sColor}
                    style={{ filter: `drop-shadow(0 0 5px ${sColor})`, opacity: 0.75 }}
                    initial={{ cx, cy, opacity: 0 }}
                    animate={{
                      cx: [cx, n.x],
                      cy: [cy, n.y],
                      opacity: [0, 0.7, 0.7, 0],
                    }}
                    transition={{
                      duration: 1.5, repeat: Infinity, ease: 'easeIn',
                      times: [0, 0.15, 0.85, 1],
                      delay: 0.6,
                    }}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* Hub central — pulsa cuando hay algo corriendo */}
        <circle cx={cx} cy={cy} r="34" fill={t.bg1}
          stroke={t.accent} strokeWidth="1" strokeOpacity="0.6"/>
        <motion.circle
          cx={cx} cy={cy} r="28" fill="none"
          stroke={t.accent} strokeWidth="0.5" strokeOpacity="0.4"
          animate={{ r: [28, 32, 28], opacity: [0.4, 0.15, 0.4] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill={t.text0} fontFamily={t.fontSans} fontSize="15" fontWeight="500"
          letterSpacing="-0.3">Eco</text>

        {/* Nodos — flotación leve + breathing del radio */}
        {nodes.map((n, i) => {
          const isActive = n.state === 'running' || n.state === 'thinking' || n.state === 'executing';
          const isHover = hover === n.id;
          const sColor = stateColor(n.state, t);
          const floatAmp = 2 + (i % 3);
          const floatDur = 3 + (i % 4) * 0.5;
          const phase = i * 0.13;
          return (
            <motion.g
              key={n.id}
              style={{ cursor: 'pointer' }}
              animate={{ y: [0, -floatAmp, 0, floatAmp, 0] }}
              transition={{
                duration: floatDur, repeat: Infinity, ease: 'easeInOut', delay: phase,
              }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onOpenAgent(n.id)}>
              {isHover && (
                <motion.circle
                  cx={n.x} cy={n.y} r={n.size + 6} fill="none"
                  stroke={t.accent} strokeWidth="1" strokeOpacity="0.5"
                  initial={{ r: n.size, opacity: 0 }}
                  animate={{ r: n.size + 6, opacity: 0.5 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                />
              )}
              {/* Animación de actividad: triple anillo expansivo + glow del nodo */}
              {isActive && (
                <>
                  <motion.circle
                    cx={n.x} cy={n.y} r={n.size}
                    fill="none" stroke={sColor} strokeWidth={1.5}
                    animate={{ r: [n.size, n.size + 16], opacity: [0.55, 0] }}
                    transition={{ duration: 2, ease: 'easeOut', repeat: Infinity }}
                  />
                  <motion.circle
                    cx={n.x} cy={n.y} r={n.size}
                    fill="none" stroke={sColor} strokeWidth={1.2}
                    animate={{ r: [n.size, n.size + 16], opacity: [0.4, 0] }}
                    transition={{ duration: 2, ease: 'easeOut', repeat: Infinity, delay: 0.66 }}
                  />
                  <motion.circle
                    cx={n.x} cy={n.y} r={n.size}
                    fill="none" stroke={sColor} strokeWidth={1}
                    animate={{ r: [n.size, n.size + 16], opacity: [0.3, 0] }}
                    transition={{ duration: 2, ease: 'easeOut', repeat: Infinity, delay: 1.33 }}
                  />
                  {/* Halo glow estático que pulsa la intensidad */}
                  <motion.circle
                    cx={n.x} cy={n.y} r={n.size + 4}
                    fill={sColor}
                    animate={{ opacity: [0.18, 0.32, 0.18] }}
                    transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
                    style={{ filter: `blur(8px)` }}
                  />
                </>
              )}
              <motion.circle
                cx={n.x} cy={n.y}
                fill={t.bg1}
                stroke={isActive ? sColor : (isHover ? t.accent : t.glassBorder)}
                strokeWidth={isActive ? 2 : (isHover ? 1.5 : 1)}
                animate={isActive ? { r: [n.size, n.size + 2, n.size] } : { r: n.size }}
                transition={isActive ? {
                  duration: 1.4, repeat: Infinity, ease: 'easeInOut',
                } : { duration: 0.3 }}
                style={isActive ? { filter: `drop-shadow(0 0 8px ${sColor})` } : undefined}
              />
              <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
                fill={n.accent} fontFamily={t.fontSans} fontSize="13" fontWeight="600"
                style={{ textTransform: 'uppercase', pointerEvents: 'none' }}>
                {bubbleLetter(n.title)}
              </text>
              <circle cx={n.x + n.size * 0.72} cy={n.y - n.size * 0.72} r="4" fill={sColor}
                style={{ filter: isActive ? `drop-shadow(0 0 4px ${sColor})` : 'none' }}/>
              <text x={n.x} y={n.y + n.size + 16} textAnchor="middle"
                fill={isHover ? t.text0 : t.text1}
                fontFamily={t.fontSans} fontSize="11.5" fontWeight="500"
                style={{ pointerEvents: 'none' }}>
                {n.title.length > 14 ? n.title.slice(0, 14) + '…' : n.title}
              </text>
            </motion.g>
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
  bubbles, activeBubbleId, availableWorkspaces, onFocus, onOpenAgent, wakeActive,
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
            <RecentRow key={b.id} bubble={b} active={b.id === activeBubbleId} onClick={() => onFocus(b.id)}/>
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

      <Glass radius={12} style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={t.ok} pulse size={7}/>
          <span style={{ fontFamily: t.fontSans, fontSize: 12, fontWeight: 500, color: t.text0 }}>{tr('rail.cli.label')}</span>
          <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.text2, marginLeft: 'auto' }}>{tr('rail.cli.local')}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: t.text2, lineHeight: 1.5 }}
          dangerouslySetInnerHTML={{
            __html: tr('rail.cli.model', {
              model: `<span style="color:${t.text1};font-family:${t.fontMono}">claude-sonnet-4-5</span>`,
            }),
          }}
        />
      </Glass>
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
