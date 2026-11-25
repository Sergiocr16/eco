import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { apiFetch } from '@/lib/api';
import { on as ecoOn } from '@/lib/eco-bus';
import { useT } from '@/hooks/useI18n';

// Tarjeta del panel lateral de una bubble: estado del agente, contexto usado
// y archivos tocados.

export type AgentState = 'working' | 'waiting_permission' | 'waiting_input' | 'idle' | 'offline' | 'archived';

type AgentStatus = {
  state: AgentState;
  pendingTools: string[];
  contextTokens: number | null;
};

// El transcript no dice qué ventana tiene la sesión: 200k salvo que el uso ya
// la supere, que solo es posible con la de 1M.
const CONTEXT_STANDARD = 200_000;
const CONTEXT_LARGE = 1_000_000;

const POLL_MS = 15_000;
// `pty_busy_change` llega antes de que el CLI termine de escribir el transcript.
const SETTLE_MS = 700;

// Estado real del agente: el backend cruza el PTY con el transcript de Claude
// Code (el mismo cálculo que usa el MCP en `get_bubble`).
function useAgentStatus(bubbleId: string): AgentStatus | null {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setStatus(null);
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await apiFetch(`/bubble/status?bubbleId=${encodeURIComponent(bubbleId)}&git=0&lines=1`);
        if (!r.ok || cancelled) return;
        const d = await r.json() as {
          state: AgentState;
          transcript: { pendingToolNames: string[]; contextTokens?: number | null } | null;
        };
        if (cancelled) return;
        setStatus({
          state: d.state,
          pendingTools: d.transcript?.pendingToolNames ?? [],
          contextTokens: d.transcript?.contextTokens ?? null,
        });
      } catch (e) {
        console.warn('[sidebar] /bubble/status', e);
      }
    };
    void load();
    const poll = setInterval(() => { void load(); }, POLL_MS);
    const off = ecoOn('eco:pty_busy_change', (d) => {
      if (d.bubbleId !== bubbleId) return;
      // Feedback inmediato de "trabajando"; el resto lo confirma el fetch.
      if (d.busy) setStatus((prev) => (prev ? { ...prev, state: 'working' } : prev));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, SETTLE_MS);
    });
    const onVisible = () => { void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [bubbleId]);
  return status;
}

export function AgentStateCard({ bubbleId, filesCount, onGoToTerminal, onGoToGit }: {
  bubbleId: string;
  filesCount: number;
  onGoToTerminal: () => void;
  onGoToGit: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const status = useAgentStatus(bubbleId);
  const color = !status ? t.text3
    : status.state === 'working' ? t.accent
    : status.state === 'waiting_permission' ? t.warn
    : status.state === 'waiting_input' ? t.ok
    : t.text3;
  const card = { padding: 12, borderRadius: 12, background: t.bg2 } as const;
  const plain = { border: 0, cursor: 'pointer', textAlign: 'left', color: t.text0, fontFamily: t.fontSans } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {status && (
        <button type="button" onClick={onGoToTerminal}
          style={{ ...plain, ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
              animation: status.state === 'working' ? 'eco-shimmer 1.4s ease-in-out infinite' : undefined,
            }}/>
            {tr(`detail.agent.state.${status.state}`)}
            {status.state === 'waiting_permission' && status.pendingTools.length > 0 && (
              <code style={{ fontFamily: t.fontMono, fontSize: 11, fontWeight: 400, color: t.text2 }}>
                {status.pendingTools.join(', ')}
              </code>
            )}
          </span>
          {status.contextTokens != null && <ContextMeter tokens={status.contextTokens}/>}
        </button>
      )}
      <button type="button" onClick={onGoToGit}
        style={{ ...plain, ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 11, color: t.text2 }}>
          {tr('detail.agent.files')}
        </span>
        <span style={{ fontFamily: t.fontMono, fontSize: 20, fontWeight: 600, lineHeight: 1, color: filesCount > 0 ? t.text0 : t.text3 }}>
          {filesCount}
        </span>
      </button>
    </div>
  );
}

const TICKS = 40;
const RING = 64;

// Anillo segmentado: cada marca es un 2.5% de la ventana y se enciende al
// llenarse; las del tramo final cambian de color para avisar que se acaba.
function ContextMeter({ tokens }: { tokens: number }) {
  const t = useTokens();
  const tr = useT();
  const limit = tokens > CONTEXT_STANDARD ? CONTEXT_LARGE : CONTEXT_STANDARD;
  const ratio = Math.min(1, tokens / limit);
  const pct = Math.round(ratio * 100);
  const lit = Math.max(1, Math.round(ratio * TICKS));
  const tickColor = (i: number) => (i >= TICKS * 0.85 ? t.err : i >= TICKS * 0.65 ? t.warn : t.accent);
  const head = tickColor(lit - 1);
  const c = RING / 2;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <span style={{ position: 'relative', width: RING, height: RING, flexShrink: 0 }}>
        <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} style={{ display: 'block' }}>
          {Array.from({ length: TICKS }, (_, i) => {
            const on = i < lit;
            return (
              <line key={i}
                x1={c} y1={3} x2={c} y2={on ? 11 : 9}
                stroke={on ? tickColor(i) : t.bg3}
                strokeWidth={2.2} strokeLinecap="round"
                transform={`rotate(${(i * 360) / TICKS} ${c} ${c})`}
              />
            );
          })}
        </svg>
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.fontMono, fontSize: 13, fontWeight: 600, color: head,
        }}>{pct}%</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: t.text2 }}>
          {tr('detail.agent.context')}
        </span>
        <span style={{ fontFamily: t.fontMono, fontSize: 13, fontWeight: 500, color: t.text0, whiteSpace: 'nowrap' }}>
          {Math.round(tokens / 1000)}k <span style={{ color: t.text3, fontWeight: 400 }}>/ {limit >= 1_000_000 ? '1M' : `${limit / 1000}k`}</span>
        </span>
        <span style={{ fontSize: 11, color: t.text3 }}>
          {tr('detail.agent.context_free', { n: Math.round((limit - tokens) / 1000) })}
        </span>
      </span>
    </span>
  );
}
