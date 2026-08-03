import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { currentIdToken } from '@/lib/firebase';
import { useTokens } from '@/design/theme';
import { useIsMobile, isMobileNow } from '@/hooks/useMediaQuery';
import { TerminalKeyBar } from './TerminalKeyBar';

// Debe coincidir con `AgentCli` en backend/src/pty-server.ts.
export type AgentCli = 'claude' | 'codex' | 'none';

// Tamaño de fuente del terminal. Global (no por burbuja) a propósito: así no
// hay que sumarlo a la limpieza de claves de useBubbles.removeBubble.
const FONT_SIZE_KEY = 'eco.term.fontsize';
const FONT_MIN = 8;
const FONT_MAX = 18;
// 326px de ancho útil con fuente 12.5 dan ~40 columnas, y los TUI de Claude y
// Codex asumen 80. Con 10 se llega a ~54, que sigue siendo poco pero hace la
// diferencia entre leerlo y no leerlo. En horizontal el default ya alcanza.
const FONT_DEFAULT_MOBILE = 10;
const FONT_DEFAULT_DESKTOP = 12.5;

function readFontSize(): number {
  const fallback = isMobileNow() ? FONT_DEFAULT_MOBILE : FONT_DEFAULT_DESKTOP;
  try {
    const raw = window.localStorage.getItem(FONT_SIZE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= FONT_MIN && n <= FONT_MAX) return n;
  } catch { /* noop */ }
  return fallback;
}

type Props = {
  workspace: string;
  // Identificador estable de la burbuja: permite que el PTY persista en el backend
  // si el usuario sale y vuelve a la conversación.
  bubbleId: string;
  // Cuando este key cambia, se reinicia el terminal (sirve para "Nuevo shell")
  resetKey?: number;
  // Identificador del terminal dentro de la burbuja. "main" (default) = el
  // terminal de Claude; "codex" = el de Codex. Cualquier otro string = un
  // shell extra plano.
  ptyId?: string;
  // Qué CLI auto-arranca el backend en este PTY. 'none' = shell pelado.
  agent?: AgentCli;
};

// TOKEN se resuelve por llamada (no por módulo) para que funcione tanto en
// dev (env de Vite) como en Electron empaquetado (preload IPC).

