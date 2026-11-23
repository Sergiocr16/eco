// Código que corre DENTRO de la página del webview para las tools browser_*
// (snapshot con refs, resolución de elementos, foco, selects, esperas). Se
// inyecta con Runtime.evaluate como texto, así que `ecoPageLib` no puede usar
// nada de fuera de su cuerpo. Los errores viajan como "ECO:<code>:<msg>".


/* eslint-disable */
function ecoPageLib() {
  const INTERACTIVE = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[contenteditable=""]', '[contenteditable=true]',
    '[role=button]', '[role=link]', '[role=checkbox]', '[role=radio]', '[role=tab]', '[role=menuitem]',
    '[role=option]', '[role=switch]', '[role=combobox]', '[role=textbox]', '[role=searchbox]', '[role=slider]',
    '[role=treeitem]',
    'md-button', 'md-select', 'md-checkbox', 'md-radio-button', 'md-switch', 'md-option', 'md-menu-item',
    'md-tab-item', 'md-autocomplete', 'md-datepicker',
    '[ng-click]', '[data-ng-click]', '[ui-sref]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const LANDMARK = 'h1,h2,h3,h4,[role=heading],[role=alert],[role=alertdialog],[role=dialog],md-toast,md-dialog';

  const fail = (code, msg) => { throw new Error('ECO:' + code + ':' + msg); };
  const clean = (s, max) => {
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return max && t.length > max ? t.slice(0, max - 1) + '…' : t;
  };

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function labelText(el) {
    const al = el.getAttribute('aria-label');
    if (al) return al;
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => { const n = document.getElementById(id); return n ? n.innerText : ''; }).join(' ').trim();
      if (t) return t;
    }
    if (el.id) {
      try {
        const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (l && l.innerText.trim()) return l.innerText;
      } catch (e) { /* id raro */ }
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'md-select') {
      const wrap = el.closest('label');
      if (wrap && wrap.innerText.trim()) return wrap.innerText;
      const mic = el.closest('md-input-container');
      if (mic) { const l = mic.querySelector('label'); if (l && l.innerText.trim()) return l.innerText; }
    }
    return '';
  }

  function nameOf(el, max) {
    const tag = el.tagName.toLowerCase();
    let n = labelText(el);
    if (!n && (tag === 'input' || tag === 'textarea')) n = el.getAttribute('placeholder') || '';
    if (!n && tag === 'input' && /^(button|submit|reset)$/i.test(el.type)) n = el.value;
    if (!n && tag !== 'input' && tag !== 'textarea' && tag !== 'select') n = el.innerText || '';
    if (!n) n = el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || '';
    if (!n) {
      const img = el.querySelector('img[alt]');
      if (img) n = img.getAttribute('alt');
    }
    if (!n) {
      const icon = el.querySelector('md-icon, .material-icons, i[class*="icon"]');
      if (icon) n = 'icono ' + (clean(icon.textContent) || icon.getAttribute('md-svg-icon') || icon.className || '');
    }
    return clean(n, max === undefined ? 80 : max);
  }

  function roleOf(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'md-button' || tag === 'summary') return 'button';
    if (tag === 'select' || tag === 'md-select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'checkbox' || t === 'radio') return t;
      if (/^(button|submit|reset|image)$/.test(t)) return 'button';
      if (t === 'range') return 'slider';
      if (t === 'file') return 'file';
      return 'textbox';
    }
    if (tag === 'md-checkbox' || tag === 'md-switch') return 'checkbox';
    if (tag === 'md-radio-button') return 'radio';
    if (tag === 'md-option') return 'option';
    if (tag === 'md-menu-item') return 'menuitem';
    if (tag === 'md-tab-item') return 'tab';
    if (tag === 'md-datepicker') return 'datepicker';
    if (el.isContentEditable) return 'textbox';
    return el.matches(INTERACTIVE) ? 'clickable' : tag;
  }

  function stateOf(el) {
    const s = [];
    const tag = el.tagName.toLowerCase();
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')) s.push('deshabilitado');
    if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) s.push(el.checked ? 'marcado' : 'sin marcar');
    else {
      const ac = el.getAttribute('aria-checked');
      if (ac) s.push(ac === 'true' ? 'marcado' : 'sin marcar');
    }
    if (el.getAttribute('aria-selected') === 'true') s.push('seleccionado');
    const exp = el.getAttribute('aria-expanded');
    if (exp) s.push(exp === 'true' ? 'expandido' : 'colapsado');
    if (tag === 'input' || tag === 'textarea') {
      const t = (el.type || '').toLowerCase();
      if (t === 'password') { if (el.value) s.push('valor=••••'); }
      else if (!/^(checkbox|radio|button|submit|reset|image|file)$/.test(t)) s.push('valor="' + clean(el.value, 60) + '"');
      if (el.required) s.push('requerido');
    } else if (tag === 'select') {
      const o = el.options[el.selectedIndex];
      s.push('valor="' + clean(o ? o.text : '', 60) + '"', el.options.length + ' opciones');
    } else if (tag === 'md-select') {
      const v = el.querySelector('md-select-value');
      if (v) s.push('valor="' + clean(v.innerText, 60) + '"');
    }
    if (document.activeElement === el) s.push('enfocado');
    return s;
  }

  function refOf(el) {
    let r = el.getAttribute('data-eco-ref');
    if (!r) {
      window.__ecoRefSeq = (window.__ecoRefSeq || 0) + 1;
      r = 'e' + window.__ecoRefSeq;
      el.setAttribute('data-eco-ref', r);
    }
    return r;
  }

  function describe(el) {
    return roleOf(el) + ' "' + nameOf(el, 60) + '"';
  }

  function snapshot(o) {
    o = o || {};
    const root = o.scope ? document.querySelector(o.scope) : document.body;
    if (!root) fail('not_found', 'scope no encontrado: ' + o.scope);
    const max = o.max || 250;
    const vw = innerWidth;
    const vh = innerHeight;
    const lines = [];
    let count = 0;
    let truncated = false;
    let offscreen = 0;
    for (const el of root.querySelectorAll(INTERACTIVE + ',' + LANDMARK)) {
      if (!o.all && !isVisible(el)) continue;
      const interactive = el.matches(INTERACTIVE);
      if (interactive) {
        // Un clickable dentro de otro con el mismo nombre es el mismo control.
        const parent = el.parentElement && el.parentElement.closest(INTERACTIVE);
        if (parent && root.contains(parent) && (o.all || isVisible(parent)) && nameOf(parent) === nameOf(el)) continue;
      }
      if (count >= max) { truncated = true; break; }
      const r = el.getBoundingClientRect();
      const inView = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
      if (!inView) offscreen++;
      if (!interactive) {
        const txt = clean(el.innerText, 160);
        if (!txt) continue;
        const role = /^h\d$/i.test(el.tagName) ? 'heading' : (el.getAttribute('role') || el.tagName.toLowerCase());
        lines.push('- ' + role + ' "' + txt + '"' + (inView ? '' : ' (fuera de vista)'));
      } else {
        const st = stateOf(el);
        if (!inView) st.push('fuera de vista');
        const href = el.tagName === 'A' ? el.getAttribute('href') : (el.getAttribute('ui-sref') ? 'ui-sref=' + el.getAttribute('ui-sref') : '');
        lines.push('[' + refOf(el) + '] ' + roleOf(el) + ' "' + nameOf(el) + '"'
          + (st.length ? ' (' + st.join(', ') + ')' : '')
          + (href && href !== '#' && !/^javascript:/i.test(href) ? ' → ' + clean(href, 80) : ''));
      }
      count++;
    }
    return { url: location.href, title: document.title, viewport: vw + 'x' + vh, count, truncated, offscreen, lines };
  }

  function byText(t) {
    const needle = clean(t.text).toLowerCase();
    if (!needle) fail('invalid_args', 'text vacío');
    const matches = (s) => { const v = clean(s).toLowerCase(); return t.exact ? v === needle : v.includes(needle); };
    const inter = Array.from(document.querySelectorAll(INTERACTIVE))
      .filter((el) => isVisible(el) && matches(nameOf(el, 0)));
    if (inter.length) {
      inter.sort((a, b) => {
        const ea = clean(nameOf(a, 0)).toLowerCase() === needle ? 0 : 1;
        const eb = clean(nameOf(b, 0)).toLowerCase() === needle ? 0 : 1;
        return ea - eb || nameOf(a, 0).length - nameOf(b, 0).length;
      });
      return inter[0];
    }
    // Texto suelto (no es un control): el elemento más chico que lo contiene.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let best = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !isVisible(el) || !matches(el.innerText)) continue;
      if (!best || best.contains(el)) best = el;
    }
    if (!best) fail('not_found', 'no hay ningún elemento visible con el texto "' + t.text + '"');
    return best.closest(INTERACTIVE) || best;
  }

  function resolve(t) {
    if (!t || (!t.ref && !t.selector && !t.text)) fail('invalid_args', 'falta ref, selector o text');
    if (t.ref) {
      const el = document.querySelector('[data-eco-ref="' + String(t.ref).replace(/["\\]/g, '') + '"]');
      if (!el) fail('ref_stale', 'la ref ' + t.ref + ' ya no existe (la página cambió o se recargó): tomá otro browser_snapshot');
      return el;
    }
    if (t.selector) {
      let list;
      try { list = Array.from(document.querySelectorAll(t.selector)); } catch (e) { fail('invalid_args', 'selector CSS inválido: ' + t.selector); }
      if (!list.length) fail('not_found', 'ningún elemento coincide con el selector ' + t.selector);
      return list.find(isVisible) || list[0];
    }
    return byText(t);
  }

  function point(t) {
    if (innerWidth === 0 || innerHeight === 0) fail('hidden', 'el navegador de la bubble está oculto en Eco');
    const el = resolve(t);
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rects = el.getClientRects();
    const r = rects.length ? rects[0] : el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) fail('not_visible', describe(el) + ' existe pero no se ve');
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    const covered = hit && hit !== el && !el.contains(hit) && !hit.contains(el) ? describe(hit) : null;
    return { x, y, target: describe(el), covered, disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true') };
  }

  // Deja el campo enfocado y, con clear, su contenido seleccionado (lo que se
  // tipee después lo reemplaza) o vacío si no viene texto.
  function prepare(f, o) {
    if (!o || !o.clear) return;
    const isField = /^(input|textarea)$/i.test(f.tagName);
    if (o.empty) {
      if (isField) {
        f.value = '';
        f.dispatchEvent(new Event('input', { bubbles: true }));
        f.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (f.isContentEditable) {
        f.textContent = '';
        f.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (isField) {
      try { f.select(); } catch (e) { /* tipo sin selección */ }
      let whole = false;
      try { whole = f.selectionStart === 0 && f.selectionEnd === f.value.length; } catch (e) { whole = false; }
      if (!whole && f.value) {
        f.value = '';
        f.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (f.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(f);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function focus(t) {
    if (!t || (!t.ref && !t.selector && !t.text)) {
      const a = document.activeElement;
      if (!a || a === document.body) fail('not_found', 'no hay ningún campo enfocado: pasá ref, selector o text');
      prepare(a, t);
      return { target: describe(a) };
    }
    const el = resolve(t);
    let f = el;
    if (!/^(input|textarea|select)$/i.test(el.tagName) && !el.isContentEditable) {
      const inner = el.querySelector('input:not([type=hidden]),textarea,[contenteditable=""],[contenteditable=true]');
      if (inner) f = inner;
    }
    f.scrollIntoView({ block: 'center', behavior: 'instant' });
    f.focus();
    if (document.activeElement !== f && !f.contains(document.activeElement)) fail('not_focusable', describe(f) + ' no acepta el foco');
    prepare(f, t);
    return { target: describe(f) };
  }

  function selectOption(o) {
    const el = resolve(o);
    if (el.tagName !== 'SELECT') {
      fail('not_select', describe(el) + ' no es un <select> nativo: abrilo con browser_click y elegí la opción con otro browser_click');
    }
    const want = clean(o.value).toLowerCase();
    const opts = Array.from(el.options);
    const opt = opts.find((x) => x.value.toLowerCase() === want)
      || opts.find((x) => clean(x.text).toLowerCase() === want)
      || opts.find((x) => clean(x.text).toLowerCase().includes(want));
    if (!opt) fail('not_found', 'la opción "' + o.value + '" no existe. Opciones: ' + opts.slice(0, 40).map((x) => clean(x.text, 40)).join(' | '));
    el.value = opt.value;
    opt.selected = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { target: describe(el), selected: clean(opt.text, 80) };
  }

  function check(o) {
    if (o.text) {
      const body = document.body ? document.body.innerText : '';
      return { found: clean(body).toLowerCase().includes(clean(o.text).toLowerCase()) };
    }
    try {
      return { found: isVisible(resolve(o)) };
    } catch (e) {
      if (/ECO:(not_found|ref_stale):/.test(e.message)) return { found: false };
      throw e;
    }
  }

  function text(o) {
    o = o || {};
    const root = o.scope ? document.querySelector(o.scope) : document.body;
    if (!root) fail('not_found', 'scope no encontrado: ' + o.scope);
    const t = root.innerText || '';
    const max = o.max || 20000;
    return { url: location.href, title: document.title, text: t.length > max ? t.slice(0, max) : t, truncated: t.length > max };
  }

  function viewport() {
    return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1, sx: scrollX, sy: scrollY };
  }

  function rectOf(t) {
    const el = resolve(t);
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, dpr: devicePixelRatio || 1, target: describe(el) };
  }

  return { snapshot, point, focus, selectOption, check, text, viewport, rectOf };
}
/* eslint-enable */

module.exports = { PAGE_LIB_SRC: ecoPageLib.toString() };
