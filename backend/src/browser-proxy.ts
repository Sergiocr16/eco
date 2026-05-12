// Proxy de páginas web para el navegador interno.
// Strip de X-Frame-Options / Content-Security-Policy / Permissions-Policy para
// permitir embedding en iframe. NO es un proxy completo — solo pasa el HTML
// inicial e inyecta <base href> para que recursos relativos vayan al sitio
// original. JS pesado (Google, banks) seguirá rompiendo: para esos, abrir en
// el navegador del sistema.
//
// SSRF guards: solo http/https públicos. Bloqueamos protocolos no-http
// y dejamos al usuario decidir si abre localhost (útil para dev).

import type { Request, Response } from 'express';

const STRIPPED_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'permissions-policy',
  'frame-options',
  // Estos vienen del cliente y los re-escribimos manualmente:
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]);

function validateUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch { return null; }
}

export async function proxyPage(req: Request, res: Response): Promise<void> {
  // Helmet por defecto setea X-Frame-Options: SAMEORIGIN. El padre del iframe
  // ES same-origin (Eco mismo), así que con SAMEORIGIN funciona. Aún así
  // removemos explícitamente por si la config cambia en el futuro.
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');

  const target = typeof req.query.url === 'string' ? req.query.url : '';
  const u = validateUrl(target);
  if (!u) {
    res.status(400).set('Content-Type', 'text/html').send(
      `<!doctype html><html><body style="font-family:system-ui;padding:24px;color:#222">
       <h2>URL inválida</h2><p>Solo se admiten http(s).</p></body></html>`,
    );
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const upstream = await fetch(u.toString(), {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        // User-agent realista — muchos sitios devuelven distinto a fetch genérico.
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Eco/0.1 Safari/605.1.15',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'es-CR,es;q=0.9,en;q=0.8',
      },
    });

    // Copiar headers — excepto los que rompen el embedding o el transporte.
    upstream.headers.forEach((value, key) => {
      if (!STRIPPED_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.status(upstream.status);

    const ct = upstream.headers.get('content-type') ?? '';
    const isHtml = /text\/html|application\/xhtml/i.test(ct);

    if (isHtml) {
      // Inyectamos <base href="..."> para resources relativos + script puente
      // que reescribe clicks en <a> para que la navegación se quede dentro
      // del proxy (postMessage hacia el padre).
      let body = await upstream.text();
      const baseHref = `${u.origin}${u.pathname.replace(/[^/]*$/, '')}`;
      const baseTag = `<base href="${baseHref}">`;
      // Script puente: intercepta clicks/submits y postMessage al parent para
      // que el navegador interno actualice su URL bar y navegue por el proxy.
      const bridgeScript = `<script>(function(){
        function abs(href){try{return new URL(href, document.baseURI).href}catch(_){return null}}
        document.addEventListener('click', function(ev){
          var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
          if (!a) return;
          var u = abs(a.getAttribute('href')); if (!u) return;
          if (!/^https?:/i.test(u)) return;
          if (a.target === '_blank') return; // dejá pop-ups al sistema
          ev.preventDefault();
          parent.postMessage({ kind: 'eco-browser:nav', url: u }, '*');
        }, true);
        document.addEventListener('submit', function(ev){
          var f = ev.target; if (!f || !f.action) return;
          var u = abs(f.action); if (!u || !/^https?:/i.test(u)) return;
          if ((f.method||'GET').toUpperCase() !== 'GET') return;
          ev.preventDefault();
          var fd = new FormData(f);
          var qs = new URLSearchParams(fd).toString();
          parent.postMessage({ kind: 'eco-browser:nav', url: u + (u.indexOf('?')>=0?'&':'?') + qs }, '*');
        }, true);
      })();</script>`;
      if (/<head[^>]*>/i.test(body)) {
        body = body.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${bridgeScript}`);
      } else {
        body = `${baseTag}${bridgeScript}${body}`;
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.send(body);
    } else {
      // No-HTML — devolver bytes tal cual (imágenes, PDFs, etc.).
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).set('Content-Type', 'text/html').send(
      `<!doctype html><html><body style="font-family:system-ui;padding:24px;color:#222">
       <h2>No se pudo cargar</h2>
       <p style="color:#666;font-size:13px">${escapeHtml(msg)}</p>
       <p>Probá abrir el sitio en tu navegador del sistema con el botón ↗.</p>
       </body></html>`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
