import { useEffect, useRef, useState, type FormEvent, type CSSProperties, type KeyboardEvent } from 'react';
import { useTokens } from '@/design/theme';
import {
  Glass, IconBtn, StatusDot, Pill, Kbd, AgentGlyph, SectionLabel,
} from '@/design/primitives';
import {
  IconWave, IconMic, IconSend, IconPlus, IconGrid, IconGraph, IconExt,
  IconPause, IconPlay, IconResume, IconMore, IconFolder, IconTerminal,
  IconClock, IconAlert, IconZap, IconCpu, IconFile, IconEdit, IconTrash,
} from '@/design/icons';
import type { Bubble, VoiceState } from '@/lib/types';
import { stateColor, type AgentState, STATE_LABELS } from '@/design/tokens';

type Props = {
  bubbles: Bubble[];
  activeBubbleId: string | null;
  voiceState: VoiceState;
  listening: boolean;
  interimText: string;
  onSend: (text: string) => void;
  onMicToggle: () => void;
  onOpenAgent: (id: string) => void;
  onCreateAgent: (title?: string) => void;
  onFocus: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  voiceError?: string | null;
};

export function Dashboard(props: Props) {
  const t = useTokens();
  const { bubbles, activeBubbleId, voiceState, onSend, onMicToggle, onOpenAgent, onCreateAgent, onFocus, onRename, onRemove, interimText, voiceError } = props;
  const [view, setView] = useState<'grid' | 'graph'>('grid');

  const active = bubbles.filter((b) => ['running', 'thinking', 'waiting'].includes(b.status as string));
  const running = active.filter((b) => b.status === 'running' || b.status === 'thinking' || b.status === 'executing');
  const waiting = active.filter((b) => b.status === 'waiting' as string);
  const errors = bubbles.filter((b) => b.status === 'error' as string);

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      <DashboardRail bubbles={bubbles} activeBubbleId={activeBubbleId} onFocus={onFocus}/>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '28px 32px 110px', overflow: 'auto', position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, padding: '12px 8px 32px' }}>
          <VoiceOrb state={voiceState} onClick={onMicToggle}/>

          <div style={{ flex: 1, maxWidth: 380 }}>
            <div style={{
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
              color: t.accent, letterSpacing: 1.5, textTransform: 'uppercase',
            }}>{greetingFor(new Date())}</div>
            <h1 style={{
              margin: '6px 0 14px', fontFamily: t.fontSans, fontSize: 30,
              fontWeight: 600, color: t.text0, letterSpacing: -0.8,
              lineHeight: 1.15,
            }}>
              {active.length} {active.length === 1 ? 'agente activo' : 'agentes activos'}
              <br/>
              en {new Set(bubbles.map((b) => b.workspace).filter(Boolean)).size || 1} proyecto{(new Set(bubbles.map((b) => b.workspace).filter(Boolean)).size || 1) === 1 ? '' : 's'}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {running.length > 0 && <Pill color={t.ok} icon={IconZap}>{running.length} ejecutando</Pill>}
              {waiting.length > 0 && <Pill color={t.warn} icon={IconClock}>{waiting.length} esperando</Pill>}
              {errors.length > 0 && <Pill color={t.err} icon={IconAlert}>{errors.length} con error</Pill>}
              {running.length === 0 && waiting.length === 0 && errors.length === 0 && (
                <Pill color={t.text2}>Todo en orden</Pill>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <Stat icon={IconCpu} label="Mensajes" value={String(bubbles.reduce((a, b) => a + b.messages.length, 0))}/>
            <Stat icon={IconZap} label="Sesiones" value={String(bubbles.length)}/>
            <Stat icon={IconFile} label="Workspaces" value={String(new Set(bubbles.map((b) => b.workspace).filter(Boolean)).size || 0)}/>
          </div>
        </div>

        <SectionLabel count={bubbles.length} action={
          <div style={{ display: 'flex', gap: 4 }}>
            <IconBtn icon={IconGrid} size={28} active={view === 'grid'} onClick={() => setView('grid')}/>
            <IconBtn icon={IconGraph} size={28} active={view === 'graph'} onClick={() => setView('graph')}/>
          </div>
        }>Agentes</SectionLabel>

        {view === 'grid' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}>
            {bubbles.map((b) => (
              <AgentBubble
                key={b.id}
                bubble={b}
                onClick={() => onOpenAgent(b.id)}
                onRename={(title) => onRename(b.id, title)}
                onRemove={() => onRemove(b.id)}
              />
            ))}
            <NewAgentCard onCreate={onCreateAgent}/>
          </div>
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

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
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
  const labels: Record<VoiceState, { label: string; sub: string }> = {
    idle: { label: 'En espera', sub: 'Di "Hey Eco" o pulsa para hablar' },
    listening: { label: 'Escuchando', sub: '' },
    thinking: { label: 'Pensando', sub: '' },
    executing: { label: 'Ejecutando', sub: '' },
    speaking: { label: 'Hablando', sub: '' },
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
  bubble, onClick, onRename, onRemove,
}: {
  bubble: Bubble;
  onClick: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const t = useTokens();
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bubble.title);
  const state = (bubble.status as AgentState) || 'idle';
  const sColor = stateColor(state, t);
  const lastMsg = bubble.messages[bubble.messages.length - 1];
  const lastText = lastMsg?.text || 'Sin mensajes aún';
  const minutesAgo = Math.max(1, Math.round((Date.now() - bubble.updatedAt) / 60000));
  const tStr = minutesAgo < 60 ? `${minutesAgo}m` : `${Math.round(minutesAgo / 60)}h`;
  const workspaceLabel = (bubble.workspace || '').split('/').filter(Boolean).slice(-2).join('/');

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
        background: t.bg2,
        border: `0.5px solid ${hover ? t.glassBorderHi : t.glassBorder}`,
        borderRadius: 18,
        padding: '18px 18px 14px',
        cursor: renaming ? 'default' : 'pointer',
        transition: 'all 200ms ease',
        boxShadow: hover ? t.shadowMd : 'none',
        overflow: 'visible',
        minHeight: 200,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <AgentGlyph size={38} state={state}/>
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
              title="Doble click para renombrar"
              style={{
                fontFamily: t.fontSans, fontSize: 14, fontWeight: 600, color: t.text0,
                letterSpacing: -0.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{bubble.title}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 11.5, color: t.text2 }}>Agente</span>
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
        <StatusDot color={sColor} pulse={state === 'running' || state === 'thinking'} size={7}/>
        <span style={{ fontSize: 11.5, color: sColor, fontWeight: 500 }}>{STATE_LABELS[state] || 'Listo'}</span>
      </div>

      <div style={{
        fontFamily: t.fontSans, fontSize: 12.5, color: t.text1,
        lineHeight: 1.5, marginBottom: 14,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>{lastText}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <span style={{
          flex: 1, fontFamily: t.fontMono, fontSize: 10.5, color: t.text2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{workspaceLabel || '—'}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {state === 'running' || state === 'thinking' ? (
            <IconBtn icon={IconPause} size={26} title="Pausar"/>
          ) : state === 'paused' ? (
            <IconBtn icon={IconPlay} size={26} title="Reanudar"/>
          ) : state === 'error' ? (
            <IconBtn icon={IconResume} size={26} title="Reintentar"/>
          ) : null}
          <IconBtn icon={IconExt} size={26} title="Abrir detalle"/>
        </div>
      </div>
    </div>
  );
}

function NewAgentCard({ onCreate }: { onCreate: (title?: string) => void }) {
  const t = useTokens();
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
          border: `1px solid ${t.accentDim}`,
          borderRadius: 18, minHeight: 200,
          background: t.accentFaint,
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
        <div style={{ fontSize: 12.5, color: t.text2 }}>Nombre de la burbuja</div>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ej: Refactor auth, Investigar bug..."
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
            }}>Cancelar</button>
          <button
            type="button"
            onClick={submit}
            style={{
              flex: 1, height: 32, borderRadius: 999, border: `1px solid ${t.accent}`,
              background: t.accent, color: t.accentOn, fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer',
            }}>Crear</button>
        </div>
        <div style={{ fontSize: 10.5, color: t.text3 }}>↩ enter para crear · esc para cancelar</div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setNaming(true)}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        border: `1px dashed ${h ? t.accentDim : t.glassBorder}`,
        borderRadius: 18, minHeight: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 10, cursor: 'pointer',
        background: h ? t.accentFaint : 'transparent',
        color: h ? t.accent : t.text2,
        transition: 'all 160ms',
      }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: t.bg3, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${t.glassBorder}`,
      }}>
        <IconPlus size={22}/>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>Nueva burbuja</div>
      <div style={{ fontSize: 11, color: t.text3 }}>
        Click para nombrarla o decí <span style={{ color: t.text1 }}>"Eco, abrí una burbuja"</span>
      </div>
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
        <IconEdit size={12}/> Renombrar
      </button>
      <button type="button" onClick={onRemove} style={{ ...menuItemStyle(t), color: t.err }}>
        <IconTrash size={12}/> Cerrar burbuja
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

function GraphView({ bubbles, onOpenAgent }: { bubbles: Bubble[]; onOpenAgent: (id: string) => void }) {
  const t = useTokens();
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
        </defs>
        <rect width={W} height={H} fill="url(#eco-grid)"/>
        <circle cx={cx} cy={cy} r={ringR * 1.4} fill="url(#eco-glow)"/>

        {nodes.map((n) => {
          const isActive = n.state === 'running' || n.state === 'thinking';
          const sColor = stateColor(n.state, t);
          return (
            <line key={'e-' + n.id}
              x1={cx} y1={cy} x2={n.x} y2={n.y}
              stroke={hover === n.id ? t.accent : (isActive ? sColor : t.text3)}
              strokeOpacity={hover === n.id ? 0.7 : (isActive ? 0.35 : 0.2)}
              strokeWidth={hover === n.id ? 1.5 : 1}
              strokeDasharray={isActive ? '0' : '3 4'}
            />
          );
        })}

        <circle cx={cx} cy={cy} r="34" fill={t.bg1}
          stroke={t.accent} strokeWidth="1" strokeOpacity="0.6"/>
        <circle cx={cx} cy={cy} r="28" fill="none"
          stroke={t.accent} strokeWidth="0.5" strokeOpacity="0.4"/>
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill={t.text0} fontFamily={t.fontSans} fontSize="15" fontWeight="500"
          letterSpacing="-0.3">Eco</text>

        {nodes.map((n) => {
          const isActive = n.state === 'running' || n.state === 'thinking';
          const isHover = hover === n.id;
          const sColor = stateColor(n.state, t);
          return (
            <g key={n.id} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onOpenAgent(n.id)}>
              {isHover && (
                <circle cx={n.x} cy={n.y} r={n.size + 6} fill="none"
                  stroke={t.accent} strokeWidth="1" strokeOpacity="0.5"/>
              )}
              <circle cx={n.x} cy={n.y} r={n.size} fill={t.bg1}
                stroke={isHover ? t.accent : t.glassBorder} strokeWidth="1"/>
              <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
                fill={t.text0} fontFamily={t.fontSans} fontSize="13" fontWeight="500">
                {n.title.charAt(0).toUpperCase()}
              </text>
              <circle cx={n.x + n.size * 0.72} cy={n.y - n.size * 0.72} r="4" fill={sColor}
                style={{ filter: isActive ? `drop-shadow(0 0 4px ${sColor})` : 'none' }}/>
              <text x={n.x} y={n.y + n.size + 16} textAnchor="middle"
                fill={isHover ? t.text0 : t.text1}
                fontFamily={t.fontSans} fontSize="11.5" fontWeight="500">
                {n.title.length > 14 ? n.title.slice(0, 14) + '…' : n.title}
              </text>
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
        {bubbles.length} nodos conectados a Eco
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
      ? 'Escuchando · decí «Eco» seguido del comando…'
      : 'Eco, dile al agente que…';

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
  bubbles, activeBubbleId, onFocus,
}: {
  bubbles: Bubble[];
  activeBubbleId: string | null;
  onFocus: (id: string) => void;
}) {
  const t = useTokens();
  const recent = [...bubbles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const folders = Array.from(new Set(bubbles.map((b) => b.workspace).filter(Boolean)));

  return (
    <div style={{
      width: 280, flexShrink: 0,
      borderRight: `1px solid ${t.glassBorder}`,
      padding: '20px 16px',
      display: 'flex', flexDirection: 'column', gap: 18,
      overflow: 'auto',
    }}>
      <div>
        <SectionLabel>Burbujas recientes</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recent.length === 0 ? (
            <div style={{ fontSize: 12, color: t.text3, padding: 8 }}>Sin actividad reciente.</div>
          ) : recent.map((b) => (
            <RecentRow key={b.id} bubble={b} active={b.id === activeBubbleId} onClick={() => onFocus(b.id)}/>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel count={folders.length}>Carpetas activas</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {folders.length === 0 ? (
            <div style={{ fontSize: 12, color: t.text3, padding: 8 }}>Sin carpetas seleccionadas.</div>
          ) : folders.map((f) => (
            <FolderRow key={f} path={f}/>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      <Glass radius={12} style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={t.ok} pulse size={7}/>
          <span style={{ fontFamily: t.fontSans, fontSize: 12, fontWeight: 500, color: t.text0 }}>Claude CLI</span>
          <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.text2, marginLeft: 'auto' }}>local</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: t.text2, lineHeight: 1.5 }}>
          Modelo: <span style={{ color: t.text1, fontFamily: t.fontMono }}>claude-sonnet-4-5</span>
        </div>
      </Glass>
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

function FolderRow({ path }: { path: string }) {
  const t = useTokens();
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
        background: h ? t.bg3 : 'transparent',
      }}>
      <div style={{ color: t.accent }}>
        <IconFolder size={14}/>
      </div>
      <span style={{
        flex: 1, fontFamily: t.fontMono, fontSize: 11.5, color: t.text1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{path}</span>
    </div>
  );
}
