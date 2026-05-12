import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { ecoToken } from '@/lib/eco-config';
import { useTokens } from '@/design/theme';
import { registerPtyWriter } from '@/lib/voice-router';

type Props = {
  workspace: string;
  // Identificador estable de la burbuja: permite que el PTY persista en el backend
  // si el usuario sale y vuelve a la conversación.
  bubbleId: string;
  // Cuando este key cambia, se reinicia el terminal (sirve para "Nuevo shell")
  resetKey?: number;
};

// TOKEN se resuelve por llamada (no por módulo) para que funcione tanto en
// dev (env de Vite) como en Electron empaquetado (preload IPC).

export function RealTerminal({ workspace, bubbleId, resetKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useTokens();
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 5000,
      allowTransparency: true,
      theme: {
        background: '#00000000',
        foreground: t.text0,
        cursor: t.accent,
        cursorAccent: t.windowBg,
        selectionBackground: `${t.accent}55`,
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    try { fit.fit(); } catch { /* noop */ }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${wsProto}//${window.location.host}/ws/pty`);
    if (workspace) url.searchParams.set('workspace', workspace);
    if (bubbleId) url.searchParams.set('bubble', bubbleId);
    url.searchParams.set('cols', String(term.cols));
    url.searchParams.set('rows', String(term.rows));

    const token = ecoToken();
    console.log('[RealTerminal] connecting', { url: url.toString(), hasToken: !!token, tokenLen: token.length });
    const protocols = token ? [`eco.token.${token}`] : undefined;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url.toString(), protocols);
    } catch (e) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : 'No se pudo abrir el WebSocket');
      term.dispose();
      return;
    }

    let pingTimer: number | null = null;
    let resizeObs: ResizeObserver | null = null;

    ws.onopen = () => {
      setStatus('open');
      // Keep-alive
      pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 25_000);
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

    ws.onerror = (ev) => {
      console.error('[RealTerminal] ws.onerror', ev);
      setStatus('error');
      setErrMsg(`Error de conexión (url=${url.toString()}, token=${token ? `${token.length}ch` : 'vacío'})`);
    };

    ws.onclose = (ev) => {
      console.warn('[RealTerminal] ws.onclose', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
      setStatus((prev) => {
        if (prev === 'error') return 'error';
        if (ev.code !== 1000 && ev.code !== 1001) {
          setErrMsg(`WS cerrado (code=${ev.code}${ev.reason ? `, reason="${ev.reason}"` : ''})`);
          return 'error';
        }
        return 'closed';
      });
    };

    const sendInput = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    };
    const disposeInput = term.onData(sendInput);

    // Permitir que voice-router escriba al PTY cuando el sub-tab Shell está activo.
    const unregisterVoice = registerPtyWriter((text) => sendInput(text));

    const doResize = () => {
      try { fit.fit(); } catch { /* noop */ }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    resizeObs = new ResizeObserver(() => doResize());
    resizeObs.observe(container);

    return () => {
      unregisterVoice();
      disposeInput.dispose();
      if (pingTimer) window.clearInterval(pingTimer);
      resizeObs?.disconnect();
      try { ws.close(); } catch { /* noop */ }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, bubbleId, resetKey]);

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        ref={containerRef}
        style={{
          flex: 1, minHeight: 0,
          padding: 10,
          background: t.bg1,
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
          {status === 'closed' && 'cerrado'}
          {status === 'error' && (errMsg ?? 'error')}
        </div>
      )}
    </div>
  );
}
