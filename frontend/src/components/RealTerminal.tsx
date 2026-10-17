import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { currentIdToken, hasSignedInUser } from '@/lib/firebase';
import { useT } from '@/hooks/useI18n';
import { useTokens } from '@/design/theme';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { TerminalKeyBar } from './TerminalKeyBar';
import { getTermPrefs, setTermFontSize, termFontStack, useTermPrefs } from '@/lib/terminal-prefs';
import { cssZoom, useCssZoom } from '@/lib/ui-zoom';

// Debe coincidir con `AgentCli` en backend/src/pty-server.ts.
export type AgentCli = 'claude' | 'codex' | 'none';


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
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const scrollThumbRef = useRef<HTMLDivElement>(null);
  const t = useTokens();
  const isMobile = useIsMobile();
  const tr = useT();
  // El efecto del socket no se re-corre al cambiar de idioma; lee la traducción vigente vía ref.
  const trRef = useRef(tr);
  trRef.current = tr;
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'>('connecting');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // Tamaño y tipografía viven en lib/terminal-prefs.ts (Settings → Apariencia
  // y la barra A−/A+ escriben ahí). En web el contenedor de xterm se
  // contra-zoomea (ver el style de abajo), así que para que el terminal
  // acompañe el zoom de la UI la fuente se escala a mano.
  const prefs = useTermPrefs();
  const cssZ = useCssZoom();
  const fontPx = prefs.fontSize * cssZ;
  const fontStack = termFontStack(prefs.fontFamilyId);

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
      fontFamily: termFontStack(),
      fontSize: getTermPrefs().fontSize * cssZoom(),
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
    // Alto real de una fila. Se mide como alto del área de pantalla dividido
    // filas, que funciona con CUALQUIER renderer — medir `.xterm-rows` no
    // sirve porque con WebGL las filas se dibujan en un canvas y ese elemento
    // queda sin altura. Si eso pasa el arrastre se traduce a una línea por
    // píxel y el terminal salta al extremo del scrollback con cualquier gesto.
    const cellHeight = () => {
      const screen = term.element?.querySelector('.xterm-screen') as HTMLElement | null;
      const measured = screen && term.rows > 0 ? screen.clientHeight / term.rows : 0;
      if (measured > 1) return measured;
      return Math.max(8, Math.round(getTermPrefs().fontSize * cssZoom() * 1.25));
    };

    // Indicador de scroll. Como el scroll no es nativo (ver arriba), tampoco
    // hay barra del navegador: la dibujamos a partir del buffer. Se actualiza
    // de forma imperativa —no por estado de React— porque corre en cada frame
    // del arrastre, y se desvanece sola como en iOS.
    //
    // Se muestra SOLO con gesto del usuario, no en term.onScroll: el auto
    // scroll de cada línea que escribe el agente la tendría parpadeando todo
    // el tiempo.
    let hideBarTimer: number | null = null;
    const updateScrollBar = () => {
      const track = scrollTrackRef.current;
      const thumb = scrollThumbRef.current;
      if (!track || !thumb) return;
      const buf = term.buffer.active;
      const total = buf.length;
      const visible = term.rows;
      if (total <= visible) { track.style.opacity = '0'; return; }
      const trackH = track.clientHeight;
      const thumbH = Math.max(24, Math.round(trackH * (visible / total)));
      const progress = Math.min(1, Math.max(0, buf.viewportY / (total - visible)));
      thumb.style.height = `${thumbH}px`;
      thumb.style.top = `${Math.round((trackH - thumbH) * progress)}px`;
      track.style.opacity = '1';
      if (hideBarTimer) window.clearTimeout(hideBarTimer);
      hideBarTimer = window.setTimeout(() => { track.style.opacity = '0'; }, 900);
    };

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
        updateScrollBar();
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
        updateScrollBar();
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
      // El backend aplica estas dims al reattachar, así que ya las "sabe".
      sentCols = term.cols;
      sentRows = term.rows;
      return url.toString();
    };

    // Últimas dimensiones que el backend conoce. Cada resize que le mandamos
    // es un SIGWINCH que hace redibujar a la TUI del agente, y ese redibujo
    // puede llevarse puesto el scrollback (un \x1b[3J lo borra). Los fits de
    // más abajo corren varias veces a propósito, así que solo avisamos cuando
    // las dimensiones cambiaron de verdad.
    let sentCols = 0;
    let sentRows = 0;

    let ws: WebSocket | null = null;
    let pingTimer: number | null = null;
    let resizeObs: ResizeObserver | null = null;
    let reconnectTimer: number | null = null;
    let attempts = 0;
    let disposed = false;
    let connecting = false;
    // Último frame recibido del server (incluye su `heartbeat` cada 20 s). Es
    // la única señal de vida que vale: los timers del renderer se estrangulan
    // en background y un salto entre ticks NO significa que el socket murió.
    let lastFrameAt = Date.now();

    const disposeInputRef: { current: { dispose: () => void } | null } = { current: null };

    // Neutraliza un socket antes de soltarlo: sus handlers no deben volver a
    // tocar `ws`, `attempts` ni programar reconexiones. Así era como cada
    // "wake" dejaba un socket huérfano abierto en el backend, enganchado a la
    // misma sesión PTY (output duplicado) y ocupando cupo hasta llenar el tope.
    const dropSocket = (s: WebSocket | null) => {
      if (!s) return;
      s.onopen = null; s.onmessage = null; s.onerror = null; s.onclose = null;
      try { s.close(1000, 'replaced'); } catch { /* noop */ }
    };

    const scheduleReconnect = (delay: number) => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => { reconnectTimer = null; void connect(); }, delay);
    };

    // Reconexión silenciosa con backoff. Los primeros 2 intentos en <1s NO
    // muestran "error" — el user no debería ver código 1006 durante un
    // reinicio rápido del backend. Después de 2 intentos, mostramos el mensaje.
    const failAndRetry = () => {
      attempts += 1;
      const delay = Math.min(8000, 250 * Math.pow(2, attempts - 1));
      if (attempts > 2) {
        setStatus('error');
        setErrMsg(trRef.current('term.conn.retrying', { n: attempts }));
      } else {
        setStatus('reconnecting');
      }
      scheduleReconnect(delay);
    };

    async function connect() {
      if (disposed || connecting) return;
      if (ws && ws.readyState <= WebSocket.OPEN) return;
      connecting = true;
      const idToken = await currentIdToken();
      connecting = false;
      if (disposed) return;
      if (ws && ws.readyState <= WebSocket.OPEN) return;
      if (!idToken) {
        // Sin red Firebase no puede renovar el token: no es "sin sesión", es
        // "todavía no". Reintentar con el mismo backoff.
        if (hasSignedInUser()) { failAndRetry(); return; }
        setStatus('error');
        setErrMsg(trRef.current('term.conn.no_session'));
        return;
      }
      const protocols = [`eco.idtoken.${idToken}`];
      const urlStr = buildUrl();
      let sock: WebSocket;
      try {
        sock = new WebSocket(urlStr, protocols);
      } catch (e) {
        setStatus('error');
        setErrMsg(e instanceof Error ? e.message : trRef.current('term.conn.open_failed'));
        return;
      }
      ws = sock;
      lastFrameAt = Date.now();
      setStatus((prev) => prev === 'open' ? 'open' : (attempts > 0 ? 'reconnecting' : 'connecting'));

      // Cada handler comprueba que su socket siga siendo el vigente.
      sock.onopen = () => {
        if (ws !== sock) return;
        attempts = 0;
        lastFrameAt = Date.now();
        setStatus('open');
        setErrMsg(null);
        // Keep-alive (el server responde `pong`, que cuenta como frame recibido).
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25_000);
        // Re-sync del tamaño SOLO si cambió desde que armamos la URL (los fits
        // diferidos pueden haber corrido mientras abría el socket). Reenviarlo
        // igual sería un SIGWINCH que borra el replay que el backend acaba de
        // mandarnos.
        try { doResize(); } catch { /* noop */ }
      };

      sock.onmessage = (ev) => {
        if (ws !== sock) return;
        lastFrameAt = Date.now();
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'data') {
            term.write(msg.data);
          } else if (msg.type === 'exit') {
            term.write(`\r\n\x1b[2m[shell exited code=${msg.code ?? '?'}]\x1b[0m\r\n`);
            setStatus('closed');
          } else if (msg.type === 'error') {
            term.write(`\r\n\x1b[31m[error] ${msg.message}\x1b[0m\r\n`);
          }
          // 'ready' / 'pong' / 'heartbeat': solo refrescan lastFrameAt
        } catch { /* noop */ }
      };

      sock.onerror = () => {
        // Silenciamos onerror — el onclose se va a disparar inmediatamente
        // después y ahí manejamos la reconexión. No queremos parpadear el
        // mensaje "Error de conexión" antes de saber si vamos a reintentar.
      };

      sock.onclose = (ev) => {
        if (ws !== sock || disposed) return;
        ws = null;
        if (pingTimer) { window.clearInterval(pingTimer); pingTimer = null; }
        // Códigos "normales" = el server cerró limpio (1000/1001). No reconectar.
        if (ev.code === 1000 || ev.code === 1001) {
          setStatus('closed');
          return;
        }
        failAndRetry();
      };

      // Input wiring: lo reconfiguramos en cada (re)connect porque el ws cambia.
      disposeInputRef.current?.dispose();
      const sendInput = (data: string) => {
        if (ws === sock && sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify({ type: 'input', data }));
        }
      };
      disposeInputRef.current = term.onData(sendInput);
      sendInputRef.current = sendInput;
    }

    const doResize = () => {
      try { fit.fit(); } catch { /* noop */ }
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (term.cols === sentCols && term.rows === sentRows) return;
      sentCols = term.cols;
      sentRows = term.rows;
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };
    doResizeRef.current = doResize;

    // El fit de arriba corre en el mismo tick que open() y sus cols/rows son
    // los que viajan en la URL del WS. En móvil el layout todavía se asienta
    // en ese instante (barra de tabs scrolleable, TerminalKeyBar, safe-area),
    // así que el PTY arranca con un tamaño que no es el final y la TUI del
    // agente queda descalzada. El ResizeObserver no lo rescata: una vez
    // asentado el contenedor ya no vuelve a cambiar de tamaño. Por eso
    // re-medimos mientras se estabiliza — fit() no hace nada si nada cambió.
    const settleTimers = [
      window.setTimeout(doResize, 120),
      window.setTimeout(doResize, 400),
    ];
    const settleRaf = requestAnimationFrame(doResize);
    // Hasta que la monoespaciada no está resuelta, el ancho de celda medido es
    // el de la fuente de fallback y todas las columnas salen corridas.
    document.fonts?.ready.then(() => { if (!disposed) doResize(); }).catch(() => { /* noop */ });

    resizeObs = new ResizeObserver(() => doResize());
    resizeObs.observe(container);

    // Detección de socket muerto por SILENCIO del server (heartbeat), no por
    // saltos entre ticks: Chromium estrangula los timers de una ventana tapada
    // o minimizada (un tick cada minuto) y eso parecía "la máquina durmió"
    // aunque el socket a 127.0.0.1 estuviera perfecto. Tras un sleep real / al
    // volver a primer plano, 30 s de silencio alcanzan para reconectar ya.
    const HEARTBEAT_STALE_MS = 45_000;
    const WAKE_STALE_MS = 30_000;
    const reconnectIfDead = (staleMs: number, wake: boolean) => {
      if (disposed || document.hidden || connecting) return;
      if (!ws) {
        // Hay un backoff pendiente: al despertar no vale la pena esperarlo.
        if (wake && reconnectTimer) { attempts = 0; scheduleReconnect(0); }
        return;
      }
      if (ws.readyState === WebSocket.CONNECTING) return;
      if (ws.readyState === WebSocket.OPEN && Date.now() - lastFrameAt < staleMs) return;
      const dead = ws;
      ws = null;
      dropSocket(dead);
      attempts = 0;
      void connect();
    };
    let lastTick = Date.now();
    const wakeTimer = window.setInterval(() => {
      const now = Date.now();
      const slept = now - lastTick > 10_000;
      lastTick = now;
      reconnectIfDead(slept ? WAKE_STALE_MS : HEARTBEAT_STALE_MS, slept);
    }, 3000);
    const onWake = () => reconnectIfDead(WAKE_STALE_MS, true);
    const onVisible = () => { if (!document.hidden) onWake(); };
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onVisible);

    connect();

    return () => {
      disposed = true;
      disposeInputRef.current?.dispose();
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(wakeTimer);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onVisible);
      settleTimers.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(settleRaf);
      if (hideBarTimer) window.clearTimeout(hideBarTimer);
      resizeObs?.disconnect();
      cancelAnimationFrame(inertia);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      const last = ws;
      ws = null;
      dropSocket(last);
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
    term.options.fontSize = fontPx;
    term.options.fontFamily = fontStack;
    doResizeRef.current();
  }, [fontPx, fontStack]);

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Wrapper propio para posicionar la barra de scroll: el contenedor de
          xterm no puede llevar hijos de React (ese subárbol lo maneja xterm). */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
        <div
          ref={containerRef}
          // En iOS el teclado solo sube si el foco cae en el textarea oculto de
          // xterm, y acertarle con el dedo es casualidad. Un tap en cualquier
          // parte del terminal lo enfoca.
          onClick={() => { try { termRef.current?.focus(); } catch { /* noop */ } }}
          style={{
            flex: 1, minWidth: 0,
            padding: isMobile ? 6 : 10,
            // Mismo color que el background del Terminal — así no se ve un marco
            // de otro color alrededor cuando hay padding o cuando el shell aún
            // no se conectó.
            background: '#0c0e14',
            borderRadius: 10,
            overflow: 'hidden',
            // Bajo zoom CSS (web) xterm mide las celdas con getBoundingClientRect,
            // que devuelve px visuales, y las aplica como px CSS: las celdas
            // salen Z veces más grandes y el canvas WebGL se ve borroso. Con el
            // contra-zoom el terminal queda a escala 1 y la fuente hace el resto.
            ...(cssZ !== 1 ? { zoom: 1 / cssZ } : null),
          }}
        />
        {isMobile && (
          <div
            ref={scrollTrackRef}
            style={{
              position: 'absolute', right: 2, top: 8, bottom: 8, width: 3,
              opacity: 0, transition: 'opacity 220ms ease',
              pointerEvents: 'none',
            }}>
            <div
              ref={scrollThumbRef}
              style={{
                position: 'absolute', left: 0, width: '100%', height: 0,
                borderRadius: 2, background: 'rgba(229,231,235,0.5)',
              }}/>
          </div>
        )}
      </div>
      {isMobile && (
        <TerminalKeyBar
          onKey={(seq) => {
            sendInputRef.current(seq);
            try { termRef.current?.focus(); } catch { /* noop */ }
          }}
          fontSize={prefs.fontSize}
          onFontSize={setTermFontSize}
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
          {status === 'connecting' && tr('conn.connecting')}
          {status === 'reconnecting' && tr('term.conn.reconnecting')}
          {status === 'closed' && tr('term.conn.closed')}
          {status === 'error' && (errMsg ?? tr('conn.error'))}
        </div>
      )}
    </div>
  );
}
