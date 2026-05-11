import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import {
  Glass, Btn, IconBtn, Pill, AgentGlyph, SectionLabel,
} from '@/design/primitives';
import {
  IconArrowL, IconPause, IconPlay, IconResume, IconStop, IconMore,
  IconCommand, IconTerminal, IconFile, IconLayers, IconSend, IconMic,
  IconCheck, IconX, IconBolt, IconDiff, IconExt, IconShield,
  type IconProps,
} from '@/design/icons';
import type { Bubble, Message, ToolCall } from '@/lib/types';
import { stateColor, STATE_LABELS, type AgentState } from '@/design/tokens';

type Props = {
  bubble: Bubble;
  onBack: () => void;
  onSend: (text: string) => void;
  onRename: (title: string) => void;
};

type Tab = 'chat' | 'terminal' | 'files' | 'plan';

export function AgentDetail({ bubble, onBack, onSend, onRename }: Props) {
  const t = useTokens();
  const [tab, setTab] = useState<Tab>('chat');
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bubble.title);
  const state = (bubble.status as AgentState) || 'idle';
  const sColor = stateColor(state, t);

  useEffect(() => { setDraft(bubble.title); }, [bubble.title]);

  function commitRename() {
    const v = draft.trim();
    if (v && v !== bubble.title) onRename(v);
    setRenaming(false);
  }

  const filesChanged = collectFilesChanged(bubble);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 24px', borderBottom: `1px solid ${t.glassBorder}`,
      }}>
        <IconBtn icon={IconArrowL} size={32} onClick={onBack}/>
        <AgentGlyph size={40} state={state}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                title="Doble click para renombrar"
                style={{
                  margin: 0, fontFamily: t.fontSans, fontSize: 18, fontWeight: 600,
                  color: t.text0, letterSpacing: -0.3, cursor: 'text',
                }}>{bubble.title}</h2>
            )}
            <Pill color={sColor}>{STATE_LABELS[state] || 'Listo'}</Pill>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 11.5, color: t.text2 }}>Burbuja</span>
            <span style={{ color: t.text3 }}>·</span>
            <span style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.text2 }}>
              {bubble.workspace || '—'}
            </span>
            <span style={{ color: t.text3 }}>·</span>
            <span style={{ fontSize: 11.5, color: t.text2 }}>
              ID <span style={{ fontFamily: t.fontMono, color: t.text1 }}>{bubble.id.slice(0, 10)}</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {(state === 'running' || state === 'thinking' || (state as string) === 'executing') ? (
            <Btn icon={IconPause} kind="secondary" size="sm">Pausar</Btn>
          ) : state === 'paused' ? (
            <Btn icon={IconPlay} kind="secondary" size="sm">Reanudar</Btn>
          ) : state === 'error' ? (
            <Btn icon={IconResume} kind="secondary" size="sm">Reintentar</Btn>
          ) : (
            <Btn icon={IconPlay} kind="secondary" size="sm">Hablar</Btn>
          )}
          <Btn icon={IconStop} kind="danger" size="sm">Detener</Btn>
          <IconBtn icon={IconMore} size={32}/>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 2, padding: '0 24px',
        borderBottom: `1px solid ${t.glassBorder}`,
      }}>
        <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')} label="Conversación" icon={IconCommand} badge={bubble.messages.length}/>
        <TabBtn active={tab === 'terminal'} onClick={() => setTab('terminal')} label="Terminal" icon={IconTerminal}/>
        <TabBtn active={tab === 'files'} onClick={() => setTab('files')} label="Archivos" icon={IconFile} badge={filesChanged.length}/>
        <TabBtn active={tab === 'plan'} onClick={() => setTab('plan')} label="Plan" icon={IconLayers}/>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {tab === 'chat' && <ChatPanel bubble={bubble} onSend={onSend}/>}
          {tab === 'terminal' && <TerminalPanel bubble={bubble}/>}
          {tab === 'files' && <FilesPanel files={filesChanged}/>}
          {tab === 'plan' && <PlanPanel bubble={bubble}/>}
        </div>
        <AgentSidebar bubble={bubble}/>
      </div>
    </div>
  );
}

type FileChange = { path: string; change: string; agent: string };

function collectFilesChanged(bubble: Bubble): FileChange[] {
  const out: FileChange[] = [];
  for (const m of bubble.messages) {
    for (const tc of m.toolCalls ?? []) {
      if (tc.status !== 'success') continue;
      if (tc.name === 'Write' || tc.name === 'Edit' || tc.name === 'MultiEdit' || tc.name === 'NotebookEdit') {
        const filePath = String((tc.input as { file_path?: unknown }).file_path ?? '');
        if (filePath) out.push({ path: filePath, change: tc.name === 'Write' ? 'creado' : 'modificado', agent: bubble.title });
      }
    }
  }
  return out;
}

