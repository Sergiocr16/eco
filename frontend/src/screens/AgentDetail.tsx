import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useTokens } from '@/design/theme';
import { DiffViewer } from '@/components/DiffViewer';
import { RealTerminal } from '@/components/RealTerminal';
import { SkillsPicker } from '@/components/SkillsPicker';
import type { SkillInfo } from '@/hooks/useSkills';
import { useProfile } from '@/hooks/useProfile';
import { setVoiceTarget } from '@/lib/voice-router';
import { useGitChanges } from '@/hooks/useGitChanges';
import { BranchPicker } from '@/components/BranchPicker';
import {
  Glass, Btn, IconBtn, Pill, AgentGlyph, SectionLabel, bubbleLetter,
} from '@/design/primitives';
import { EcoMark } from '@/design/EcoMark';
import {
  IconArrowL, IconStop, IconMore,
  IconCommand, IconTerminal, IconFile, IconLayers, IconSend, IconMic, IconMicOff,
  IconCheck, IconX, IconBolt, IconDiff,
  IconEdit, IconFolder, IconTrash, IconCopy,
  type IconProps,
} from '@/design/icons';
import type { Bubble, Message, ToolCall } from '@/lib/types';
import { stateColor, type AgentState } from '@/design/tokens';
import { useQuickSuggestions } from '@/hooks/useQuickSuggestions';
import { stripWakePrefix } from '@/lib/meta-commands';
import { useT } from '@/hooks/useI18n';
import { translateBackendError } from '@/lib/backend-errors';
import { on as ecoOn } from '@/lib/eco-bus';

function copyTranscriptToClipboard(bubble: Bubble) {
  const lines: string[] = [`# ${bubble.title}`, ''];
  for (const m of bubble.messages) {
    lines.push(`${m.role === 'user' ? 'You' : 'Eco'}: ${m.text}`);
    for (const tc of m.toolCalls ?? []) {
      lines.push(`  · ${tc.name} ${typeof tc.input === 'object' ? JSON.stringify(tc.input) : ''}`);
      if (tc.output) lines.push(`    → ${tc.output.split('\n')[0]}`);
    }
    lines.push('');
  }
  const text = lines.join('\n');
  try {
    navigator.clipboard?.writeText(text);
  } catch { /* noop */ }
}

