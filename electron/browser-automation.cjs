// Automatización del navegador de cada bubble (los <webview> del BrowserPanel)
// para las tools `browser_*` del MCP. Corre en el proceso principal porque es
// el único que llega al `webContents.debugger` de un webview: no se abre ningún
// puerto de depuración.
//
//   MCP ──HTTP──▶ backend (/bubble/browser) ──WS /ws/browser──▶ este módulo ──CDP──▶ webview
//
// El renderer registra cada webview con su bubble y su pestaña (IPC
// `eco:browser-target`); el backend manda operaciones por un WebSocket que este
// módulo abre contra él, autenticado con el token de máquina (~/.eco/token).

const { ipcMain, webContents } = require('electron');
const { PAGE_LIB_SRC } = require('./browser-page-lib.cjs');
const { BrowserError, cdp, sleep, modifierMask, modifierNames, mouseClick, pressKey } = require('./browser-input.cjs');
const { createMirror } = require('./browser-mirror.cjs');

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const CONSOLE_MAX = 1000;
const NETWORK_MAX = 1500;
const BODY_MAX = 20_000;
const POST_DATA_MAX = 8_000;
const EVAL_RESULT_MAX = 60_000;
const DEFAULT_TIMEOUT_MS = 20_000;
const RECONNECT_MS = 2000;

// ─── Registro bubble → webviews ──────────────────────────────────────────────

/** bubbleId → Map<tabId, { wcId, active, at }> */
const targets = new Map();

function dropWebContents(wcId) {
  for (const [bubbleId, tabs] of targets) {
    for (const [tabId, entry] of tabs) {
      if (entry.wcId === wcId) tabs.delete(tabId);
    }
    if (tabs.size === 0) targets.delete(bubbleId);
  }
  sessions.delete(wcId);
}

function liveWebContents(wcId) {
  const wc = webContents.fromId(wcId);
  return wc && !wc.isDestroyed() ? wc : null;
}

function tabsOf(bubbleId) {
  const tabs = targets.get(bubbleId);
  if (!tabs) return [];
  const out = [];
  for (const [tabId, entry] of tabs) {
    const wc = liveWebContents(entry.wcId);
    if (!wc) { tabs.delete(tabId); continue; }
    out.push({ tabId, active: entry.active, at: entry.at, wc });
  }
  return out;
}

function resolveTarget(bubbleId, tabId) {
  const tabs = tabsOf(bubbleId);
  if (tabs.length === 0) {
    throw new BrowserError('no_target', 'El navegador de esa bubble no tiene ninguna página abierta en Eco.');
  }
  if (tabId) {
    const hit = tabs.find((t) => t.tabId === tabId);
    if (!hit) throw new BrowserError('no_target', `No existe la pestaña ${tabId} en el navegador de esa bubble.`);
    return hit;
  }
  return tabs.find((t) => t.active) ?? tabs.sort((a, b) => b.at - a.at)[0];
}

function describeTabs(bubbleId) {
  return tabsOf(bubbleId).map((t) => ({
    tabId: t.tabId,
    active: t.active,
    url: t.wc.getURL(),
    title: t.wc.getTitle(),
    loading: t.wc.isLoading(),
    zoom: t.wc.getZoomFactor(),
  }));
}

