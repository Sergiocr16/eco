// Helper para mandar texto al PTY de un agente sin tener que abrir la pestaña
// Terminal. Se usa desde el botón "Claude remote control" y desde "Enviar a
// Claude" en los logs del dev server.
//
// Estrategia: abrir un WS efímero a /ws/pty con el bubbleId. El PTY persiste
// en el backend, así que el texto llega al Claude CLI ya corriendo dentro.
// Cerramos el WS después de mandar (no nos quedamos escuchando output).

import { readStoredSession } from './eco-config';

export type WriteToBubblePtyOpts = {
  bubbleId: string;
  workspace: string;
  text: string;       // texto a escribir tal cual (typicamente termina en \r)
  token: string;
  // Espera extra (ms) cuando el PTY se está creando recién — sin esto la
  // primera escritura puede llegar antes de que zsh + claude CLI imprimieran
  // el prompt y el input se pierde.
  reattachDelay?: number;
  firstStartDelay?: number;
  // Máximo total a esperar antes de abortar.
  totalTimeout?: number;
};

export async function writeToBubblePty(
  opts: WriteToBubblePtyOpts,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reattachDelay   = opts.reattachDelay   ?? 250;
  const firstStartDelay = opts.firstStartDelay ?? 2000;
  const totalTimeout    = opts.totalTimeout    ?? 6000;

  return new Promise((resolve) => {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${wsProto}//${window.location.host}/ws/pty`);
    if (opts.workspace) url.searchParams.set('workspace', opts.workspace);
    url.searchParams.set('bubble', opts.bubbleId);
    url.searchParams.set('cols', '120');
    url.searchParams.set('rows', '30');

    const sess = readStoredSession();
    const protocols = opts.token
      ? [`eco.token.${opts.token}`, ...(sess ? [`eco.session.${sess}`] : [])]
      : undefined;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url.toString(), protocols);
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : 'no se pudo abrir el WS' });
      return;
    }

    let settled = false;
    const finish = (r: { ok: true } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* noop */ }
      resolve(r);
    };

    ws.onerror = () => finish({ ok: false, error: 'ws error' });
    ws.onclose = (ev) => {
      if (settled) return;
      finish({ ok: false, error: `ws cerrado (code=${ev.code})` });
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type?: string; reattached?: boolean };
        if (msg?.type !== 'ready') return;
        const delay = msg.reattached ? reattachDelay : firstStartDelay;
        setTimeout(() => {
          if (settled || ws.readyState !== WebSocket.OPEN) return;
          try {
            ws.send(JSON.stringify({ type: 'input', data: opts.text }));
            setTimeout(() => finish({ ok: true }), 300);
          } catch (e) {
            finish({ ok: false, error: e instanceof Error ? e.message : 'send error' });
          }
        }, delay);
      } catch { /* noop */ }
    };
    setTimeout(() => finish({ ok: false, error: 'timeout esperando PTY' }), totalTimeout);
  });
}
