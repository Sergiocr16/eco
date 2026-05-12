import { useEffect } from 'react';
import { useTokens } from '@/design/theme';
import { Glass, Pill, StatusDot, AgentGlyph, bubbleLetter } from '@/design/primitives';
import { IconX, IconClock, IconCommand } from '@/design/icons';
import type { Bubble } from '@/lib/types';
import { stateColor, type AgentState } from '@/design/tokens';
import { COMMAND_HELP } from '@/lib/meta-commands';
import { useT, useI18n } from '@/hooks/useI18n';
import { translate } from '@/lib/i18n';

type Props = {
  open: boolean;
  view: 'status' | 'help' | null;
  bubbles: Bubble[];
  onClose: () => void;
  onSelect: (id: string) => void;
};

export function StatusOverlay({ open, view, bubbles, onClose, onSelect }: Props) {
  const t = useTokens();
  const tr = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '11vh 24px 24px',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 100%)', maxHeight: '76vh',
          background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
          borderRadius: 20, boxShadow: t.shadowLg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconCommand size={14}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text0, letterSpacing: -0.2 }}>
              {view === 'help' ? tr('status.help_title') : tr('status.title')}
            </div>
            <div style={{ fontSize: 11.5, color: t.text2, marginTop: 1 }}>
              {view === 'help'
                ? tr('status.help_hint')
                : tr('status.summary', {
                  total: bubbles.length,
                  p: bubbles.length === 1 ? '' : 's',
                  active: countActive(bubbles),
                  ap: countActive(bubbles) === 1 ? '' : 's',
                })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 0,
              background: 'transparent', color: t.text2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconX size={14}/>
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: '12px 14px 18px' }}>
          {view === 'help' ? <HelpList/> : <StatusList bubbles={bubbles} onSelect={onSelect}/>}
        </div>
      </div>
    </div>
  );
}

function countActive(bubbles: Bubble[]): number {
  return bubbles.filter((b) => ['running', 'thinking', 'executing', 'waiting'].includes(b.status as string)).length;
}

function StatusList({ bubbles, onSelect }: { bubbles: Bubble[]; onSelect: (id: string) => void }) {
  const t = useTokens();
  const tr = useT();
  if (bubbles.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: t.text2, fontSize: 13 }}>
        {tr('status.empty')}
      </div>
    );
  }
  const sorted = [...bubbles].sort((a, b) => {
    const aActive = ['running', 'thinking', 'executing', 'waiting'].includes(a.status as string) ? 0 : 1;
    const bActive = ['running', 'thinking', 'executing', 'waiting'].includes(b.status as string) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return b.updatedAt - a.updatedAt;
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sorted.map((b) => <StatusRow key={b.id} bubble={b} onSelect={() => onSelect(b.id)}/>)}
    </div>
  );
}

function StatusRow({ bubble, onSelect }: { bubble: Bubble; onSelect: () => void }) {
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
  const state = (bubble.status as AgentState) || 'idle';
  const sColor = stateColor(state, t);
  const minutesAgo = Math.max(1, Math.round((Date.now() - bubble.updatedAt) / 60000));
  const tStr = minutesAgo < 60 ? `${minutesAgo}m` : `${Math.round(minutesAgo / 60)}h`;
  const wsLabel = (bubble.workspace || '').split('/').filter(Boolean).slice(-2).join('/');
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', borderRadius: 12,
        background: t.bg2, border: `1px solid ${t.glassBorder}`,
        cursor: 'pointer', textAlign: 'left',
      }}>
      <AgentGlyph size={32} state={state} letter={bubbleLetter(bubble.title)} accent={bubble.accent}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: t.text0, letterSpacing: -0.1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{bubble.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <StatusDot color={sColor} pulse={state === 'running' || state === 'thinking'} size={6}/>
          <span style={{ fontSize: 11, color: sColor, fontWeight: 500 }}>
            {STATE_LABELS_I18N[state] || tr('state.idle')}
          </span>
          {wsLabel && (
            <>
              <span style={{ color: t.text3 }}>·</span>
              <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.text2 }}>{wsLabel}</span>
            </>
          )}
        </div>
      </div>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontFamily: t.fontMono, fontSize: 10.5, color: t.text3,
      }}>
        <IconClock size={10}/> {tStr}
      </span>
      <Pill color={t.text2}>{tr('status.msg_count', { n: bubble.messages.length })}</Pill>
    </button>
  );
}

function HelpList() {
  const t = useTokens();
  const { lang } = useI18n();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {COMMAND_HELP.map((c, i) => (
        <div key={i} style={{
          padding: '10px 12px', borderRadius: 10,
          background: i % 2 === 0 ? t.bg2 : 'transparent',
        }}>
          <div style={{
            fontFamily: t.fontMono, fontSize: 12.5, color: t.accent, fontWeight: 500,
            letterSpacing: -0.1,
          }}>{c.exampleKey ? translate(c.exampleKey, lang) : c.example}</div>
          <div style={{ fontSize: 11.5, color: t.text2, marginTop: 2 }}>
            {c.descKey ? translate(c.descKey, lang) : c.desc}
          </div>
        </div>
      ))}
    </div>
  );
}

export { Glass };