ipcMain.handle('eco:browser-target', (event, payload) => {
  const p = payload && typeof payload === 'object' ? payload : {};
  const { webContentsId, bubbleId, tabId } = p;
  if (!Number.isInteger(webContentsId) || !ID_RE.test(String(bubbleId)) || !ID_RE.test(String(tabId))) {
    return { ok: false, error: 'datos inválidos' };
  }
  if (p.remove) {
    const tabs = targets.get(bubbleId);
    if (tabs?.get(tabId)?.wcId === webContentsId) tabs.delete(tabId);
    if (tabs && tabs.size === 0) targets.delete(bubbleId);
    mirror.targetsChanged(bubbleId);
    return { ok: true };
  }
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== event.sender) {
    return { ok: false, error: 'webview no encontrado' };
  }
  let tabs = targets.get(bubbleId);
  if (!tabs) { tabs = new Map(); targets.set(bubbleId, tabs); }
  if (p.active) for (const entry of tabs.values()) entry.active = false;
  const isNew = !tabs.has(tabId) || tabs.get(tabId).wcId !== webContentsId;
  tabs.set(tabId, { wcId: webContentsId, active: !!p.active, at: Date.now() });
  if (isNew) {
    wc.once('destroyed', () => { dropWebContents(webContentsId); mirror.targetsChanged(bubbleId); });
    const refresh = () => mirror.pushState(bubbleId);
    wc.on('did-navigate', refresh);
    wc.on('did-navigate-in-page', refresh);
    wc.on('page-title-updated', refresh);
  }
  mirror.targetsChanged(bubbleId);
  return { ok: true };
});

// ─── Sesión CDP por webview: consola + red ───────────────────────────────────

/** wcId → estado de captura */
const sessions = new Map();

function newSession() {
  return {
    ready: false,
    listening: false,
    since: 0,
    seq: 0,
    console: [],
    network: [],
    byRequestId: new Map(),
  };
}

async function ensureSession(wc) {
  let s = sessions.get(wc.id);
  if (s?.ready && wc.debugger.isAttached()) return s;
  if (!s) { s = newSession(); sessions.set(wc.id, s); }
  // El override de safe area (main.cjs) puede haberlo adjuntado antes.
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  if (!s.listening) {
    s.listening = true;
    wc.debugger.on('message', (_e, method, params) => {
      if (method === 'Page.screencastFrame') mirror.onFrame(wc, params);
      else onCdpEvent(s, method, params);
    });
    wc.debugger.on('detach', () => { s.ready = false; });
  }
  await cdp(wc, 'Runtime.enable');
  await cdp(wc, 'Log.enable');
  await cdp(wc, 'Page.enable');
  await cdp(wc, 'Network.enable', { maxTotalBufferSize: 50_000_000, maxResourceBufferSize: 10_000_000 });
  // Sin esto el texto y las teclas no llegan cuando Eco no es la ventana activa
  // (el usuario mirando otra app mientras el agente prueba).
  await cdp(wc, 'Emulation.setFocusEmulationEnabled', { enabled: true });
  s.ready = true;
  if (!s.since) s.since = Date.now();
  return s;
}