function HeaderMenu({
  workspaces, currentWorkspace, onClose, onRename, onChangeWorkspace,
  onCopyTranscript, onCloseBubble,
}: {
  workspaces: string[];
  currentWorkspace: string;
  onClose: () => void;
  onRename: () => void;
  onChangeWorkspace: (ws: string) => void;
  onCopyTranscript: () => void;
  onCloseBubble: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [wsOpen, setWsOpen] = useState(false);
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
        <IconEdit size={12}/> {tr('detail.menu.rename')}
      </button>
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
      <button type="button" onClick={onCopyTranscript} style={menuItemStyleAt(t)}>
        <IconCopy size={12}/> {tr('detail.menu.copy_chat')}
      </button>
      <div style={{ height: 1, background: t.glassBorder, margin: '4px 8px' }}/>
      <button type="button" onClick={onCloseBubble} style={{ ...menuItemStyleAt(t), color: t.err }}>
        <IconTrash size={12}/> {tr('detail.menu.close')}
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
  onSend: (text: string) => void;
  onInterrupt: () => void;
  onRename: (title: string) => void;
  onClose: () => void;
  onChangeWorkspace: (workspace: string) => void;
  onMicToggle: () => void;
  listening: boolean;
  voiceInterim: string;
};

type Tab = 'chat' | 'terminal' | 'files' | 'plan';

export function AgentDetail({
  bubble, workspaces, onBack, onSend, onInterrupt, onRename, onClose, onChangeWorkspace,
  onMicToggle, listening, voiceInterim,
}: Props) {
  const t = useTokens();
  const tr = useT();
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
  const [tab, setTab] = useState<Tab>('chat');
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bubble.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const state = (bubble.status as AgentState) || 'idle';
  const sColor = stateColor(state, t);

  useEffect(() => { setDraft(bubble.title); }, [bubble.title]);

  function commitRename() {
    const v = draft.trim();
    if (v && v !== bubble.title) onRename(v);
    setRenaming(false);
  }

  const agentFiles = collectFilesChanged(bubble);
  const gitChanges = useGitChanges(bubble.workspace, bubble.id);
  const filesChanged = useMemo(() => {
    const map = new Map<string, FileChange>();
    for (const f of agentFiles) map.set(f.path, f);
    const ws = bubble.workspace;
    for (const g of gitChanges) {
      // gitChanges paths ya vienen absolutos (el hook los expande)
      if (!map.has(g.path)) map.set(g.path, { path: g.path, change: g.change, agent: 'git' });
    }
    void ws;
    return [...map.values()];
  }, [agentFiles, gitChanges, bubble.workspace]);

  // Comandos por voz: cambiar tab desde fuera del componente.
  useEffect(() => ecoOn('eco:switch_tab', ({ tab }) => setTab(tab)), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 24px', borderBottom: `1px solid ${t.glassBorder}`,
      }}>
        <IconBtn icon={IconArrowL} size={32} onClick={onBack}/>
        <AgentGlyph size={40} state={state} letter={bubbleLetter(bubble.title)} accent={bubble.accent}/>
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
                title={tr('dash.bubble.rename_tip')}
                style={{
                  margin: 0, fontFamily: t.fontSans, fontSize: 18, fontWeight: 600,
                  color: t.text0, letterSpacing: -0.3, cursor: 'text',
                }}>{bubble.title}</h2>
            )}
            <Pill color={sColor}>{STATE_LABELS_I18N[state] || tr('state.idle')}</Pill>
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
          <Btn
            icon={listening ? IconStop : IconMic}
            kind={listening ? 'primary' : 'secondary'}
            size="sm"
            onClick={onMicToggle}
            title={listening ? tr('detail.btn.listen_off_title') : tr('detail.btn.listen_on_title')}
          >
            {listening ? tr('detail.btn.listening') : tr('detail.btn.listen')}
          </Btn>
          <IconBtn icon={IconMore} size={32} onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}/>
          {menuOpen && (
            <HeaderMenu
              workspaces={workspaces}
              currentWorkspace={bubble.workspace}
              onClose={() => setMenuOpen(false)}
              onRename={() => { setMenuOpen(false); setDraft(bubble.title); setRenaming(true); }}
              onChangeWorkspace={(ws) => { setMenuOpen(false); onChangeWorkspace(ws); }}
              onCopyTranscript={() => { setMenuOpen(false); copyTranscriptToClipboard(bubble); }}
              onCloseBubble={() => { setMenuOpen(false); onClose(); }}
            />
          )}
        </div>
      </div>

      <div style={{
        position: 'relative',
        display: 'flex', gap: 2, padding: '0 24px',
        borderBottom: `1px solid ${t.glassBorder}`,
      }}>
        <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')} label={tr('detail.tab.chat')} icon={IconCommand} badge={bubble.messages.length}/>
        <TabBtn active={tab === 'terminal'} onClick={() => setTab('terminal')} label={tr('detail.tab.terminal')} icon={IconTerminal}/>
        <TabBtn active={tab === 'files'} onClick={() => setTab('files')} label={tr('detail.tab.files')} icon={IconFile} badge={filesChanged.length}/>
        <TabBtn active={tab === 'plan'} onClick={() => setTab('plan')} label={tr('detail.tab.plan')} icon={IconLayers}/>
        <SkillsPicker
          workspace={bubble.workspace}
          onRun={(skill) => onSend(buildSkillPrompt(skill))}
        />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {tab === 'chat' && (
            <ChatPanel
              bubble={bubble}
              onSend={onSend}
              onInterrupt={onInterrupt}
              onMicToggle={onMicToggle}
              listening={listening}
              voiceInterim={voiceInterim}
            />
          )}
          {tab === 'terminal' && <TerminalPanel bubble={bubble}/>}
          {tab === 'files' && <FilesPanel files={filesChanged} workspace={bubble.workspace} bubbleId={bubble.id}/>}
          {tab === 'plan' && <PlanPanel bubble={bubble}/>}
        </div>
        <AgentSidebar bubble={bubble} onSend={onSend}/>
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
        if (filePath) out.push({ path: filePath, change: tc.name === 'Write' ? 'created' : 'modified', agent: bubble.title });
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