function TabBtn({ active, onClick, label, icon: Icon, badge }: {
  active: boolean; onClick: () => void; label: string; icon: (p: IconProps) => JSX.Element; badge?: number;
}) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '12px 14px', background: 'transparent', border: 0,
        borderBottom: `2px solid ${active ? t.accent : 'transparent'}`,
        color: active ? t.text0 : t.text2, cursor: 'pointer',
        fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
        transition: 'color 140ms', marginBottom: -1,
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

function ChatPanel({ bubble, onSend }: { bubble: Bubble; onSend: (text: string) => void }) {
  const t = useTokens();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubble.messages.length, bubble.status]);

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    onSend(v);
    setDraft('');
  };

  return (
    <>
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', padding: '24px 32px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {bubble.messages.length === 0 ? (
          <EmptyChat title={bubble.title}/>
        ) : bubble.messages.map((m, i) => (
          <ChatBubble key={m.id} msg={m} agent={bubble.title} index={i}/>
        ))}
        {bubble.status === 'thinking' && <ThinkingBubble label="Pensando…"/>}
        {bubble.status === 'executing' && <ThinkingBubble label="Ejecutando…"/>}
      </div>

      <div style={{ padding: '12px 24px 18px', borderTop: `1px solid ${t.glassBorder}` }}>
        <Glass radius={16} style={{ padding: 6, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={`Escríbele a ${bubble.title}…`}
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none', resize: 'none',
              fontFamily: t.fontSans, fontSize: 13.5, color: t.text0,
              padding: '10px 12px', minHeight: 22, maxHeight: 120,
              lineHeight: 1.5,
            }}
          />
          <IconBtn icon={IconMic} size={32}/>
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: draft.trim() ? t.accent : t.bg3,
              color: draft.trim() ? t.accentOn : t.text3,
              border: 0, cursor: draft.trim() ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconSend size={14}/>
          </button>
        </Glass>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {['¿Cómo va?', 'Resume', 'Pausá y revisá', 'Continuá'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDraft(s)}
              style={{
                padding: '5px 11px', borderRadius: 999,
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                color: t.text1, fontSize: 11.5, cursor: 'pointer',
                fontFamily: t.fontSans,
              }}>{s}</button>
          ))}
        </div>
      </div>
    </>
  );
}

function ChatBubble({ msg, agent, index }: { msg: Message; agent: string; index: number }) {
  const t = useTokens();
  const isUser = msg.role === 'user';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {isUser ? (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: t.accentOn, fontWeight: 500, fontSize: 13, flexShrink: 0,
        }}>Tú</div>
      ) : <AgentGlyph size={32} state="done"/>}
      <div style={{ flex: 1, paddingTop: 6, minWidth: 0 }}>
        <div style={{
          fontFamily: t.fontSans, fontSize: 11.5, color: t.text2, marginBottom: 4,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: t.text1, fontWeight: 500 }}>{isUser ? 'Tú' : agent}</span>
        </div>
        {msg.text && (
          <div style={{
            fontFamily: t.fontSans, fontSize: 13.5, color: t.text0,
            lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>{msg.text}</div>
        )}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {msg.toolCalls.map((tc) => <ToolCallRow key={tc.id} tc={tc}/>)}
          </div>
        )}
      </div>
      <span style={{ fontSize: 10, color: t.text3, fontFamily: t.fontMono, marginTop: 8 }}>#{index + 1}</span>
    </div>
  );
}

