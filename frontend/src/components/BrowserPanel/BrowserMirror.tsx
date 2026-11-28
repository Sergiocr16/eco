// Espejo del navegador que el agente maneja en la app de escritorio. Los
// clientes sin <webview> (web / iPad por la tailnet) no tienen esa pestaña: ven
// sus frames por `/ws/browser-view` y le mandan su mouse y teclado, así el
// usuario y el agente miran (y tocan) el mismo navegador.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Keyboard } from 'lucide-react';
import { useTokens } from '@/design/theme';
import { IconX, IconMinus, IconPlus } from '@/design/icons';
import { cx } from '@/design/primitives';
import { isPhoneNow } from '@/hooks/useMediaQuery';
import { useT } from '@/hooks/useI18n';
import { currentIdToken } from '@/lib/firebase';

type MirrorTab = { tabId: string; active: boolean; url: string; title: string; loading: boolean; zoom?: number };
type ServerMsg =
  | { type: 'frame'; tabId: string | null; data: string; w: number; h: number }
  | { type: 'state'; desktop: boolean; tabs: MirrorTab[] }
  | { type: 'heartbeat' };
type Status = 'connecting' | 'live' | 'waiting' | 'no_desktop';

const RECONNECT_MS = 2000;
const FIRST_FRAME_MS = 2500;
const MOVE_MIN_MS = 40;
const DRAG_START_PX = 8;
const SPECIAL_KEYS = new Set([
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
]);

function tabLabel(tab: MirrorTab, fallback: string): string {
  if (tab.title) return tab.title;
  try { return new URL(tab.url).host || fallback; } catch { return fallback; }
}