function ChatPanel({
  bubble, onSend, onInterrupt, onMicToggle, listening, voiceInterim,
}: {
  bubble: Bubble;
  onSend: (text: string) => void;
  onInterrupt: () => void;
  onMicToggle: () => void;
  listening: boolean;
  voiceInterim: string;
}) {
  const t = useTokens();
  const tr = useT();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const suggestions = useQuickSuggestions();

  // Si el interim empieza con "Eco", no se mezcla con el draft del chat:
  // el comando va al sistema, no a la conversación.
  const interimParsed = stripWakePrefix(voiceInterim);
  const interimForChat = interimParsed.isMeta ? '' : voiceInterim;
  const displayValue = interimForChat || draft;
  const commandInProgress = interimParsed.isMeta ? interimParsed.rest : '';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubble.messages.length, bubble.status]);

  useEffect(() => ecoOn('eco:scroll', ({ dir }) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = el.clientHeight * 0.85;
    if (dir === 'top') el.scrollTo({ top: 0, behavior: 'smooth' });
    else if (dir === 'bottom') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else if (dir === 'up') el.scrollBy({ top: -step, behavior: 'smooth' });
    else if (dir === 'down') el.scrollBy({ top: step, behavior: 'smooth' });
  }), []);

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
        {bubble.status === 'thinking' && <ThinkingBubble label={tr('detail.chat.thinking')}/>}
        {bubble.status === 'executing' && <ThinkingBubble label={tr('detail.chat.executing')}/>}
      </div>

      <div style={{ padding: '12px 24px 18px', borderTop: `1px solid ${t.glassBorder}` }}>
        {commandInProgress !== '' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', marginBottom: 6, borderRadius: 999,
            background: `color-mix(in oklch, ${t.accent} 10%, transparent)`,
            border: `1px solid color-mix(in oklch, ${t.accent} 25%, transparent)`,
            fontSize: 12, color: t.accent,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: t.accent,
              animation: 'eco-shimmer 1s ease-in-out infinite',
            }}/>
            <span style={{ fontFamily: t.fontMono, fontWeight: 500 }}>Eco</span>
            <span style={{ color: t.text1 }}>· {commandInProgress || tr('detail.chat.eco_listening')}</span>
          </div>
        )}
        <Glass radius={16} style={{ padding: 6, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <textarea
            value={displayValue}
            onChange={(e) => setDraft(e.target.value)}
            readOnly={!!interimForChat}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={
              listening
                ? tr('detail.chat.listening_hint')
                : tr('detail.chat.write_to', { name: bubble.title })
            }
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none', resize: 'none',
              fontFamily: t.fontSans, fontSize: 13.5, color: t.text0,
              padding: '10px 12px', minHeight: 22, maxHeight: 120,
              lineHeight: 1.5,
            }}
          />
          <IconBtn
            icon={listening ? IconMicOff : IconMic}
            size={32}
            active={listening}
            title={listening ? tr('detail.btn.listen_off_title') : tr('detail.btn.listen_on_title')}
            onClick={onMicToggle}
          />
          {bubble.status === 'thinking' || bubble.status === 'executing' || bubble.status === 'running' ? (
            <button
              type="button"
              onClick={onInterrupt}
              title={tr('detail.btn.interrupt')}
              style={{
                width: 32, height: 32, borderRadius: 10,
                background: t.err,
                color: t.accentOn,
                border: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 12px color-mix(in oklch, ${t.err} 35%, transparent)`,
              }}>
              <IconStop size={14}/>
            </button>
          ) : (
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
          )}
        </Glass>
        {suggestions.suggestions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {suggestions.suggestions.map((s) => (
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
        )}
      </div>
    </>
  );
}

function ChatBubble({ msg, agent, index }: { msg: Message; agent: string; index: number }) {
  const t = useTokens();
  const tr = useT();
  const profile = useProfile();
  const isUser = msg.role === 'user';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {isUser ? (
        profile.photo ? (
          <img
            src={profile.photo}
            alt={profile.username ?? tr('detail.chat.you')}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              objectFit: 'cover', flexShrink: 0,
              border: `0.5px solid ${t.glassBorder}`,
            }}
          />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t.accentOn, fontWeight: 500, fontSize: 14, flexShrink: 0,
            letterSpacing: -0.3,
          }}>{profile.username ? profile.initial : tr('detail.chat.you')}</div>
        )
      ) : (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: t.bg3,
          border: `0.5px solid ${t.glassBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <EcoMark size={20}/>
        </div>
      )}
      <div style={{ flex: 1, paddingTop: 6, minWidth: 0 }}>
        <div style={{
          fontFamily: t.fontSans, fontSize: 11.5, color: t.text2, marginBottom: 4,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: t.text1, fontWeight: 500 }}>{isUser ? tr('detail.chat.you') : agent}</span>
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
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: t.accentFaint,
        border: `0.5px solid color-mix(in oklch, ${t.accent} 30%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <EcoMark size={20}/>
      </div>
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
  const tr = useT();
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32,
    }}>
      <EcoMark size={64}/>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: t.text0, fontWeight: 600, letterSpacing: -0.2 }}>
          {tr('detail.chat.empty_title', { name: title })}
        </h3>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: t.text2, lineHeight: 1.55 }}>
          {tr('detail.chat.empty_sub')}
        </p>
      </div>
    </div>
  );
}

type TermLine =
  | { kind: 'system'; text: string; color?: string }
  | { kind: 'prompt'; cwd: string; command: string }
  | { kind: 'stdout'; text: string }
  | { kind: 'stderr'; text: string }
  | { kind: 'meta'; text: string };

function TerminalPanel({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const [subTab, setSubTab] = useState<'shell' | 'agent' | 'cmds'>('shell');
  useEffect(() => {
    setVoiceTarget(subTab === 'shell' ? 'pty' : 'chat');
    return () => { setVoiceTarget('chat'); };
  }, [subTab]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        display: 'flex', gap: 4, padding: '8px 10px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg1,
      }}>
        <SubTabBtn active={subTab === 'shell'} onClick={() => setSubTab('shell')}>Shell</SubTabBtn>
        <SubTabBtn active={subTab === 'agent'} onClick={() => setSubTab('agent')}>Agente</SubTabBtn>
        <SubTabBtn active={subTab === 'cmds'} onClick={() => setSubTab('cmds')}>Comandos</SubTabBtn>
      </div>
      <div style={{
        flex: 1, minHeight: 0, position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}>
        {subTab === 'shell' && (
          <RealTerminal workspace={bubble.workspace} bubbleId={bubble.id} />
        )}
        {subTab === 'agent' && <AgentBashLog bubble={bubble}/>}
        {subTab === 'cmds' && <SimulatedTerminal bubble={bubble}/>}
      </div>
    </div>
  );
}

function SubTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 8, border: 0, cursor: 'pointer',
        background: active ? t.bg3 : 'transparent',
        color: active ? t.accent : t.text2,
        fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
        transition: 'background 140ms, color 140ms',
      }}>{children}</button>
  );
}

function AgentBashLog({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const calls = bubble.messages.flatMap((m) => (m.toolCalls ?? []).filter((tc) => tc.name === 'Bash'));
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [calls.length]);
  if (calls.length === 0) {
    return (
      <div style={{
        padding: 24, color: t.text3, fontSize: 12.5,
        fontFamily: t.fontSans,
      }}>
        El agente no ha ejecutado comandos de Bash todavía en esta conversación.
      </div>
    );
  }
  return (
    <div ref={scrollRef} style={{
      height: '100%', overflow: 'auto', padding: '14px 20px',
      fontFamily: t.fontMono, fontSize: 12.5, lineHeight: 1.55,
      background: t.bg0,
    }}>
      {calls.map((tc) => {
        const cmd = typeof tc.input.command === 'string' ? tc.input.command : '';
        const desc = typeof tc.input.description === 'string' ? tc.input.description : '';
        const out = tc.output ?? '';
        const statusColor =
          tc.status === 'success' ? t.ok :
          tc.status === 'error' ? t.err :
          tc.status === 'denied' ? t.text3 :
          t.accent;
        return (
          <div key={tc.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: statusColor,
                animation: tc.status === 'running' ? 'eco-shimmer 0.9s ease-in-out infinite' : 'none',
              }}/>
              <span style={{ color: t.accent }}>$</span>
              <span style={{ color: t.text0, whiteSpace: 'pre-wrap' }}>{cmd}</span>
            </div>
            {desc && <div style={{ color: t.text3, fontSize: 11, marginLeft: 14 }}>{desc}</div>}
            {out && (
              <pre style={{
                margin: '4px 0 0 14px', padding: 0,
                color: t.text1, whiteSpace: 'pre-wrap',
                fontFamily: 'inherit', fontSize: 'inherit',
              }}>{out}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SimulatedTerminal({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const tr = useT();
  const [lines, setLines] = useState<TermLine[]>(() => [
    { kind: 'system', text: tr('detail.term.welcome_workspace', { ws: bubble.workspace || tr('detail.term.welcome_workspace_none') }) },
    { kind: 'system', text: tr('detail.term.welcome_session', { title: bubble.title }) },
  ]);
  const [cwd, setCwd] = useState(bubble.workspace || '');
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    if (bubble.workspace && !cwd) setCwd(bubble.workspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubble.workspace]);

  const cwdLabel = useMemo(() => {
    if (!bubble.workspace) return cwd;
    if (cwd === bubble.workspace) return '.';
    if (cwd.startsWith(bubble.workspace + '/')) return cwd.slice(bubble.workspace.length + 1);
    return cwd;
  }, [cwd, bubble.workspace]);

  async function exec(rawCmd: string) {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;

    // history
    setHistory((h) => [...h, trimmed].slice(-100));
    setHistoryIdx(-1);

    // builtins
    if (trimmed === 'clear' || trimmed === 'cls') {
      setLines([]);
      return;
    }
    if (trimmed === 'help') {
      pushLines([
        { kind: 'prompt', cwd: cwdLabel, command: trimmed },
        { kind: 'stdout', text: tr('detail.term.help_lines') },
      ]);
      return;
    }
    if (trimmed === 'pwd') {
      pushLines([
        { kind: 'prompt', cwd: cwdLabel, command: trimmed },
        { kind: 'stdout', text: cwd },
      ]);
      return;
    }
    if (trimmed.startsWith('cd ') || trimmed === 'cd') {
      const target = trimmed === 'cd' ? bubble.workspace : trimmed.slice(3).trim();
      if (!target) return;
      const newCwd = resolveLikePosix(cwd, target);
      if (!bubble.workspace || (newCwd !== bubble.workspace && !newCwd.startsWith(bubble.workspace + '/'))) {
        pushLines([
          { kind: 'prompt', cwd: cwdLabel, command: trimmed },
          { kind: 'stderr', text: tr('detail.term.cd_outside', { target }) },
        ]);
        return;
      }
      setCwd(newCwd);
      pushLines([{ kind: 'prompt', cwd: cwdLabel, command: trimmed }]);
      return;
    }

    pushLines([{ kind: 'prompt', cwd: cwdLabel, command: trimmed }]);
    setBusy(true);
    try {
      const res = await apiFetch('/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed, cwd, workspace: bubble.workspace }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushLines([{ kind: 'stderr', text: translateBackendError(data, `HTTP ${res.status}`) }]);
        return;
      }
      const result = data as { stdout: string; stderr: string; exitCode: number | null; truncated: boolean; durationMs: number };
      if (result.stdout) pushLines([{ kind: 'stdout', text: result.stdout.replace(/\n$/, '') }]);
      if (result.stderr) pushLines([{ kind: 'stderr', text: result.stderr.replace(/\n$/, '') }]);
      const meta: string[] = [];
      if (result.exitCode !== 0 && result.exitCode !== null) meta.push(tr('detail.term.exit_code', { code: result.exitCode }));
      if (result.truncated) meta.push(tr('detail.term.truncated'));
      meta.push(`${result.durationMs}ms`);
      pushLines([{ kind: 'meta', text: meta.join(' · ') }]);
    } catch (e) {
      pushLines([{ kind: 'stderr', text: e instanceof Error ? e.message : 'Error' }]);
    } finally {
      setBusy(false);
    }
  }

  function pushLines(more: TermLine[]) {
    setLines((prev) => [...prev, ...more]);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !busy) {
      e.preventDefault();
      const v = command;
      setCommand('');
      void exec(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setCommand(history[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const next = historyIdx + 1;
      if (next >= history.length) {
        setHistoryIdx(-1);
        setCommand('');
      } else {
        setHistoryIdx(next);
        setCommand(history[next] ?? '');
      }
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setLines([]);
    }
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: t.bg0,
    }}>
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        style={{
          flex: 1, overflow: 'auto', padding: '20px 24px',
          fontFamily: t.fontMono, fontSize: 12.5, lineHeight: 1.65,
          cursor: 'text',
        }}>
        {lines.map((l, i) => <TermLineRow key={i} line={l}/>)}
        {busy && (
          <div style={{ color: t.accent, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: t.accent,
              animation: 'eco-shimmer 0.9s ease-in-out infinite',
            }}/>
            {tr('detail.term.executing')}
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          const v = command; setCommand('');
          void exec(v);
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 24px', borderTop: `1px solid ${t.glassBorder}`,
          background: t.bg1,
          fontFamily: t.fontMono, fontSize: 13,
        }}>
        <span style={{ color: t.accent, flexShrink: 0 }}>{cwdLabel} ›</span>
        <input
          ref={inputRef}
          autoFocus
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
          placeholder={busy ? tr('detail.term.executing') : tr('detail.term.command_placeholder')}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 'none',
            fontFamily: 'inherit', fontSize: 'inherit', color: t.text0,
            padding: '4px 0', caretColor: t.accent,
          }}/>
      </form>
    </div>
  );
}

function TermLineRow({ line }: { line: TermLine }) {
  const t = useTokens();
  if (line.kind === 'prompt') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <span style={{ color: t.accent }}>{line.cwd} ›</span>
        <span style={{ color: t.text0 }}>{line.command}</span>
      </div>
    );
  }
  if (line.kind === 'stderr') {
    return <div style={{ color: t.err, whiteSpace: 'pre-wrap' }}>{line.text}</div>;
  }
  if (line.kind === 'meta') {
    return <div style={{ color: t.text3, fontSize: 11, marginBottom: 6 }}>{line.text}</div>;
  }
  if (line.kind === 'system') {
    return <div style={{ color: t.text3, whiteSpace: 'pre-wrap' }}>{line.text}</div>;
  }
  return <div style={{ color: t.text1, whiteSpace: 'pre-wrap' }}>{line.text || ' '}</div>;
}

function resolveLikePosix(cwd: string, target: string): string {
  if (target.startsWith('/')) return normalizePosixPath(target);
  return normalizePosixPath(cwd + '/' + target);
}

function normalizePosixPath(p: string): string {
  const parts = p.split('/');
  const out: string[] = [];
  for (const s of parts) {
    if (s === '' || s === '.') continue;
    if (s === '..') out.pop();
    else out.push(s);
  }
  return '/' + out.join('/');
}

function FilesPanel({ files, workspace, bubbleId }: { files: FileChange[]; workspace: string; bubbleId: string }) {
  const t = useTokens();
  const tr = useT();
  const [diffPath, setDiffPath] = useState<string | null>(null);
  if (files.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32, color: t.text2, fontSize: 13,
      }}>
        {tr('detail.files.empty')}
      </div>
    );
  }
  return (
    <>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <SectionLabel count={files.length}>{tr('detail.files.modified')}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map((f, i) => (
            <Glass key={i} radius={12} hover style={{
              padding: 14, display: 'flex', alignItems: 'center', gap: 12,
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
                  <Pill color={f.change === 'created' ? t.ok : t.accent}>{f.change === 'created' ? tr('detail.files.created') : tr('detail.files.modified_one')}</Pill>
                </div>
              </div>
              <Btn kind="secondary" size="sm" icon={IconDiff} onClick={() => setDiffPath(f.path)}>{tr('files.diff_btn')}</Btn>
            </Glass>
          ))}
        </div>
      </div>
      <DiffViewer
        open={!!diffPath}
        path={diffPath}
        workspace={workspace}
        bubbleId={bubbleId}
        onClose={() => setDiffPath(null)}
      />
    </>
  );
}

function PlanPanel({ bubble }: { bubble: Bubble }) {
  const t = useTokens();
  const tr = useT();
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
        {tr('detail.plan.empty')}
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: t.text0, letterSpacing: -0.2 }}>
          {tr('detail.plan.title')}
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: t.text2 }}>
          {tr('detail.plan.summary', { n: steps.length, done: steps.filter((s) => s.state === 'done').length })}
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

function CommitWithAI({ bubbleId, workspace }: { bubbleId: string; workspace: string }) {
  const t = useTokens();
  type Phase = 'idle' | 'suggesting' | 'preview' | 'committing' | 'done' | 'error';
  const [phase, setPhase] = useState<Phase>('idle');
  const [extra, setExtra] = useState('');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<string | null>(null);

  async function suggest() {
    setErr(null); setCommitResult(null); setPhase('suggesting');
    try {
      const r = await apiFetch('/git/commit-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, context: extra.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) { setMessage(d.message ?? ''); setPhase('preview'); }
      else { setErr(d.error || 'No se pudo generar'); setPhase('error'); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error'); setPhase('error');
    }
  }

  async function commit() {
    if (!message.trim()) return;
    setErr(null); setPhase('committing');
    try {
      const r = await apiFetch('/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, message }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setCommitResult(d.message ?? 'Commit creado');
        setPhase('done');
        setMessage(''); setExtra('');
      } else {
        setErr(d.error || 'Commit falló'); setPhase('error');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error'); setPhase('error');
    }
  }

  function reset() {
    setPhase('idle'); setMessage(''); setExtra(''); setErr(null); setCommitResult(null);
  }

  return (
    <Glass radius={10} style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: t.accentFaint, color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IconBolt size={11}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500, color: t.text0 }}>Commit con AI</div>
          <div style={{ fontSize: 10, color: t.text3, marginTop: 0 }}>
            Analiza el diff y propone mensaje
          </div>
        </div>
      </div>

      {phase === 'idle' || phase === 'error' || phase === 'done' ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {phase === 'done' && commitResult && (
            <div style={{
              padding: '6px 8px', borderRadius: 6,
              background: `color-mix(in oklch, ${t.ok} 12%, transparent)`,
              color: t.ok, fontFamily: t.fontMono, fontSize: 10.5,
              whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto',
            }}>{commitResult}</div>
          )}
          {phase === 'error' && err && (
            <div style={{
              padding: '6px 8px', borderRadius: 6,
              background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
              color: t.err, fontFamily: t.fontMono, fontSize: 10.5,
              whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto',
            }}>{err}</div>
          )}
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Contexto opcional (ej: fix login bug)"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              borderRadius: 6, padding: '5px 8px',
              fontFamily: t.fontSans, fontSize: 11, color: t.text0,
              outline: 'none',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void suggest(); }}
          />
          <button
            type="button"
            onClick={() => void suggest()}
            style={{
              height: 26, padding: '0 8px', border: 0, borderRadius: 6,
              background: t.accentDim, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}>
            Generar mensaje
          </button>
        </div>
      ) : phase === 'suggesting' ? (
        <div style={{ marginTop: 8, padding: '6px 8px', fontSize: 11, color: t.text2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: t.accent,
            animation: 'eco-shimmer 0.9s ease-in-out infinite',
          }}/>
          Analizando diff…
        </div>
      ) : (
        // Preview / committing
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            disabled={phase === 'committing'}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              borderRadius: 6, padding: '6px 8px',
              fontFamily: t.fontMono, fontSize: 11, color: t.text0,
              outline: 'none', resize: 'vertical', minHeight: 80,
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={reset}
              disabled={phase === 'committing'}
              style={{
                flex: 1, height: 26, border: 0, borderRadius: 6,
                background: t.bg2, color: t.text1,
                fontFamily: t.fontSans, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void suggest()}
              disabled={phase === 'committing'}
              style={{
                flex: 1, height: 26, border: 0, borderRadius: 6,
                background: t.bg3, color: t.text1,
                fontFamily: t.fontSans, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}>
              Regenerar
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={phase === 'committing' || !message.trim()}
              style={{
                flex: 1.4, height: 26, border: 0, borderRadius: 6,
                background: t.accent, color: t.accentOn,
                fontFamily: t.fontSans, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                opacity: phase === 'committing' || !message.trim() ? 0.6 : 1,
              }}>
              {phase === 'committing' ? 'Commiteando…' : 'Hacer commit'}
            </button>
          </div>
        </div>
      )}
    </Glass>
  );
}

function AgentSidebar({ bubble }: { bubble: Bubble; onSend: (text: string) => void }) {
  const t = useTokens();
  const tr = useT();
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
        <SectionLabel>{tr('detail.sidebar.stats')}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatBox label={tr('detail.stat.time_active')} value={`${min}m`}/>
          <StatBox label={tr('detail.stat.messages')} value={String(bubble.messages.length)}/>
          <StatBox label={tr('detail.stat.tool_calls')} value={String(toolCallCount)}/>
          <StatBox label={tr('detail.stat.state')} value={STATE_LABELS_I18N[(bubble.status as AgentState) || 'idle']}/>
        </div>
      </div>

      <div>
        <SectionLabel>{tr('detail.sidebar.next')}</SectionLabel>
        <Glass radius={12} style={{ padding: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
            color: t.accent, fontSize: 11, fontWeight: 500,
          }}>
            <IconBolt size={12}/> {tr('detail.sidebar.suggestion')}
          </div>
          <div style={{ fontSize: 12.5, color: t.text0, lineHeight: 1.5 }}>
            {bubble.status === 'idle' ? tr('detail.suggestion.idle') :
              bubble.status === 'thinking' ? tr('detail.suggestion.thinking') :
                bubble.status === 'executing' ? tr('detail.suggestion.executing') :
                  tr('detail.suggestion.review')}
          </div>
        </Glass>
      </div>

      {bubble.workspace && (
        <div>
          <SectionLabel>Git</SectionLabel>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            position: 'relative',
          }}>
            <BranchPicker workspace={bubble.workspace} bubbleId={bubble.id}/>
            <CommitWithAI bubbleId={bubble.id} workspace={bubble.workspace}/>
          </div>
        </div>
      )}

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

function buildSkillPrompt(skill: SkillInfo): string {
  // Todo se invoca como slash command: /dev-up, /code-review, etc.
  // Claude Code resuelve el comando contra la SKILL.md / agente del workspace.
  return `/${skill.name}`;
}
