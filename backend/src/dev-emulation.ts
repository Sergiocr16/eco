// Emulación de dispositivo para las previews que pasan por el proxy
// (dev-proxy.ts). En el navegador la página va en un <iframe>, y ahí no hay
// forma de cambiarle el user agent ni los env(safe-area-inset-*). El proxy lo
// resuelve tocando lo que sirve:
//
//  - CSS y HTML: cada `env(safe-area-inset-X[, f])` pasa a
//    `var(--eco-safe-area-inset-X, env(safe-area-inset-X[, f]))`. Sin la
//    variable definida el valor es el real, así que un teléfono de verdad que
//    entra por el mismo proxy no nota nada.
//  - HTML con <head>: se inyecta un script del mismo origen (pasa una CSP
//    'self') que lee la configuración de `window.name` — el frontend la pone
//    en el atributo `name` del iframe, legible desde el primer instante aunque
//    sea otro origen — y redefine `navigator.userAgent` y las variables, y pone
//    en <html> las clases y variables que inyecta la app nativa (`nativeHints`).
//
// No cubre: el User-Agent de las peticiones HTTP (el servidor ve el real), ni
// `env()` armado desde JavaScript.

import zlib from 'node:zlib';
import type http from 'node:http';

export const EMULATION_SCRIPT_PATH = '/__eco/emulation.js';
// Prefijo de `window.name`; el frontend (SmartBrowserView) usa el mismo.
const NAME_PREFIX = 'eco-emu:';
const MAX_REWRITE_BYTES = 8 * 1024 * 1024;

export type RewriteKind = 'html' | 'css';

const SAFE_AREA_ENV_RE =
  /env\(\s*(safe-area-inset-(?:top|right|bottom|left))\s*(,[^()]*(?:\([^()]*\)[^()]*)*)?\)/g;
const HEAD_OPEN_RE = /<head(?:\s[^>]*)?>/i;
const SCRIPT_TAG = `<script src="${EMULATION_SCRIPT_PATH}"></script>`;

// ES5 a propósito: corre antes que cualquier script de la página.
export const EMULATION_SCRIPT = `(function () {
  var SIDES = ['top', 'right', 'bottom', 'left'];
  var root = document.documentElement;
  function applyInsets(insets) {
    for (var i = 0; i < SIDES.length; i++) {
      var name = '--eco-safe-area-inset-' + SIDES[i];
      var v = insets ? insets[SIDES[i]] : null;
      if (typeof v === 'number' && isFinite(v)) root.style.setProperty(name, v + 'px');
      else root.style.removeProperty(name);
    }
  }
  function applyHints(h) {
    if (!h) return;
    var k;
    for (k in h.rootClasses || {}) root.classList.toggle(k, !!h.rootClasses[k]);
    for (k in h.rootVars || {}) root.style.setProperty(k, String(h.rootVars[k]));
  }
  function define(prop, value) {
    try { Object.defineProperty(navigator, prop, { get: function () { return value; }, configurable: true }); } catch (e) {}
  }
  var cfg = null;
  try {
    if (typeof window.name === 'string' && window.name.indexOf(${JSON.stringify(NAME_PREFIX)}) === 0) {
      cfg = JSON.parse(window.name.slice(${NAME_PREFIX.length}));
    }
  } catch (e) { cfg = null; }
  if (!cfg) return;
  if (typeof cfg.userAgent === 'string' && cfg.userAgent) {
    var ios = /iPhone|iPad|iPod/.test(cfg.userAgent);
    define('userAgent', cfg.userAgent);
    define('appVersion', cfg.userAgent.replace(/^Mozilla\\//, ''));
    define('platform', ios ? 'iPhone' : 'Linux armv81');
    define('vendor', ios ? 'Apple Computer, Inc.' : 'Google Inc.');
    define('maxTouchPoints', 5);
  }
  applyInsets(cfg.safeArea);
  applyHints(cfg.nativeHints);
  // Cambios en vivo (rotar, modo de navegación) sin recargar.
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || e.data.type !== 'eco-emulation') return;
    applyInsets(e.data.safeArea);
    applyHints(e.data.nativeHints);
  });
})();
`;

// Qué respuestas se reescriben: solo GET 200 de HTML o CSS en UTF-8.
export function rewriteKindFor(method: string | undefined, upRes: http.IncomingMessage): RewriteKind | null {
  if (method !== 'GET' || upRes.statusCode !== 200) return null;
  const type = String(upRes.headers['content-type'] ?? '').toLowerCase();
  const charset = /charset=([^;\s]+)/.exec(type)?.[1]?.replace(/"/g, '');
  if (charset && charset !== 'utf-8' && charset !== 'utf8') return null;
  if (type.startsWith('text/html')) return 'html';
  if (type.startsWith('text/css')) return 'css';
  return null;
}

function decode(body: Buffer, encoding: string): Buffer | null {
  switch (encoding.trim().toLowerCase()) {
    case '': case 'identity': return body;
    case 'gzip': case 'x-gzip': return zlib.gunzipSync(body);
    case 'deflate': return zlib.inflateSync(body);
    case 'br': return zlib.brotliDecompressSync(body);
    default: return null;
  }
}

export function rewriteText(kind: RewriteKind, text: string): string {
  const out = text.replace(SAFE_AREA_ENV_RE, (m, name: string, fallback?: string) =>
    `var(--eco-${name}, env(${name}${fallback ?? ''}))`);
  if (kind !== 'html') return out;
  // Sin <head> es un parcial (plantilla pedida por XHR): no lleva script.
  const head = HEAD_OPEN_RE.exec(out);
  if (!head) return out;
  const at = head.index + head[0].length;
  return out.slice(0, at) + SCRIPT_TAG + out.slice(at);
}

// Devuelve el cuerpo reescrito (sin comprimir) o null si hay que mandar el
// original tal cual: demasiado grande, codificación desconocida o sin cambios.
export function rewriteBody(kind: RewriteKind, body: Buffer, contentEncoding: string): Buffer | null {
  if (body.length > MAX_REWRITE_BYTES) return null;
  const plain = decode(body, contentEncoding);
  if (!plain || plain.length > MAX_REWRITE_BYTES) return null;
  const text = plain.toString('utf8');
  const next = rewriteText(kind, text);
  return next === text ? null : Buffer.from(next, 'utf8');
}