export function RealTerminal({ workspace, bubbleId, resetKey = 0, ptyId = 'main', agent = 'claude' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useTokens();
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'>('connecting');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [fontSize, setFontSizeState] = useState<number>(readFontSize);

  // Refs para que la barra de teclas y el stepper de fuente lleguen al term y
  // al socket sin re-crearlos: meter `fontSize` en las deps del efecto grande
  // reconectaría el PTY en cada toque de A+.
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sendInputRef = useRef<(data: string) => void>(() => { /* noop */ });
  const doResizeRef = useRef<() => void>(() => { /* noop */ });

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
      fontSize: readFontSize(),
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
    termRef.current = term;
    fitRef.current = fit;

    // Scroll táctil propio.
    //
    // xterm v6 no scrollea solo con el dedo: el `xterm-scroll-area` que le
    // daba altura al viewport desapareció (el scroll dejó de ser nativo) y el
    // servicio de touch que trae la librería es opt-in — su `addTarget` está
    // definido pero NUNCA se llama adentro del lib. Así que en táctil el
    // scrollback era sencillamente inalcanzable, y ningún CSS lo arreglaba.
    //
    // Lo resolvemos con `scrollLines()`, que sí es API pública: convertimos el
    // arrastre a líneas y le agregamos inercia para que se sienta como iOS.
    const cellHeight = () => Math.max(1, term.element
      ? (term.element.querySelector('.xterm-rows')?.firstElementChild as HTMLElement | null)?.offsetHeight || 0
      : 0) || Math.round(readFontSize() * 1.25);

    let touchY: number | null = null;
    let touchRest = 0;          // píxeles sobrantes que aún no llegan a una línea
    let lastMoveAt = 0;
    let velocity = 0;           // líneas por ms, para la inercia
    let inertia = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelAnimationFrame(inertia);
      touchY = e.touches[0]!.clientY;
      touchRest = 0;
      velocity = 0;
      lastMoveAt = e.timeStamp;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null || e.touches.length !== 1) return;
      const y = e.touches[0]!.clientY;
      const dy = touchY - y;
      touchY = y;
      // Arrastrar hacia arriba muestra contenido más nuevo, como en cualquier
      // lista: por eso el delta va con el signo del gesto, no invertido.
      const px = dy + touchRest;
      const lines = Math.trunc(px / cellHeight());
      touchRest = px - lines * cellHeight();
      if (lines !== 0) {
        term.scrollLines(lines);
        const dt = Math.max(1, e.timeStamp - lastMoveAt);
        velocity = lines / dt;
        lastMoveAt = e.timeStamp;
      }
      // Sin esto iOS se queda con el gesto y arrastra la página entera.
      e.preventDefault();
    };
    const onTouchEnd = () => {
      touchY = null;
      // Inercia: seguimos scrolleando con decaimiento hasta que se apaga.
      if (Math.abs(velocity) < 0.002) return;
      let v = velocity * 16;   // líneas por frame
      const step = () => {
        v *= 0.94;
        if (Math.abs(v) < 0.05) return;
        term.scrollLines(v > 0 ? Math.ceil(v) : Math.floor(v));
        inertia = requestAnimationFrame(step);
      };
      inertia = requestAnimationFrame(step);
    };

    // passive:false en touchmove porque hacemos preventDefault.
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });


    // Renderer WebGL: descarga el dibujado a la GPU. El renderer DOM por
    // defecto se atasca cuando el hilo principal está ocupado (renders de
    // React, animaciones, varias burbujas) → las teclas se encolan y se
    // vuelcan de golpe. WebGL elimina ese jank. Se carga DESPUÉS de open()
    // (necesita el canvas) y cae al DOM si WebGL no está disponible o si se
    // pierde el contexto de GPU (sleep/wake, cambio de display).
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => { try { webgl.dispose(); } catch { /* noop */ } });
      term.loadAddon(webgl);
    } catch { /* WebGL no disponible — fallback al renderer DOM */ }

    try { fit.fit(); } catch { /* noop */ }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const buildUrl = () => {
      const url = new URL(`${wsProto}//${window.location.host}/ws/pty`);
      if (workspace) url.searchParams.set('workspace', workspace);
      if (bubbleId) url.searchParams.set('bubble', bubbleId);
      if (ptyId) url.searchParams.set('pty', ptyId);
      url.searchParams.set('agent', agent);
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
      sendInputRef.current = sendInput;
    }

    const doResize = () => {
      try { fit.fit(); } catch { /* noop */ }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    doResizeRef.current = doResize;

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
      cancelAnimationFrame(inertia);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      try { ws?.close(1000, 'unmount'); } catch { /* noop */ }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, bubbleId, resetKey, ptyId, agent]);

  // Efecto aparte del grande: cambiar la fuente no debe recrear el terminal
  // ni reconectar el socket. El contenedor no cambia de tamaño, así que el
  // ResizeObserver no dispara y hay que reemitir el resize a mano.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    doResizeRef.current();
  }, [fontSize]);

  const setFontSize = (next: number) => {
    const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, next));
    setFontSizeState(clamped);
    try { window.localStorage.setItem(FONT_SIZE_KEY, String(clamped)); } catch { /* noop */ }
  };

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        ref={containerRef}
        // En iOS el teclado solo sube si el foco cae en el textarea oculto de
        // xterm, y acertarle con el dedo es casualidad. Un tap en cualquier
        // parte del terminal lo enfoca.
        onClick={() => { try { termRef.current?.focus(); } catch { /* noop */ } }}
        style={{
          flex: 1, minHeight: 0,
          padding: isMobile ? 6 : 10,
          // Mismo color que el background del Terminal — así no se ve un marco
          // de otro color alrededor cuando hay padding o cuando el shell aún
          // no se conectó.
          background: '#0c0e14',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      />
      {isMobile && (
        <TerminalKeyBar
          onKey={(seq) => {
            sendInputRef.current(seq);
            try { termRef.current?.focus(); } catch { /* noop */ }
          }}
          fontSize={fontSize}
          onFontSize={setFontSize}
        />
      )}
      {(status !== 'open') && (
        <div style={{
          position: 'absolute',
          fontFamily: t.fontMono,
          color: status === 'error' ? t.err : t.text3,
          pointerEvents: 'none',
          // En el teléfono un rótulo de 10.5px en la esquina es ilegible, y es
          // justo el que dice por qué el terminal no conectó.
          ...(isMobile ? {
            top: 10, left: 10, right: 10,
            padding: '8px 10px', borderRadius: 8,
            background: 'rgba(0,0,0,0.55)',
            border: `1px solid ${status === 'error' ? t.err : t.glassBorder}`,
            fontSize: 12.5, textAlign: 'center',
          } : {
            top: 8, right: 12, fontSize: 10.5,
          }),
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
