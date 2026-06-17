import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { currentIdToken } from '@/lib/firebase';
import { useTokens } from '@/design/theme';

type Props = {
  workspace: string;
  // Identificador estable de la burbuja: permite que el PTY persista en el backend
  // si el usuario sale y vuelve a la conversación.
  bubbleId: string;
  // Cuando este key cambia, se reinicia el terminal (sirve para "Nuevo shell")
  resetKey?: number;
  // Identificador del terminal dentro de la burbuja. "main" (default) = el
  // terminal con auto-claude. Cualquier otro string = un shell extra plano.
  ptyId?: string;
  // Si false, el backend NO auto-arranca `claude` en el shell. Default true
  // para mantener el comportamiento del terminal principal.
  autoClaude?: boolean;
};

// TOKEN se resuelve por llamada (no por módulo) para que funcione tanto en
// dev (env de Vite) como en Electron empaquetado (preload IPC).

export function RealTerminal({ workspace, bubbleId, resetKey = 0, ptyId = 'main', autoClaude = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useTokens();
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'>('connecting');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // La terminal SIEMPRE es oscura — no la teñimos con el tema del shell
    // porque convencionalmente las terminales son negras y un fondo claro
    // arruina la legibilidad de los códigos ANSI de colores. Solo el cursor
    // y la selección heredan el accent para que se sienta parte de Eco.
    const TERMINAL_BG = '#0c0e14';        // negro sutil con micro-tinte azulado
    const TERMINAL_FG = '#e5e7eb';        // gris claro siempre legible
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 2000,
      allowTransparency: false,
      theme: {
        background: TERMINAL_BG,
        foreground: TERMINAL_FG,
        cursor: t.accent,
        cursorAccent: TERMINAL_BG,
        selectionBackground: `${t.accent}55`,
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    try { fit.fit(); } catch { /* noop */ }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const buildUrl = () => {
      const url = new URL(`${wsProto}//${window.location.host}/ws/pty`);
      if (workspace) url.searchParams.set('workspace', workspace);
      if (bubbleId) url.searchParams.set('bubble', bubbleId);
      if (ptyId) url.searchParams.set('pty', ptyId);
      if (!autoClaude) url.searchParams.set('noClaude', '1');
      url.searchParams.set('cols', String(term.cols));
      url.searchParams.set('rows', String(term.rows));
      return url.toString();
    };

    let ws: WebSocket | null = null;
    let pingTimer: number | null = null;
    let resizeObs: ResizeObserver | null = null;
    let reconnectTimer: number | null = null;
    let attempts = 0;
    let disposed = false;

    const disposeInputRef: { current: { dispose: () => void } | null } = { current: null };

    async function connect() {
      if (disposed) return;
      const idToken = await currentIdToken();
      if (disposed) return;
      if (!idToken) {
        setStatus('error');
        setErrMsg('Sesión no iniciada');
        return;
      }
      const protocols = [`eco.idtoken.${idToken}`];
      const urlStr = buildUrl();
      try {
        ws = new WebSocket(urlStr, protocols);
      } catch (e) {
        setStatus('error');
        setErrMsg(e instanceof Error ? e.message : 'No se pudo abrir el WebSocket');
        return;
      }
      setStatus((prev) => prev === 'open' ? 'open' : (attempts > 0 ? 'reconnecting' : 'connecting'));

      ws.onopen = () => {
        attempts = 0;
        setStatus('open');
        setErrMsg(null);
        // Keep-alive
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25_000);
        // Re-sync el tamaño actual al backend tras (re)conectar.
        try {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        } catch { /* noop */ }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'data') {
            term.write(msg.data);
          } else if (msg.type === 'exit') {
            term.write(`\r\n\x1b[2m[shell exited code=${msg.code ?? '?'}]\x1b[0m\r\n`);
            setStatus('closed');
          } else if (msg.type === 'ready') {
            // info inicial; ya estamos listos
          } else if (msg.type === 'error') {
            term.write(`\r\n\x1b[31m[error] ${msg.message}\x1b[0m\r\n`);
          }
        } catch { /* noop */ }
      };

      ws.onerror = () => {
        // Silenciamos onerror — el onclose se va a disparar inmediatamente
        // después y ahí manejamos la reconexión. No queremos parpadear el
        // mensaje "Error de conexión" antes de saber si vamos a reintentar.
      };

      ws.onclose = (ev) => {
        if (disposed) return;
        // Códigos "normales" = el server cerró limpio (1000/1001) o nosotros
        // lo cerramos. No reconectar.
        if (ev.code === 1000 || ev.code === 1001) {
          setStatus('closed');
          return;
        }
        // Reconexión silenciosa con backoff. Los primeros 2 intentos en
        // <1s NO muestran "error" — el user no debería ver código 1006
        // durante un reinicio rápido del backend. Después de 2 intentos
        // fallidos, mostramos el mensaje.
        attempts += 1;
        const delay = Math.min(8000, 250 * Math.pow(2, attempts - 1));
        if (attempts > 2) {
          setStatus('error');
          setErrMsg(`Reconectando… (intento ${attempts})`);
        } else {
          setStatus('reconnecting');
        }
        if (pingTimer) { window.clearInterval(pingTimer); pingTimer = null; }
        reconnectTimer = window.setTimeout(connect, delay);
      };

      // Input wiring: lo reconfiguramos en cada (re)connect porque el ws cambia.
      disposeInputRef.current?.dispose();
      const sendInput = (data: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      };
      disposeInputRef.current = term.onData(sendInput);
    }

    const doResize = () => {
      try { fit.fit(); } catch { /* noop */ }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    resizeObs = new ResizeObserver(() => doResize());
    resizeObs.observe(container);

    // Recuperación tras sleep/wake: los timers se pausan al dormir; si un tick
    // cae mucho después de lo esperado, la máquina durmió → el WS suele quedar
    // zombie (OPEN pero muerto). Forzamos cierre + reconexión.
    let lastTick = Date.now();
    const wakeTimer = window.setInterval(() => {
      const now = Date.now();
      const slept = now - lastTick > 10_000;
      lastTick = now;
      if (slept && !disposed) {
        if (reconnectTimer) { window.clearTimeout(reconnectTimer); reconnectTimer = null; }
        attempts = 0;
        try { ws?.close(); } catch { /* noop */ }
        ws = null;
        void connect();
      }
    }, 3000);

    connect();

    return () => {
      disposed = true;
      disposeInputRef.current?.dispose();
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(wakeTimer);
      resizeObs?.disconnect();
      try { ws?.close(1000, 'unmount'); } catch { /* noop */ }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, bubbleId, resetKey, ptyId, autoClaude]);

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        ref={containerRef}
        style={{
          flex: 1, minHeight: 0,
          padding: 10,
          // Mismo color que el background del Terminal — así no se ve un marco
          // de otro color alrededor cuando hay padding o cuando el shell aún
          // no se conectó.
          background: '#0c0e14',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      />
      {(status !== 'open') && (
        <div style={{
          position: 'absolute', top: 8, right: 12,
          fontFamily: t.fontMono, fontSize: 10.5,
          color: status === 'error' ? t.err : t.text3,
          pointerEvents: 'none',
        }}>
          {status === 'connecting' && 'conectando…'}
          {status === 'reconnecting' && 'reconectando…'}
          {status === 'closed' && 'cerrado'}
          {status === 'error' && (errMsg ?? 'error')}
        </div>
      )}
    </div>
  );
}