function remoteToString(arg) {
  if (!arg) return '';
  if (arg.type === 'string') return arg.value;
  if (arg.type === 'undefined') return 'undefined';
  if ('value' in arg) return typeof arg.value === 'object' ? JSON.stringify(arg.value) : String(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  if (arg.preview?.properties) {
    const props = arg.preview.properties.map((p) => `${p.name}: ${p.value ?? p.type}`).join(', ');
    return arg.preview.subtype === 'array' ? `[${props}]` : `{${props}${arg.preview.overflow ? ', …' : ''}}`;
  }
  return arg.description ?? arg.type ?? '';
}

function pushRing(arr, entry, max) {
  arr.push(entry);
  if (arr.length > max) arr.splice(0, arr.length - max);
}

const CONSOLE_LEVEL = { error: 'error', assert: 'error', warning: 'warning', warn: 'warning' };

function onCdpEvent(s, method, params) {
  switch (method) {
    case 'Runtime.consoleAPICalled': {
      const frame = params.stackTrace?.callFrames?.[0];
      pushRing(s.console, {
        seq: ++s.seq,
        ts: Date.now(),
        level: CONSOLE_LEVEL[params.type] ?? (params.type === 'debug' ? 'debug' : 'info'),
        source: 'console',
        text: (params.args ?? []).map(remoteToString).join(' '),
        url: frame?.url ?? '',
        line: frame ? frame.lineNumber + 1 : 0,
      }, CONSOLE_MAX);
      return;
    }
    case 'Runtime.exceptionThrown': {
      const d = params.exceptionDetails ?? {};
      pushRing(s.console, {
        seq: ++s.seq,
        ts: Date.now(),
        level: 'error',
        source: 'exception',
        text: d.exception?.description ?? d.text ?? 'Excepción sin detalle',
        url: d.url ?? '',
        line: typeof d.lineNumber === 'number' ? d.lineNumber + 1 : 0,
      }, CONSOLE_MAX);
      return;
    }
    case 'Log.entryAdded': {
      const e = params.entry ?? {};
      pushRing(s.console, {
        seq: ++s.seq,
        ts: Date.now(),
        level: e.level === 'verbose' ? 'debug' : (e.level ?? 'info'),
        source: e.source ?? 'log',
        text: e.text ?? '',
        url: e.url ?? '',
        line: typeof e.lineNumber === 'number' ? e.lineNumber + 1 : 0,
      }, CONSOLE_MAX);
      return;
    }
    case 'Network.requestWillBeSent': {
      const url = params.request?.url ?? '';
      if (/^(data|blob):/i.test(url)) return;
      const prev = s.byRequestId.get(params.requestId);
      if (prev && params.redirectResponse) {
        prev.status = params.redirectResponse.status;
        prev.statusText = params.redirectResponse.statusText ?? '';
        prev.done = true;
        prev.redirected = true;
      }
      const entry = {
        seq: ++s.seq,
        ts: Date.now(),
        requestId: params.requestId,
        method: params.request?.method ?? 'GET',
        url,
        type: params.type ?? '',
        status: 0,
        statusText: '',
        mimeType: '',
        failed: false,
        errorText: '',
        done: false,
        durationMs: null,
        start: params.timestamp,
        postData: params.request?.postData ? String(params.request.postData).slice(0, POST_DATA_MAX) : '',
        hasPostData: !!params.request?.hasPostData,
      };
      s.byRequestId.set(params.requestId, entry);
      pushRing(s.network, entry, NETWORK_MAX);
      if (s.network.length >= NETWORK_MAX && s.byRequestId.size > NETWORK_MAX * 2) {
        const keep = new Set(s.network.map((n) => n.requestId));
        for (const id of s.byRequestId.keys()) if (!keep.has(id)) s.byRequestId.delete(id);
      }
      return;
    }
    case 'Network.responseReceived': {
      const entry = s.byRequestId.get(params.requestId);
      if (!entry) return;
      entry.status = params.response?.status ?? 0;
      entry.statusText = params.response?.statusText ?? '';
      entry.mimeType = params.response?.mimeType ?? '';
      return;
    }
    case 'Network.loadingFinished': {
      const entry = s.byRequestId.get(params.requestId);
      if (!entry) return;
      entry.done = true;
      if (typeof entry.start === 'number') entry.durationMs = Math.round((params.timestamp - entry.start) * 1000);
      return;
    }
    case 'Network.loadingFailed': {
      const entry = s.byRequestId.get(params.requestId);
      if (!entry) return;
      entry.done = true;
      entry.failed = true;
      entry.errorText = params.canceled ? 'cancelado' : (params.blockedReason ? `bloqueado (${params.blockedReason})` : (params.errorText ?? 'error'));
      if (typeof entry.start === 'number') entry.durationMs = Math.round((params.timestamp - entry.start) * 1000);
      return;
    }
    default:
  }
}

const PAGE_LIB_GLOBAL = '__ecoAutomationV1';

async function evaluate(wc, expression, { awaitPromise = true } = {}) {
  const r = await cdp(wc, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    const msg = d.exception?.description ?? d.exception?.value ?? d.text ?? 'error';
    const m = /ECO:([a-z_]+):([^\n]*)/.exec(String(msg));
    if (m) throw new BrowserError(m[1], m[2]);
    throw new BrowserError('eval_error', String(msg).split('\n').slice(0, 6).join('\n'));
  }
  return r.result;
}

async function pageCall(wc, fn, arg) {
  const expr = `(() => { const L = window.${PAGE_LIB_GLOBAL} || (window.${PAGE_LIB_GLOBAL} = (${PAGE_LIB_SRC})());`
    + ` return L.${fn}(${JSON.stringify(arg ?? null)}); })()`;
  const r = await evaluate(wc, expr, { awaitPromise: false });
  return r.value;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new BrowserError('timeout', `${what} no terminó en ${Math.round(ms / 1000)} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function waitForLoad(wc, timeoutMs) {
  const t0 = Date.now();
  let quiet = 0;
  while (Date.now() - t0 < timeoutMs) {
    if (wc.isDestroyed()) throw new BrowserError('no_target', 'La página se cerró.');
    quiet = wc.isLoading() ? 0 : quiet + 1;
    if (quiet >= 2) return true;
    await sleep(150);
  }
  return false;
}

function pageInfo(wc, s) {
  return {
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    cursor: s ? s.seq : 0,
  };
}

function inflightCount(s) {
  let n = 0;
  for (const e of s.network) if (!e.done) n++;
  return n;
}

function targetArg(args) {
  const t = {};
  if (typeof args.ref === 'string' && args.ref) t.ref = args.ref;
  if (typeof args.selector === 'string' && args.selector) t.selector = args.selector;
  if (typeof args.text === 'string' && args.text) t.text = args.text;
  if (args.exact) t.exact = true;
  return t;
}

function hasTarget(t) {
  return !!(t.ref || t.selector || t.text);
}

const LEVEL_RANK = { debug: 0, info: 1, warning: 2, error: 3 };

// ─── Operaciones ─────────────────────────────────────────────────────────────

const OPS = {
  async status(wc, s, args) {
    // La UI acaba de poner la URL en la pestaña: esperar a que cargue.
    if (args.waitLoad) { await sleep(300); await waitForLoad(wc, 30_000); }
    const out = { ...pageInfo(wc, s), tabs: describeTabs(args.bubbleId) };
    if (s) {
      out.capturingSince = new Date(s.since).toISOString();
      out.consoleErrors = s.console.filter((c) => c.level === 'error').length;
      out.inflight = inflightCount(s);
    }
    return out;
  },

  async navigate(wc, s, args) {
    const action = args.action ?? 'go';
    const timeoutMs = clampMs(args.timeoutMs, 30_000, 120_000);
    let loadError = '';
    const onFail = (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) loadError = `${desc || 'error'} (${code}) al cargar ${url}`;
    };
    wc.on('did-fail-load', onFail);
    try {
      if (action === 'go') {
        const url = String(args.url ?? '');
        if (!/^(https?:|about:blank)/i.test(url)) throw new BrowserError('invalid_args', 'url debe empezar con http:// o https://');
        wc.loadURL(url).catch(() => { /* lo reporta did-fail-load */ });
      } else if (action === 'back' || action === 'forward') {
        const h = wc.navigationHistory;
        const can = action === 'back' ? h.canGoBack() : h.canGoForward();
        if (!can) throw new BrowserError('invalid_args', action === 'back' ? 'No hay página anterior.' : 'No hay página siguiente.');
        if (action === 'back') h.goBack(); else h.goForward();
      } else if (action === 'reload') {
        if (args.hard) wc.reloadIgnoringCache(); else wc.reload();
      } else {
        throw new BrowserError('invalid_args', `Acción desconocida: ${action}`);
      }
      if (args.wait === 'none') return { ...pageInfo(wc, s), waited: false };
      await sleep(250);
      const loaded = await waitForLoad(wc, timeoutMs);
      if (loadError) throw new BrowserError('load_failed', loadError);
      return { ...pageInfo(wc, s), waited: true, loaded };
    } finally {
      wc.removeListener('did-fail-load', onFail);
    }
  },

  async snapshot(wc, s, args) {
    const r = await pageCall(wc, 'snapshot', {
      scope: typeof args.scope === 'string' && args.scope ? args.scope : undefined,
      all: !!args.includeHidden,
      max: clampInt(args.max, 250, 1000),
    });
    return { ...r, cursor: s.seq };
  },

  async text(wc, s, args) {
    const r = await pageCall(wc, 'text', {
      scope: typeof args.scope === 'string' && args.scope ? args.scope : undefined,
      max: clampInt(args.maxChars, 20_000, 200_000),
    });
    return { ...r, cursor: s.seq };
  },

  async click(wc, s, args) {
    const modifiers = modifierMask(args.modifiers);
    const clickCount = args.double ? 2 : 1;
    const button = args.button === 'right' || args.button === 'middle' ? args.button : 'left';
    let p;
    if (Number.isFinite(args.x) && Number.isFinite(args.y)) {
      p = { x: Math.round(args.x), y: Math.round(args.y), target: `coordenadas ${Math.round(args.x)},${Math.round(args.y)}`, covered: null, disabled: false };
    } else {
      const t = targetArg(args);
      if (!hasTarget(t)) throw new BrowserError('invalid_args', 'Pasá ref, selector, text o x/y.');
      p = await pageCall(wc, 'point', t);
    }
    const urlBefore = wc.getURL();
    await mouseClick(wc, p.x, p.y, { button, clickCount, modifiers });
    await sleep(clampMs(args.settleMs, 300, 5000));
    return {
      clicked: p.target,
      at: { x: p.x, y: p.y },
      covered: p.covered,
      disabled: p.disabled,
      navigated: wc.getURL() !== urlBefore,
      ...pageInfo(wc, s),
    };
  },

  async type(wc, s, args) {
    const text = typeof args.value === 'string' ? args.value : '';
    // El borrado y la selección los hace la página: el comando selectAll no le
    // llega a un webview. insertText reemplaza la selección y dispara `input`.
    const f = await pageCall(wc, 'focus', { ...targetArg(args), clear: args.clear !== false, empty: !text });
    if (text) {
      if (args.slowly) {
        for (const ch of text) await pressKey(wc, ch === '\n' ? 'Enter' : ch);
      } else {
        await wc.insertText(text);
      }
    }
    if (args.submit) await pressKey(wc, 'Enter');
    await sleep(150);
    return { typedInto: f.target, chars: text.length, submitted: !!args.submit, ...pageInfo(wc, s) };
  },

  async press(wc, s, args) {
    const keys = String(args.key ?? '').split('+').map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) throw new BrowserError('invalid_args', 'Falta key.');
    const key = keys.pop();
    const modifiers = modifierNames([...keys, ...(Array.isArray(args.modifiers) ? args.modifiers : [])]);
    const t = targetArg(args);
    if (hasTarget(t)) await pageCall(wc, 'focus', t);
    const times = clampInt(args.times, 1, 50);
    for (let i = 0; i < times; i++) await pressKey(wc, key, modifiers);
    await sleep(150);
    return { pressed: args.key, times, ...pageInfo(wc, s) };
  },

  async select(wc, s, args) {
    const r = await pageCall(wc, 'selectOption', { ...targetArg(args), value: String(args.value ?? '') });
    await sleep(150);
    return { ...r, ...pageInfo(wc, s) };
  },

  async eval(wc, s, args) {
    const expression = String(args.expression ?? '');
    if (!expression.trim()) throw new BrowserError('invalid_args', 'Falta expression.');
    const r = await evaluate(wc, expression, { awaitPromise: true });
    let json;
    if (r.type === 'undefined') json = 'undefined';
    else if ('value' in r) json = JSON.stringify(r.value, null, 2) ?? String(r.value);
    else json = r.unserializableValue ?? r.description ?? r.type;
    const truncated = json.length > EVAL_RESULT_MAX;
    return { type: r.type, value: truncated ? json.slice(0, EVAL_RESULT_MAX) : json, truncated, ...pageInfo(wc, s) };
  },

  async screenshot(wc, s, args) {
    const vp = await pageCall(wc, 'viewport');
    if (!vp.w || !vp.h) throw new BrowserError('hidden', 'El navegador de la bubble está oculto en Eco: no hay nada que capturar.');
    const scale = args.hiDpi ? 1 : 1 / vp.dpr;
    let clip;
    let target = 'viewport';
    let beyond = false;
    const t = targetArg(args);
    if (hasTarget(t)) {
      const r = await pageCall(wc, 'rectOf', t);
      if (!r.w || !r.h) throw new BrowserError('not_visible', `${r.target} no tiene tamaño visible.`);
      clip = { x: r.x, y: r.y, width: r.w, height: r.h, scale };
      target = r.target;
      beyond = true;
    } else if (args.fullPage) {
      const m = await cdp(wc, 'Page.getLayoutMetrics');
      const size = m.cssContentSize ?? m.contentSize;
      clip = { x: 0, y: 0, width: Math.max(vp.w, size.width), height: Math.min(Math.max(vp.h, size.height), 12_000), scale };
      target = 'página completa';
      beyond = true;
    } else {
      clip = { x: vp.sx, y: vp.sy, width: vp.w, height: vp.h, scale };
    }
    const format = args.format === 'jpeg' ? 'jpeg' : 'png';
    const r = await cdp(wc, 'Page.captureScreenshot', {
      format,
      ...(format === 'jpeg' ? { quality: clampInt(args.quality, 80, 100) } : {}),
      clip,
      captureBeyondViewport: beyond,
      fromSurface: true,
    });
    return {
      data: r.data,
      mimeType: `image/${format}`,
      width: Math.round(clip.width * scale * vp.dpr),
      height: Math.round(clip.height * scale * vp.dpr),
      target,
      ...pageInfo(wc, s),
    };
  },

  async wait_for(wc, s, args) {
    const timeoutMs = clampMs(args.timeoutMs, 15_000, 120_000);
    const t = targetArg(args);
    const expression = typeof args.expression === 'string' ? args.expression.trim() : '';
    const idleMs = args.networkIdle ? clampMs(args.idleMs, 500, 10_000) : 0;
    if (!hasTarget(t) && !expression && !idleMs) throw new BrowserError('invalid_args', 'Pasá text, selector, ref, expression o network_idle.');
    const gone = !!args.gone;
    const t0 = Date.now();
    let idleSince = 0;
    let last = '';
    while (Date.now() - t0 < timeoutMs) {
      let ok = true;
      try {
        if (hasTarget(t)) {
          const r = await pageCall(wc, 'check', t);
          ok = gone ? !r.found : r.found;
        }
        if (ok && expression) {
          const r = await evaluate(wc, expression, { awaitPromise: true });
          ok = gone ? !r.value : !!r.value;
        }
        last = '';
      } catch (e) {
        // Durante una navegación el contexto de la página desaparece un momento:
        // se reintenta. Un argumento mal formado no se arregla esperando.
        if (e instanceof BrowserError && (e.code === 'invalid_args' || e.code === 'hidden')) throw e;
        ok = false;
        last = e instanceof Error ? e.message : String(e);
      }
      if (ok && idleMs) {
        if (inflightCount(s) > 0) idleSince = 0;
        else if (!idleSince) idleSince = Date.now();
        ok = idleSince > 0 && Date.now() - idleSince >= idleMs;
      }
      if (ok) return { met: true, elapsedMs: Date.now() - t0, ...pageInfo(wc, s) };
      await sleep(250);
    }
    throw new BrowserError('timeout', `La condición no se cumplió en ${Math.round(timeoutMs / 1000)} s${last ? ` (último error: ${last})` : ''}.`);
  },

  async console(wc, s, args) {
    const since = Number.isFinite(args.since) ? args.since : 0;
    const minRank = LEVEL_RANK[args.level] ?? LEVEL_RANK.info;
    let re = null;
    if (typeof args.pattern === 'string' && args.pattern) {
      try { re = new RegExp(args.pattern, 'i'); } catch { throw new BrowserError('invalid_args', `pattern no es una regex válida: ${args.pattern}`); }
    }
    const limit = clampInt(args.limit, 100, 1000);
    const all = s.console.filter((c) => c.seq > since && (LEVEL_RANK[c.level] ?? 1) >= minRank && (!re || re.test(c.text) || re.test(c.url)));
    return {
      entries: all.slice(-limit),
      matched: all.length,
      cursor: s.seq,
      capturingSince: new Date(s.since).toISOString(),
      url: wc.getURL(),
    };
  },

  async network(wc, s, args) {
    if (typeof args.requestId === 'string' && args.requestId) return networkDetail(wc, s, args.requestId);
    const since = Number.isFinite(args.since) ? args.since : 0;
    let re = null;
    if (typeof args.urlPattern === 'string' && args.urlPattern) {
      try { re = new RegExp(args.urlPattern, 'i'); } catch { throw new BrowserError('invalid_args', `url_pattern no es una regex válida: ${args.urlPattern}`); }
    }
    const method = typeof args.method === 'string' ? args.method.toUpperCase() : '';
    const limit = clampInt(args.limit, 100, 1000);
    const all = s.network.filter((n) => n.seq > since
      && (!re || re.test(n.url))
      && (!method || n.method === method)
      && (!args.onlyErrors || n.failed || n.status >= 400)
      && (!args.onlyApi || n.type === 'XHR' || n.type === 'Fetch'));
    return {
      entries: all.slice(-limit).map(({ start, postData, ...rest }) => ({ ...rest, hasPostData: rest.hasPostData || !!postData })),
      matched: all.length,
      inflight: inflightCount(s),
      cursor: s.seq,
      capturingSince: new Date(s.since).toISOString(),
      url: wc.getURL(),
    };
  },
};

async function networkDetail(wc, s, requestId) {
  const n = s.byRequestId.get(requestId);
  if (!n) throw new BrowserError('not_found', `No hay un request ${requestId} en la captura (puede haber rotado).`);
  let requestBody = n.postData;
  if (!requestBody && n.hasPostData) {
    try { requestBody = String((await cdp(wc, 'Network.getRequestPostData', { requestId })).postData ?? '').slice(0, POST_DATA_MAX); } catch { /* ya no está */ }
  }
  let responseBody = '';
  let bodyNote = '';
  if (n.done && !n.failed) {
    try {
      const r = await cdp(wc, 'Network.getResponseBody', { requestId });
      if (r.base64Encoded) bodyNote = 'cuerpo binario (no se muestra)';
      else {
        responseBody = String(r.body ?? '');
        if (responseBody.length > BODY_MAX) { responseBody = responseBody.slice(0, BODY_MAX); bodyNote = `truncado a ${BODY_MAX} caracteres`; }
      }
    } catch {
      bodyNote = 'Chromium ya descartó el cuerpo';
    }
  } else if (!n.done) bodyNote = 'el request sigue en curso';
  const { start, postData, ...rest } = n;
  return { entry: rest, requestBody, responseBody, bodyNote, cursor: s.seq };
}

function clampInt(v, def, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function clampMs(v, def, max) {
  return clampInt(v, def, max);
}

const OP_TIMEOUT = { navigate: 125_000, wait_for: 125_000, screenshot: 30_000, status: 45_000 };

// Una operación a la vez por bubble: dos clics intercalados con un tipeo
// llegarían a la página en cualquier orden.
const queues = new Map();

function enqueue(key, fn) {
  const prev = queues.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  queues.set(key, run);
  run.finally(() => { if (queues.get(key) === run) queues.delete(key); }).catch(() => {});
  return run;
}

// Con la ventana de Eco tapada por otra app Chromium deja de producir frames:
// las capturas no vuelven y el espejo queda mudo. Mientras un agente maneja el
// webview (o alguien lo mira por el espejo) se apaga el throttling del webview
// Y de la ventana que lo contiene — con solo el webview no alcanza (verificado
// en Electron 44). Vuelve a encenderse tras un rato sin operaciones.
const AWAKE_MS = 60_000;
/** wcId (webview o ventana anfitriona) → timer de reencendido */
const awake = new Map();

function holdAwake(wc) {
  clearTimeout(awake.get(wc.id));
  if (!awake.has(wc.id)) {
    try { wc.setBackgroundThrottling(false); } catch { /* destruido */ }
    wc.once('destroyed', () => { clearTimeout(awake.get(wc.id)); awake.delete(wc.id); });
  }
  awake.set(wc.id, setTimeout(() => {
    awake.delete(wc.id);
    if (!wc.isDestroyed()) wc.setBackgroundThrottling(true);
  }, AWAKE_MS));
}

function keepAwake(wc) {
  holdAwake(wc);
  const host = wc.hostWebContents;
  if (host && !host.isDestroyed()) holdAwake(host);
}

const mirror = createMirror({ resolveTarget, describeTabs, ensureSession, keepAwake, liveWebContents });

async function runOp(msg) {
  const op = String(msg.op ?? '');
  const bubbleId = String(msg.bubbleId ?? '');
  const args = msg.args && typeof msg.args === 'object' ? msg.args : {};
  if (!ID_RE.test(bubbleId)) throw new BrowserError('invalid_args', 'bubbleId inválido');
  if (op === 'targets') return { tabs: describeTabs(bubbleId) };
  const impl = OPS[op];
  if (!impl) throw new BrowserError('invalid_args', `Operación desconocida: ${op}`);
  return enqueue(bubbleId, () => withTimeout((async () => {
    const tabId = typeof msg.tabId === 'string' && msg.tabId ? msg.tabId : undefined;
    const { wc } = resolveTarget(bubbleId, tabId);
    keepAwake(wc);
    const s = await ensureSession(wc);
    return impl(wc, s, { ...args, bubbleId });
  })(), OP_TIMEOUT[op] ?? DEFAULT_TIMEOUT_MS, op));
}

// ─── Puente con el backend ───────────────────────────────────────────────────

function startBridge({ backendUrl, readToken }) {
  if (typeof WebSocket !== 'function') {
    console.warn('[browser-automation] sin WebSocket global: las tools browser_* no van a funcionar');
    return;
  }
  let sock = null;
  let timer = null;
  let warned = false;
  const url = `${backendUrl.replace(/^http/, 'ws')}/ws/browser`;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(connect, RECONNECT_MS);
  };

  function connect() {
    const token = readToken();
    if (!token) { schedule(); return; }
    let ws;
    try {
      ws = new WebSocket(url, [`eco.machine.${token}`]);
    } catch (e) {
      if (!warned) { console.warn('[browser-automation] no pude abrir el puente:', e?.message ?? e); warned = true; }
      schedule();
      return;
    }
    sock = ws;
    ws.onopen = () => {
      warned = false;
      console.log('[browser-automation] puente con el backend conectado');
      mirror.setSender((m) => {
        try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); } catch { /* el backend se fue */ }
      });
    };
    ws.onmessage = (ev) => { void handleMessage(ws, ev.data); };
    ws.onerror = () => { /* el close que sigue reprograma */ };
    ws.onclose = () => {
      if (sock !== ws) return;
      sock = null;
      // Sin backend no hay quien mire: el que vuelva a conectar lo pide de nuevo.
      mirror.stopAll();
      schedule();
    };
  }

  async function handleMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8')); } catch { return; }
    if (!msg) return;
    if (typeof msg.id !== 'string') {
      // Avisos sin respuesta: el espejo hacia clientes remotos (y el heartbeat).
      const bubbleId = String(msg.bubbleId ?? '');
      if (!ID_RE.test(bubbleId)) return;
      if (msg.type === 'mirror') { if (msg.on) mirror.start(bubbleId); else mirror.stop(bubbleId); }
      else if (msg.type === 'mirror_input') void mirror.input(bubbleId, msg.event);
      return;
    }
    let reply;
    try {
      reply = { id: msg.id, ok: true, result: await runOp(msg) };
    } catch (e) {
      const code = e instanceof BrowserError ? e.code : 'cdp_error';
      reply = { id: msg.id, ok: false, code, message: e instanceof Error ? e.message : String(e) };
    }
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply)); } catch { /* el backend se fue */ }
  }

  connect();
}

// runOp se exporta para probar las operaciones sin el backend.
module.exports = { startBridge, runOp };