function ToolCallRow({ tc }: { tc: ToolCall }) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const summary = summarizeInput(tc.input);
  const sColor = tc.status === 'success' ? t.ok : tc.status === 'denied' ? t.warn : tc.status === 'error' ? t.err : t.accent;

  return (
    <div style={{
      background: t.bg2, border: `1px solid ${t.glassBorder}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => tc.output && setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', background: 'transparent', border: 0,
          cursor: tc.output ? 'pointer' : 'default', textAlign: 'left',
        }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: sColor, flexShrink: 0 }}/>
        <span style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.text0, fontWeight: 500 }}>{tc.name}</span>
        <span style={{
          flex: 1, fontFamily: t.fontMono, fontSize: 11, color: t.text2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{summary}</span>
        {tc.status === 'running' && <span style={{
          width: 10, height: 10, borderRadius: '50%', background: t.accent,
          animation: 'eco-shimmer 1.1s ease-in-out infinite',
        }}/>}
      </button>
      {open && tc.output && (
        <pre style={{
          margin: 0, padding: '8px 12px 12px',
          fontFamily: t.fontMono, fontSize: 11, color: t.text1,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          borderTop: `1px solid ${t.glassBorder}`,
          maxHeight: 240, overflow: 'auto',
        }}>{tc.output}</pre>
      )}
    </div>
  );
}

function summarizeInput(input: Record<string, unknown>): string {
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.command === 'string') return String(input.command).slice(0, 70);
  if (typeof input.query === 'string') return input.query;
  return '';
}

function ThinkingBubble({ label }: { label: string }) {
  const t = useTokens();
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <AgentGlyph size={32} state="thinking"/>
      <div style={{ paddingTop: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: t.text2,
            animation: 'eco-typing 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}/>
        ))}
        <span style={{ marginLeft: 8, color: t.text2, fontSize: 12, fontStyle: 'italic' }}>{label}</span>
      </div>
    </div>
  );
}

function EmptyChat({ title }: { title: string }) {
  const t = useTokens();
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32,
    }}>
      <AgentGlyph size={64} state="done"/>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: t.text0, fontWeight: 600, letterSpacing: -0.2 }}>
          Inicia conversación con {title}
        </h3>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: t.text2, lineHeight: 1.55 }}>
          Escribí algo abajo o decí «Eco» seguido del comando.
        </p>
      </div>
    </div>
  );
}

function TerminalPanel({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const lines: { c: string; t: string }[] = [];
  lines.push({ c: t.text3, t: `eco-shell · ${bubble.workspace || '/tmp/eco-test'}` });
  lines.push({ c: t.accent, t: `◆ Sesión: ${bubble.title}` });
  lines.push({ c: t.text2, t: '' });
  for (const m of bubble.messages) {
    for (const tc of m.toolCalls ?? []) {
      const cmd = (tc.input as { command?: unknown }).command;
      if (tc.name === 'Bash' && typeof cmd === 'string') {
        lines.push({ c: t.text2, t: `$ ${cmd}` });
        if (tc.output) {
          for (const line of tc.output.split('\n').slice(0, 8)) {
            lines.push({ c: tc.status === 'success' ? t.text1 : t.err, t: line });
          }
        }
      } else if (tc.name) {
        lines.push({ c: t.text2, t: `→ ${tc.name} ${summarizeInput(tc.input)}` });
      }
    }
  }
  if (lines.length <= 3) {
    lines.push({ c: t.text3, t: 'Aún no hay actividad de terminal en esta burbuja.' });
  }
  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '20px 24px',
      fontFamily: t.fontMono, fontSize: 12.5, lineHeight: 1.65,
      background: t.bg0,
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.c, whiteSpace: 'pre-wrap' }}>{l.t || ' '}</div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
        <span style={{ color: t.accent, marginRight: 8 }}>›</span>
        <span style={{
          width: 7, height: 14, background: t.accent, display: 'inline-block',
          animation: 'eco-shimmer 1.1s ease-in-out infinite',
        }}/>
      </div>
    </div>
  );
}

function FilesPanel({ files }: { files: FileChange[] }) {
  const t = useTokens();
  if (files.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32, color: t.text2, fontSize: 13,
      }}>
        Esta burbuja todavía no modificó archivos.
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
      <SectionLabel count={files.length}>Archivos modificados</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.map((f, i) => (
          <Glass key={i} radius={12} hover style={{
            padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: t.bg3, color: t.text1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><IconFile size={16}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: t.fontMono, fontSize: 13, color: t.text0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{f.path}</div>
              <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Pill color={f.change === 'creado' ? t.ok : t.accent}>{f.change}</Pill>
              </div>
            </div>
            <Btn kind="ghost" size="sm" icon={IconDiff}>Diff</Btn>
            <IconBtn icon={IconExt} size={28} title="Abrir en editor"/>
          </Glass>
        ))}
      </div>
    </div>
  );
}

function PlanPanel({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  // Plan derivado de toolCalls: cada distinct tool = un paso
  const steps: { state: 'done' | 'running' | 'pending' | 'error'; text: string; detail?: string }[] = [];
  for (const m of bubble.messages) {
    for (const tc of m.toolCalls ?? []) {
      const stateMap: Record<ToolCall['status'], 'done' | 'running' | 'pending' | 'error'> = {
        success: 'done',
        running: 'running',
        error: 'error',
        denied: 'error',
      };
      steps.push({
        state: stateMap[tc.status],
        text: `${tc.name} ${summarizeInput(tc.input)}`,
        detail: tc.output ? tc.output.slice(0, 80) : undefined,
      });
    }
  }
  if (steps.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32, color: t.text2, fontSize: 13,
      }}>
        Aún no hay plan generado. Cuando el agente trabaje, los pasos aparecerán aquí.
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: t.text0, letterSpacing: -0.2 }}>
          Plan de ejecución
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: t.text2 }}>
          {steps.length} pasos · {steps.filter((s) => s.state === 'done').length} completados
        </p>
      </div>
      <div style={{ position: 'relative' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: s.state === 'done' ? t.ok
                  : s.state === 'running' ? t.accent
                    : s.state === 'error' ? t.err : t.bg3,
                color: s.state === 'pending' ? t.text2 : t.accentOn,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: s.state === 'pending' ? `1px solid ${t.glassBorder}` : 'none',
                boxShadow: s.state === 'running' ? `0 0 16px ${t.accentGlow}` : 'none',
              }}>
                {s.state === 'done' ? <IconCheck size={12} strokeWidth={3}/> :
                  s.state === 'error' ? <IconX size={12} strokeWidth={3}/> :
                    s.state === 'running' ? <span style={{
                      width: 8, height: 8, borderRadius: '50%', background: t.accentOn,
                      animation: 'eco-typing 1.4s infinite',
                    }}/> :
                      <span style={{ fontSize: 11, fontFamily: t.fontMono, color: t.text2 }}>{i + 1}</span>}
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  flex: 1, width: 1, minHeight: 24,
                  background: s.state === 'done' ? t.ok : t.glassBorder,
                  marginTop: 4,
                }}/>
              )}
            </div>
            <div style={{ flex: 1, paddingTop: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: t.fontMono, fontSize: 12.5, fontWeight: 500,
                color: s.state === 'pending' ? t.text2 : t.text0,
                wordBreak: 'break-all',
              }}>{s.text}</div>
              {s.detail && (
                <div style={{ marginTop: 3, fontSize: 11.5, color: t.text2 }}>{s.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentSidebar({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const min = Math.max(1, Math.round((Date.now() - bubble.createdAt) / 60000));
  const toolCallCount = bubble.messages.reduce((acc, m) => acc + (m.toolCalls?.length ?? 0), 0);
  return (
    <div style={{
      width: 280, flexShrink: 0,
      borderLeft: `1px solid ${t.glassBorder}`,
      overflow: 'auto', padding: '20px 18px',
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      <div>
        <SectionLabel>Estadísticas</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatBox label="Tiempo activo" value={`${min}m`}/>
          <StatBox label="Mensajes" value={String(bubble.messages.length)}/>
          <StatBox label="Tool calls" value={String(toolCallCount)}/>
          <StatBox label="Estado" value={STATE_LABELS[(bubble.status as AgentState) || 'idle']}/>
        </div>
      </div>

      <div>
        <SectionLabel>Próxima acción</SectionLabel>
        <Glass radius={12} style={{ padding: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
            color: t.accent, fontSize: 11, fontWeight: 500,
          }}>
            <IconBolt size={12}/> Sugerencia
          </div>
          <div style={{ fontSize: 12.5, color: t.text0, lineHeight: 1.5 }}>
            {bubble.status === 'idle' ? 'Continuá la conversación o decile algo más.' :
              bubble.status === 'thinking' ? 'Eco está procesando tu última instrucción.' :
                bubble.status === 'executing' ? 'Esperá a que termine la ejecución.' :
                  'Revisá los archivos modificados.'}
          </div>
        </Glass>
      </div>

      <div style={{ marginTop: 'auto' }}>
        <Glass radius={12} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconShield size={16} strokeWidth={1.5}/>
          <div style={{ flex: 1, fontSize: 12, color: t.text1 }}>Modo seguro activo</div>
          <div style={{
            width: 28, height: 16, borderRadius: 999, background: t.accent,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 2, right: 2,
              width: 12, height: 12, borderRadius: '50%', background: t.accentOn,
            }}/>
          </div>
        </Glass>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <div style={{
      padding: 10, background: t.bg2, border: `1px solid ${t.glassBorder}`,
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: 10, color: t.text2, letterSpacing: 0.3,
        textTransform: 'uppercase', fontWeight: 500,
      }}>{label}</div>
      <div style={{
        marginTop: 4, fontFamily: t.fontSans, fontSize: 17, fontWeight: 600,
        color: t.text0, letterSpacing: -0.3,
      }}>{value}</div>
    </div>
  );
}