export function BrowserMirror({ bubbleId, onExit }: { bubbleId: string; onExit: () => void }) {
  const t = useTokens();
  const tr = useT();
  const [status, setStatus] = useState<Status>('connecting');
  const [tabs, setTabs] = useState<MirrorTab[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const keysRef = useRef<HTMLInputElement | null>(null);
  const sockRef = useRef<WebSocket | null>(null);
  const frameSize = useRef({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  // The frame is drawn at the largest size that fits the stage, up or down:
  // max-width/max-height alone only shrank it, so a small desktop webview
  // showed as a thumbnail in a wide panel.
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const refit = useCallback(() => {
    const stage = stageRef.current;
    const { w, h } = frameSize.current;
    if (!stage || !w || !h) return;
    const s = Math.min(stage.clientWidth / w, stage.clientHeight / h);
    if (!Number.isFinite(s) || s <= 0) return;
    const next = { w: Math.floor(w * s), h: Math.floor(h * s) };
    setFit((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
  }, []);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(refit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [refit]);
  const gotFrame = useRef(false);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = sockRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);
  const sendInput = useCallback((event: Record<string, unknown>) => send({ type: 'input', event }), [send]);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let waitTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      const idToken = await currentIdToken();
      if (disposed) return;
      if (!idToken) { retry = setTimeout(connect, RECONNECT_MS); return; }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws/browser-view?bubble=${encodeURIComponent(bubbleId)}`;
      let ws: WebSocket;
      try { ws = new WebSocket(url, [`eco.idtoken.${idToken}`]); } catch { retry = setTimeout(connect, RECONNECT_MS); return; }
      sockRef.current = ws;
      gotFrame.current = false;
      ws.onopen = () => {
        if (sockRef.current !== ws) return;
        setStatus('connecting');
        waitTimer = setTimeout(() => { if (!gotFrame.current) setStatus((s) => (s === 'no_desktop' ? s : 'waiting')); }, FIRST_FRAME_MS);
      };
      ws.onmessage = (ev) => {
        if (sockRef.current !== ws) return;
        let msg: ServerMsg;
        try { msg = JSON.parse(String(ev.data)) as ServerMsg; } catch { return; }
        if (msg.type === 'frame') {
          const resized = frameSize.current.w !== msg.w || frameSize.current.h !== msg.h;
          frameSize.current = { w: msg.w, h: msg.h };
          if (resized) refit();
          gotFrame.current = true;
          if (imgRef.current) imgRef.current.src = `data:image/jpeg;base64,${msg.data}`;
          setStatus('live');
        } else if (msg.type === 'state') {
          setTabs(msg.tabs);
          if (!msg.desktop) setStatus('no_desktop');
          else if (msg.tabs.length === 0) { gotFrame.current = false; setStatus('waiting'); }
        }
      };
      ws.onclose = () => {
        if (sockRef.current !== ws) return;
        sockRef.current = null;
        clearTimeout(waitTimer);
        if (!disposed) { setStatus('connecting'); retry = setTimeout(connect, RECONNECT_MS); }
      };
    };
    void connect();

    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(waitTimer);
      const ws = sockRef.current;
      sockRef.current = null;
      if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch { /* noop */ } }
    };
  }, [bubbleId, refit]);

  // Posición normalizada dentro de la imagen (0..1). El <img> mide lo mismo
  // que el frame dibujado, así que su rect es el de la página.
  const norm = (clientX: number, clientY: number) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return { nx: (clientX - r.left) / r.width, ny: (clientY - r.top) / r.height, scale: frameSize.current.w / r.width };
  };

  const drag = useRef<{ x: number; y: number; scrolling: boolean; touch: boolean } | null>(null);
  const lastMove = useRef(0);

  const onPointerDown = (e: ReactPointerEvent<HTMLImageElement>) => {
    const p = norm(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    const touch = e.pointerType === 'touch';
    drag.current = { x: e.clientX, y: e.clientY, scrolling: false, touch };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    if (touch) return;
    keysRef.current?.focus({ preventScroll: true });
    sendInput({ t: 'mouse', a: 'down', nx: p.nx, ny: p.ny });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLImageElement>) => {
    const p = norm(e.clientX, e.clientY);
    if (!p) return;
    const d = drag.current;
    if (d?.touch) {
      // Un dedo arrastrando = scroll de la página.
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.scrolling && Math.hypot(dx, dy) < DRAG_START_PX) return;
      d.scrolling = true;
      d.x = e.clientX;
      d.y = e.clientY;
      sendInput({ t: 'wheel', nx: p.nx, ny: p.ny, dx: -dx * p.scale, dy: -dy * p.scale });
      return;
    }
    const now = Date.now();
    if (now - lastMove.current < MOVE_MIN_MS) return;
    lastMove.current = now;
    sendInput({ t: 'mouse', a: 'move', nx: p.nx, ny: p.ny, pressed: !!d });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLImageElement>) => {
    const d = drag.current;
    drag.current = null;
    const p = norm(e.clientX, e.clientY);
    if (!d || !p) return;
    if (d.touch) { if (!d.scrolling) sendInput({ t: 'click', nx: p.nx, ny: p.ny }); return; }
    sendInput({ t: 'mouse', a: 'up', nx: p.nx, ny: p.ny });
  };

  // `wheel` de React es pasivo: sin listener nativo no se puede frenar el
  // scroll del panel.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onWheel = (e: WheelEvent) => {
      const p = norm(e.clientX, e.clientY);
      if (!p) return;
      e.preventDefault();
      sendInput({ t: 'wheel', nx: p.nx, ny: p.ny, dx: e.deltaX * p.scale, dy: e.deltaY * p.scale });
    };
    img.addEventListener('wheel', onWheel, { passive: false });
    return () => img.removeEventListener('wheel', onWheel);
  }, [sendInput]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const shortcut = (e.metaKey || e.ctrlKey) && e.key.length === 1;
    if (!SPECIAL_KEYS.has(e.key) && !shortcut) return;
    e.preventDefault();
    const modifiers = [e.altKey && 'Alt', e.ctrlKey && 'Control', e.metaKey && 'Meta', e.shiftKey && 'Shift'].filter(Boolean);
    sendInput({ t: 'key', key: e.key, modifiers });
  };

  const flushText = () => {
    const el = keysRef.current;
    if (!el || !el.value) return;
    sendInput({ t: 'text', text: el.value });
    el.value = '';
  };

  const overlayText = status === 'no_desktop' ? tr('browser.mirror.no_desktop')
    : status === 'waiting' ? tr('browser.mirror.waiting')
    : status === 'connecting' ? tr('browser.mirror.connecting') : '';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', background: isPhoneNow() ? t.sheet : t.card }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: isPhoneNow() ? '6px 8px' : '12px 14px 8px',
      }}>
        <span className={cx('eco-dot eco-dot--lg', status === 'live' ? 'eco-dot--ok' : 'eco-dot--warn')}/>
        <span className="eco-label eco-truncate" style={{ fontSize: 12.5, flex: '0 1 auto', minWidth: 0 }}>{tr('browser.mirror.title')}</span>
        <div className="eco-noscrollbar" style={{ display: 'flex', gap: 4, flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {tabs.length > 1 && tabs.map((tab) => (
            <button key={tab.tabId} type="button" title={tab.url}
              className={cx('eco-subtab', tab.active && 'is-on')}
              style={{ display: 'block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}
              onClick={() => send({ type: 'select', tabId: tab.tabId })}>
              {tabLabel(tab, tr('browser.mirror.untitled'))}
            </button>
          ))}
        </div>
        <div className="eco-stepper" style={{ flexShrink: 0 }}>
          <button type="button" onClick={() => sendInput({ t: 'zoom', dir: 'out' })}
            title={tr('browser.zoom_out')} aria-label={tr('browser.zoom_out')}
            className="eco-iconbtn" style={STEP_BTN}><IconMinus size={13}/></button>
          <button type="button" onClick={() => sendInput({ t: 'zoom', dir: 'reset' })}
            title={tr('browser.zoom_reset')} aria-label={tr('browser.zoom_reset')}
            className="eco-mono"
            style={{ minWidth: 44, padding: '0 2px', border: 0, background: 'transparent', color: t.text0, cursor: 'pointer', fontSize: 12.5 }}>
            {Math.round((tabs.find((tab) => tab.active)?.zoom ?? 1) * 100)}%
          </button>
          <button type="button" onClick={() => sendInput({ t: 'zoom', dir: 'in' })}
            title={tr('browser.zoom_in')} aria-label={tr('browser.zoom_in')}
            className="eco-iconbtn" style={STEP_BTN}><IconPlus size={13}/></button>
        </div>
        <button type="button" onClick={() => keysRef.current?.focus()}
          title={tr('browser.mirror.keyboard')} aria-label={tr('browser.mirror.keyboard')}
          className="eco-iconbtn eco-iconbtn--soft" style={{ flexShrink: 0 }}><Keyboard size={15}/></button>
        <button type="button" onClick={onExit} title={tr('browser.mirror.exit')} aria-label={tr('browser.mirror.exit')}
          className={isPhoneNow() ? 'eco-iconbtn eco-iconbtn--soft' : 'eco-btn eco-btn--sm eco-btn--raised'} style={{ flexShrink: 0 }}>
          <IconX size={13}/>{!isPhoneNow() && tr('browser.mirror.exit')}
        </button>
        {/* Recibe el teclado (físico o el del iPad). 16px: iOS hace zoom con menos. */}
        <input
          ref={keysRef}
          aria-label={tr('browser.mirror.keyboard')}
          autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
          onKeyDown={onKeyDown}
          onInput={flushText}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1, fontSize: 16, border: 0, padding: 0, pointerEvents: 'none' }}
        />
      </div>
      <div ref={stageRef} style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.raised, overflow: 'hidden', ...(isPhoneNow() ? null : { margin: '0 10px 10px', borderRadius: 14 }) }}>
        <img
          ref={imgRef}
          alt=""
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; }}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            ...(fit ? { width: fit.w, height: fit.h } : { maxWidth: '100%', maxHeight: '100%' }),
            flexShrink: 0, display: status === 'live' ? 'block' : 'none',
            touchAction: 'none', userSelect: 'none', background: 'white',
          }}
        />
        {status !== 'live' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24, textAlign: 'center', maxWidth: 380 }}>
            <div className="eco-muted">{overlayText}</div>
            {status === 'waiting' && (
              <>
                <div className="eco-sub">{tr('browser.mirror.waiting_desc')}</div>
                <button type="button" onClick={() => send({ type: 'show' })} className="eco-btn eco-btn--solid">
                  {tr('browser.mirror.show')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const STEP_BTN = { width: 28, height: 28 } as const;
