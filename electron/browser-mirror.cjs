// Espejo del navegador de una bubble hacia clientes remotos (iPad / web por la
// tailnet): esos clientes no tienen el <webview> que maneja el agente, así que
// ven sus frames (CDP Page.startScreencast) y le mandan su mouse y teclado.
// Lo enciende el backend cuando hay alguien mirando (browser-mirror.ts).

const { cdp, mouseClick, pressKey, modifierNames } = require('./browser-input.cjs');

const FRAME_MIN_MS = 90;
const AWAKE_TICK_MS = 30_000;
const TEXT_MAX = 2000;


function createMirror({ resolveTarget, describeTabs, ensureSession, keepAwake, liveWebContents }) {
  /** bubbleId → { wcId, tabId, w, h, lastAck } */
  const casts = new Map();
  let send = () => {};

  function castOf(wcId) {
    for (const [bubbleId, c] of casts) if (c.wcId === wcId) return { bubbleId, c };
    return null;
  }

  function pushState(bubbleId) {
    if (!casts.has(bubbleId)) return;
    send({ type: 'mirror_state', bubbleId, tabs: describeTabs(bubbleId) });
  }

  async function stopCast(wcId) {
    const wc = wcId ? liveWebContents(wcId) : null;
    if (!wc || !wc.debugger.isAttached()) return;
    try { await cdp(wc, 'Page.stopScreencast'); } catch { /* ya no estaba */ }
  }

  async function retarget(bubbleId) {
    const c = casts.get(bubbleId);
    if (!c) return;
    let target = null;
    try { target = resolveTarget(bubbleId); } catch { target = null; }
    pushState(bubbleId);
    const wcId = target ? target.wc.id : null;
    if (c.wcId === wcId) return;
    const prev = c.wcId;
    c.wcId = wcId;
    c.tabId = target ? target.tabId : null;
    await stopCast(prev);
    if (!target || casts.get(bubbleId) !== c) return;
    try {
      keepAwake(target.wc);
      await ensureSession(target.wc);
      await cdp(target.wc, 'Page.startScreencast', CAST_PARAMS);
    } catch (e) {
      console.warn('[browser-mirror] no pude iniciar el espejo:', e?.message ?? e);
      c.wcId = null;
    }
  }

  function start(bubbleId) {
    if (!casts.has(bubbleId)) casts.set(bubbleId, { wcId: null, tabId: null, w: 0, h: 0, lastAck: 0 });
    void retarget(bubbleId);
  }

  function stop(bubbleId) {
    const c = casts.get(bubbleId);
    if (!c) return;
    casts.delete(bubbleId);
    void stopCast(c.wcId);
  }

  function stopAll() {
    for (const bubbleId of [...casts.keys()]) stop(bubbleId);
  }

  // Llamado desde el listener de CDP de cada webview.
  function onFrame(wc, params) {
    const hit = castOf(wc.id);
    const ack = () => { cdp(wc, 'Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {}); };
    if (!hit) { ack(); void stopCast(wc.id); return; }
    const { bubbleId, c } = hit;
    const meta = params.metadata ?? {};
    c.w = Math.round(meta.deviceWidth ?? 0);
    c.h = Math.round(meta.deviceHeight ?? 0);
    send({ type: 'mirror_frame', bubbleId, tabId: c.tabId, data: params.data, w: c.w, h: c.h });
    // El ack demorado es el control de flujo: Chromium no manda el siguiente
    // frame hasta recibirlo.
    const wait = Math.max(0, FRAME_MIN_MS - (Date.now() - c.lastAck));
    setTimeout(() => { c.lastAck = Date.now(); ack(); }, wait);
  }

  const CAST_PARAMS = { format: 'jpeg', quality: 55, maxWidth: 1600, maxHeight: 1600, everyNthFrame: 1 };

  function targetsChanged(bubbleId) {
    if (casts.has(bubbleId)) void retarget(bubbleId);
  }

  const unit = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

  async function input(bubbleId, ev) {
    const c = casts.get(bubbleId);
    const wc = c?.wcId ? liveWebContents(c.wcId) : null;
    if (!c || !wc || !ev || typeof ev !== 'object') return;
    keepAwake(wc);
    if (ev.t === 'zoom') {
      // El zoom es estado del BrowserPanel del escritorio (lo guarda y lo
      // reaplica en cada carga): cambiarlo solo acá se perdía al recargar.
      const dir = ev.dir === 'in' || ev.dir === 'out' ? ev.dir : 'reset';
      const host = wc.hostWebContents;
      if (host && !host.isDestroyed()) host.send('eco:browser-zoom', { bubbleId, dir });
      setTimeout(() => pushState(bubbleId), 250);
      return;
    }
    if (!c.w || !c.h) return;
    // El frame mide en px de pantalla; CDP espera px CSS, que con zoom son menos.
    const zoom = wc.getZoomFactor() || 1;
    const x = Math.round(unit(ev.nx) * c.w / zoom);
    const y = Math.round(unit(ev.ny) * c.h / zoom);
    try {
      if (ev.t === 'click') {
        await mouseClick(wc, x, y, { clickCount: ev.double ? 2 : 1 });
      } else if (ev.t === 'mouse' && ['down', 'up', 'move'].includes(ev.a)) {
        const type = ev.a === 'down' ? 'mousePressed' : ev.a === 'up' ? 'mouseReleased' : 'mouseMoved';
        const pressed = ev.a === 'down' || (ev.a === 'move' && ev.pressed);
        await cdp(wc, 'Input.dispatchMouseEvent', {
          type, x, y,
          button: ev.a === 'move' && !ev.pressed ? 'none' : 'left',
          buttons: pressed ? 1 : 0,
          clickCount: ev.a === 'move' ? 0 : 1,
        });
      } else if (ev.t === 'wheel') {
        const clampDelta = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(2000, Math.max(-2000, n)) : 0);
        await cdp(wc, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: clampDelta(ev.dx), deltaY: clampDelta(ev.dy) });
      } else if (ev.t === 'text' && typeof ev.text === 'string' && ev.text) {
        await wc.insertText(ev.text.slice(0, TEXT_MAX));
      } else if (ev.t === 'key' && typeof ev.key === 'string') {
        await pressKey(wc, ev.key.slice(0, 20), modifierNames(ev.modifiers));
      }
    } catch { /* tecla desconocida o webview en transición: se descarta */ }
  }

  setInterval(() => {
    for (const c of casts.values()) {
      const wc = c.wcId ? liveWebContents(c.wcId) : null;
      if (wc) keepAwake(wc);
    }
  }, AWAKE_TICK_MS).unref?.();

  return {
    start, stop, stopAll, onFrame, targetsChanged, input, pushState,
    setSender(fn) { send = fn; },
  };
}

module.exports = { createMirror };
