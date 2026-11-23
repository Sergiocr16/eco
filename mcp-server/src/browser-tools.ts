// Tools browser_*: manejan el navegador que cada bubble tiene en Eco (el
// <webview> del tab Navegador), el mismo que el usuario ve en vivo. Las ejecuta
// el proceso principal de Electron con el protocolo de depuración del webview
// (sin puertos abiertos); el backend solo valida id + dueño y hace de puente.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute } from 'node:path';
import { z } from 'zod';
import { browserAction } from './client.js';
import { BubbleId, defineTool, textResult, type ToolDef, type ToolResult } from './tool-kit.js';

type PageInfo = { url: string; title: string; loading: boolean; cursor: number };

type TabInfo = { tabId: string; active: boolean; url: string; title: string; loading: boolean };

const TabId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional()
  .describe('Pestaña del navegador de la bubble (default: la activa). Los ids salen de browser_open.');
const Ref = z.string().regex(/^e\d{1,7}$/).optional()
  .describe('Ref de browser_snapshot (p.ej. "e12"). Es la forma más confiable de apuntar a un elemento.');
const Selector = z.string().min(1).max(500).optional()
  .describe('Selector CSS (usa el primer elemento visible que coincida).');
const ByText = z.string().min(1).max(300).optional()
  .describe('Texto visible del elemento (contiene, sin distinguir mayúsculas). Prioriza controles: botones, links, opciones de menú.');
const Exact = z.boolean().optional().describe('Con text: exige el texto exacto en vez de "contiene".');

function locator(a: { ref?: string; selector?: string; text?: string; exact?: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.ref) out.ref = a.ref;
  if (a.selector) out.selector = a.selector;
  if (a.text) out.text = a.text;
  if (a.exact) out.exact = true;
  return out;
}

function pageLine(r: PageInfo): string {
  return `Página: ${r.title ? `"${r.title}" ` : ''}${r.url || '(vacía)'}${r.loading ? ' (cargando)' : ''} · cursor ${r.cursor}`;
}

function tabsBlock(tabs: TabInfo[]): string {
  if (tabs.length === 0) return 'Pestañas: ninguna abierta.';
  return `Pestañas:\n${tabs.map((t) => `  ${t.active ? '•' : ' '} ${t.tabId} — ${t.title ? `"${t.title}" ` : ''}${t.url || '(vacía)'}${t.active ? ' [activa]' : ''}${t.loading ? ' (cargando)' : ''}`).join('\n')}`;
}

type ViewInfo = { driver: 'desktop'; mirrorViewers: number; uiClients: number };

// Qué navegador se maneja y quién lo está viendo, para que el agente lo pueda decir.
function viewLine(v?: ViewInfo): string {
  if (!v) return '';
  const who = v.mirrorViewers > 0
    ? `${v.mirrorViewers} cliente(s) remoto(s) (web / iPad) lo están viendo en vivo por el espejo`
    : 'ningún cliente remoto lo está mirando ahora (el espejo se activa al abrir el tab Navegador de la bubble en ese cliente)';
  return `Vista: el navegador de la bubble en la app de escritorio de Eco (la Mac donde corre Eco); ${who}.`;
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const browserOpenTool = defineTool(
  'browser_open',
  'Muestra el navegador de la bubble en Eco (abre la bubble y su tab Navegador, el usuario lo ve en vivo) y, con url, navega ahí ' +
  'esperando la carga. Es el primer paso antes de las demás tools browser_*; también sirve para traerlo al frente si quedó oculto. ' +
  'Devuelve URL, título, pestañas y el cursor de consola/red.',
  z.object({
    bubble_id: BubbleId,
    url: z.string().url().max(4000).optional().describe('URL a abrir (http/https). Sin url muestra lo que ya tenga.'),
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { tabs?: TabInfo[]; loaded?: boolean; view?: ViewInfo }>(args.bubble_id, 'open', args.url ? { url: args.url } : {}, args.tab_id);
    const lines = [`Navegador de la bubble ${args.bubble_id} visible en Eco.`, pageLine(r)];
    if (r.loaded === false) lines.push('La página siguió cargando después del tiempo de espera.');
    if (r.tabs) lines.push(tabsBlock(r.tabs));
    lines.push(viewLine(r.view));
    return textResult(lines.filter(Boolean).join('\n'));
  },
);

const browserNavigateTool = defineTool(
  'browser_navigate',
  'Navega el navegador de la bubble: a una url, atrás, adelante o recarga. Espera a que la página termine de cargar. ' +
  'Ojo con SPAs: ir a la misma URL cambiando solo el #hash no recarga; usá action "reload".',
  z.object({
    bubble_id: BubbleId,
    url: z.string().url().max(4000).optional().describe('Destino (http/https). Requerido con action "go".'),
    action: z.enum(['go', 'back', 'forward', 'reload']).optional().describe('Default: "go" si hay url, si no "reload".'),
    hard: z.boolean().optional().describe('Con reload: ignora la caché.'),
    wait: z.boolean().optional().describe('Esperar la carga (default true).'),
    timeout_s: z.number().int().min(1).max(120).optional().describe('Tope de espera de la carga (default 30).'),
    tab_id: TabId,
  }),
  async (args) => {
    const action = args.action ?? (args.url ? 'go' : 'reload');
    const r = await browserAction<PageInfo & { loaded?: boolean }>(args.bubble_id, 'navigate', {
      action,
      url: args.url,
      hard: args.hard,
      wait: args.wait === false ? 'none' : 'load',
      timeoutMs: args.timeout_s ? args.timeout_s * 1000 : undefined,
    }, args.tab_id);
    const note = r.loaded === false ? '\nLa página siguió cargando después del tiempo de espera.' : '';
    return textResult(`${action} hecho.\n${pageLine(r)}${note}`);
  },
);

const browserSnapshotTool = defineTool(
  'browser_snapshot',
  'Lista los controles visibles de la página (botones, links, campos, selects, opciones, items de menú) con una ref estable ' +
  '([e12]) más títulos, alertas y diálogos. Usá las refs en browser_click / browser_type / browser_select. Marca valor, ' +
  'deshabilitado, marcado y "fuera de vista". Tomá uno nuevo después de navegar o cuando una ref dé "ya no existe".',
  z.object({
    bubble_id: BubbleId,
    scope: z.string().min(1).max(500).optional().describe('Selector CSS para limitar el snapshot (p.ej. "md-dialog").'),
    include_hidden: z.boolean().optional().describe('Incluir elementos ocultos (default false).'),
    max: z.number().int().min(10).max(1000).optional().describe('Tope de líneas (default 250).'),
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { viewport: string; count: number; truncated: boolean; offscreen: number; lines: string[] }>(
      args.bubble_id, 'snapshot', { scope: args.scope, includeHidden: args.include_hidden, max: args.max }, args.tab_id);
    const head = `${pageLine(r)}\nViewport ${r.viewport} · ${r.count} elementos${r.offscreen ? ` (${r.offscreen} fuera de vista)` : ''}${r.truncated ? ' · recortado, usá scope o max' : ''}`;
    return textResult(`${head}\n\n${r.lines.join('\n') || '(sin controles visibles)'}`);
  },
);

const browserGetTextTool = defineTool(
  'browser_get_text',
  'Texto visible de la página (innerText) o de una sección, para leer contenido: tablas, totales, mensajes.',
  z.object({
    bubble_id: BubbleId,
    scope: z.string().min(1).max(500).optional().describe('Selector CSS de la sección (default: toda la página).'),
    max_chars: z.number().int().min(500).max(200_000).optional().describe('Tope de caracteres (default 20000).'),
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { text: string; truncated: boolean }>(
      args.bubble_id, 'text', { scope: args.scope, maxChars: args.max_chars }, args.tab_id);
    return textResult(`${pageLine(r)}\n\n${r.text || '(sin texto)'}${r.truncated ? '\n\n[texto recortado]' : ''}`);
  },
);

const browserClickTool = defineTool(
  'browser_click',
  'Hace clic real (eventos de mouse del navegador, no element.click()) en un elemento: por ref de browser_snapshot, selector CSS, ' +
  'texto visible o coordenadas x/y del viewport. Hace scroll hasta el elemento. Avisa si otro elemento lo tapa o si está deshabilitado.',
  z.object({
    bubble_id: BubbleId,
    ref: Ref,
    selector: Selector,
    text: ByText,
    exact: Exact,
    x: z.number().min(0).max(20_000).optional().describe('Coordenada X en px CSS del viewport (junto con y, en vez de ref/selector/text).'),
    y: z.number().min(0).max(20_000).optional().describe('Coordenada Y en px CSS del viewport.'),
    double: z.boolean().optional().describe('Doble clic.'),
    button: z.enum(['left', 'right', 'middle']).optional(),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional().describe('Teclas mantenidas durante el clic.'),
    settle_ms: z.number().int().min(0).max(5000).optional().describe('Espera después del clic antes de responder (default 300).'),
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { clicked: string; covered: string | null; disabled: boolean; navigated: boolean }>(
      args.bubble_id, 'click', {
        ...locator(args), x: args.x, y: args.y, double: args.double, button: args.button,
        modifiers: args.modifiers, settleMs: args.settle_ms,
      }, args.tab_id);
    const notes: string[] = [];
    if (r.disabled) notes.push('El elemento está deshabilitado: el clic probablemente no hizo nada.');
    if (r.covered) notes.push(`Ojo: en ese punto había otro elemento encima (${r.covered}); el clic le llegó a ese.`);
    if (r.navigated) notes.push('La URL cambió.');
    return textResult([`Clic en ${r.clicked}.`, ...notes, pageLine(r)].join('\n'));
  },
);

const browserTypeTool = defineTool(
  'browser_type',
  'Escribe en un campo (input, textarea, contenteditable, o el input dentro de un md-input-container): lo enfoca, por default ' +
  'reemplaza lo que tenga y dispara los eventos de input reales (ng-model se entera). Sin ref/selector/text escribe en el campo ' +
  'enfocado. Para claves: el valor no se repite en la respuesta.',
  z.object({
    bubble_id: BubbleId,
    value: z.string().max(20_000).describe('Texto a escribir ("" con clear borra el campo).'),
    ref: Ref,
    selector: Selector,
    text: ByText,
    exact: Exact,
    clear: z.boolean().optional().describe('Reemplazar el contenido actual (default true).'),
    submit: z.boolean().optional().describe('Apretar Enter al final.'),
    slowly: z.boolean().optional().describe('Tecla por tecla (keydown/keyup por carácter) para campos que escuchan teclas; default false.'),
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { typedInto: string; chars: number; submitted: boolean }>(
      args.bubble_id, 'type', {
        ...locator(args), value: args.value, clear: args.clear, submit: args.submit, slowly: args.slowly,
      }, args.tab_id);
    return textResult(`Escribí ${r.chars} caracteres en ${r.typedInto}${r.submitted ? ' y apreté Enter' : ''}.\n${pageLine(r)}`);
  },
);

const browserPressTool = defineTool(
  'browser_press',
  'Aprieta una tecla o combinación en la página: Enter, Tab, Escape, Backspace, Delete, ArrowUp/Down/Left/Right, Home, End, ' +
  'PageUp, PageDown, Space, un carácter, o con modificadores ("Shift+Tab", "Meta+a"). Con ref/selector/text enfoca ese elemento antes.',
  z.object({
    bubble_id: BubbleId,
    key: z.string().min(1).max(40).describe('Tecla o combinación, p.ej. "Enter", "Escape", "Shift+Tab".'),
    times: z.number().int().min(1).max(50).optional().describe('Repeticiones (default 1).'),
    ref: Ref,
    selector: Selector,
    text: ByText,
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { times: number }>(
      args.bubble_id, 'press', { key: args.key, times: args.times, ...locator(args) }, args.tab_id);
    return textResult(`Apreté ${args.key}${r.times > 1 ? ` ×${r.times}` : ''}.\n${pageLine(r)}`);
  },
);

const browserSelectTool = defineTool(
  'browser_select',
  'Elige una opción de un <select> nativo por value o por texto visible (dispara input + change). Para md-select / menús de ' +
  'Angular Material no sirve: abrilo con browser_click y elegí la opción con otro browser_click (browser_snapshot la lista).',
  z.object({
    bubble_id: BubbleId,
    value: z.string().min(1).max(500).describe('Value o texto de la opción.'),
    ref: Ref,
    selector: Selector,
    text: ByText,
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { target: string; selected: string }>(
      args.bubble_id, 'select', { ...locator(args), value: args.value }, args.tab_id);
    return textResult(`En ${r.target} quedó elegida "${r.selected}".\n${pageLine(r)}`);
  },
);

const browserWaitForTool = defineTool(
  'browser_wait_for',
  'Espera una condición en la página: que aparezca (o desaparezca con gone) un texto, un selector o una ref; que una expresión ' +
  'JS sea verdadera; y/o que la red quede ociosa. Usalo después de acciones que cargan datos en vez de esperas fijas.',
  z.object({
    bubble_id: BubbleId,
    text: z.string().min(1).max(500).optional().describe('Texto que debe aparecer en la página.'),
    selector: Selector,
    ref: Ref,
    expression: z.string().min(1).max(5000).optional().describe('Expresión JS que debe dar verdadero (p.ej. "!document.querySelector(\'.skeleton\')").'),
    gone: z.boolean().optional().describe('Esperar a que la condición deje de cumplirse (texto/elemento desaparece).'),
    network_idle: z.boolean().optional().describe('Además, sin requests en curso por idle_ms.'),
    idle_ms: z.number().int().min(100).max(10_000).optional().describe('Ventana de red ociosa (default 500).'),
    timeout_s: z.number().int().min(1).max(120).optional().describe('Tope (default 15).'),
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { elapsedMs: number }>(args.bubble_id, 'wait_for', {
      text: args.text, selector: args.selector, ref: args.ref, expression: args.expression, gone: args.gone,
      networkIdle: args.network_idle, idleMs: args.idle_ms, timeoutMs: args.timeout_s ? args.timeout_s * 1000 : undefined,
    }, args.tab_id);
    return textResult(`Condición cumplida en ${(r.elapsedMs / 1000).toFixed(1)} s.\n${pageLine(r)}`);
  },
);

const browserEvalTool = defineTool(
  'browser_eval',
  'Evalúa una expresión JavaScript en la página (contexto de la página: window, document, angular, localStorage) y devuelve el ' +
  'resultado serializado a JSON. Espera promesas. Para varias sentencias usá una IIFE: "(() => { ...; return x; })()".',
  z.object({
    bubble_id: BubbleId,
    expression: z.string().min(1).max(100_000).describe('Expresión JS.'),
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<PageInfo & { type: string; value: string; truncated: boolean }>(
      args.bubble_id, 'eval', { expression: args.expression }, args.tab_id);
    return textResult(`Resultado (${r.type}):\n${r.value}${r.truncated ? '\n[recortado]' : ''}\n\n${pageLine(r)}`);
  },
);

const browserScreenshotTool = defineTool(
  'browser_screenshot',
  'Captura el navegador de la bubble y la devuelve como imagen: el viewport (default), la página completa o un elemento ' +
  '(ref/selector/text). Con save_to además la guarda en esa ruta absoluta (.png / .jpg). Necesita el navegador visible en Eco.',
  z.object({
    bubble_id: BubbleId,
    ref: Ref,
    selector: Selector,
    text: ByText,
    full_page: z.boolean().optional().describe('Toda la página del documento (no sirve en apps cuyo scroll es un div interno).'),
    format: z.enum(['png', 'jpeg']).optional().describe('Default png.'),
    quality: z.number().int().min(10).max(100).optional().describe('Calidad jpeg (default 80).'),
    hi_dpi: z.boolean().optional().describe('Resolución de pantalla retina (default: 1 px por px CSS).'),
    save_to: z.string().min(2).max(4096).optional().describe('Ruta absoluta donde guardar el archivo (se crean las carpetas).'),
    return_image: z.boolean().optional().describe('Devolver la imagen en la respuesta (default true). false con save_to ahorra contexto.'),
    tab_id: TabId,
  }),
  async (args): Promise<ToolResult> => {
    const format = args.format ?? (args.save_to && /\.jpe?g$/i.test(args.save_to) ? 'jpeg' : 'png');
    if (args.save_to) {
      if (!isAbsolute(args.save_to)) return textResult('save_to tiene que ser una ruta absoluta.');
      const ext = extname(args.save_to).toLowerCase();
      if (!['.png', '.jpg', '.jpeg'].includes(ext)) return textResult('save_to tiene que terminar en .png, .jpg o .jpeg.');
    }
    const r = await browserAction<PageInfo & { data: string; mimeType: string; width: number; height: number; target: string }>(
      args.bubble_id, 'screenshot', {
        ...locator(args), fullPage: args.full_page, format, quality: args.quality, hiDpi: args.hi_dpi,
      }, args.tab_id);
    const lines = [`Captura de ${r.target} (${r.width}×${r.height}).`, pageLine(r)];
    if (args.save_to) {
      mkdirSync(dirname(args.save_to), { recursive: true });
      writeFileSync(args.save_to, Buffer.from(r.data, 'base64'));
      lines.push(`Guardada en ${args.save_to}`);
    }
    const content: ToolResult['content'] = [{ type: 'text', text: lines.join('\n') }];
    if (args.return_image !== false || !args.save_to) content.push({ type: 'image', data: r.data, mimeType: r.mimeType });
    return { content };
  },
);

type ConsoleEntry = { seq: number; ts: number; level: string; source: string; text: string; url: string; line: number };

const browserConsoleTool = defineTool(
  'browser_console',
  'Mensajes de consola del navegador de la bubble: console.*, excepciones no capturadas y errores del navegador (red, CSP). ' +
  'La captura arranca con la primera tool browser_* sobre esa página. Pasá since = cursor de una respuesta anterior para ver solo lo nuevo.',
  z.object({
    bubble_id: BubbleId,
    since: z.number().int().min(0).optional().describe('Cursor: solo mensajes posteriores (lo devuelven todas las tools browser_*).'),
    level: z.enum(['debug', 'info', 'warning', 'error']).optional().describe('Nivel mínimo (default info).'),
    pattern: z.string().min(1).max(500).optional().describe('Regex (sin distinguir mayúsculas) sobre el texto o la URL.'),
    limit: z.number().int().min(1).max(1000).optional().describe('Máximo de mensajes, los más recientes (default 100).'),
    tab_id: TabId,
  }),
  async (args) => {
    const r = await browserAction<{ entries: ConsoleEntry[]; matched: number; cursor: number; capturingSince: string; url: string }>(
      args.bubble_id, 'console', { since: args.since, level: args.level, pattern: args.pattern, limit: args.limit }, args.tab_id);
    const head = `Consola de ${r.url} — ${r.matched} mensaje(s)${r.matched > r.entries.length ? `, se muestran los últimos ${r.entries.length}` : ''}. Captura desde ${r.capturingSince}. cursor ${r.cursor}`;
    if (r.entries.length === 0) return textResult(`${head}\n(sin mensajes)`);
    const lines = r.entries.map((e) => {
      const where = e.url ? ` — ${clip(e.url.replace(/^https?:\/\/[^/]+/, ''), 100)}${e.line ? `:${e.line}` : ''}` : '';
      const time = new Date(e.ts).toISOString().slice(11, 19);
      return `[${e.seq}] ${e.level.toUpperCase()} ${time} (${e.source}) ${clip(e.text, 2000)}${where}`;
    });
    return textResult(`${head}\n${lines.join('\n')}`);
  },
);

type NetEntry = {
  seq: number; ts: number; requestId: string; method: string; url: string; type: string; status: number;
  statusText: string; mimeType: string; failed: boolean; errorText: string; done: boolean; durationMs: number | null;
  redirected?: boolean; hasPostData: boolean;
};

const browserNetworkTool = defineTool(
  'browser_network',
  'Requests del navegador de la bubble (método, URL, status, tipo, duración). Filtrá por url_pattern, método, only_errors (≥400 o ' +
  'fallidos) u only_api (XHR/fetch). Con request_id devuelve el detalle: cuerpo enviado y cuerpo de la respuesta. ' +
  'Pasá since = cursor para ver solo lo posterior a una acción.',
  z.object({
    bubble_id: BubbleId,
    since: z.number().int().min(0).optional().describe('Cursor: solo requests posteriores.'),
    url_pattern: z.string().min(1).max(500).optional().describe('Regex sobre la URL (sin distinguir mayúsculas), p.ej. "/api/".'),
    method: z.string().min(3).max(10).optional().describe('GET, POST, PUT, DELETE…'),
    only_errors: z.boolean().optional().describe('Solo status ≥ 400 o requests fallidos.'),
    only_api: z.boolean().optional().describe('Solo XHR / fetch.'),
    limit: z.number().int().min(1).max(1000).optional().describe('Máximo, los más recientes (default 100).'),
    request_id: z.string().min(1).max(200).optional().describe('Id de un request de la lista: devuelve cuerpos de request y response.'),
    tab_id: TabId,
  }),
  async (args) => {
    if (args.request_id) {
      const d = await browserAction<{ entry: NetEntry; requestBody: string; responseBody: string; bodyNote: string }>(
        args.bubble_id, 'network', { requestId: args.request_id }, args.tab_id);
      const e = d.entry;
      const out = [
        `${e.method} ${e.url}`,
        `Status: ${e.failed ? `FALLÓ (${e.errorText})` : `${e.status} ${e.statusText}`} · ${e.type} · ${e.mimeType || '?'}${e.durationMs !== null ? ` · ${e.durationMs} ms` : ''}`,
      ];
      if (d.requestBody) out.push(`\nCuerpo enviado:\n${d.requestBody}`);
      if (d.responseBody) out.push(`\nRespuesta:\n${d.responseBody}`);
      if (d.bodyNote) out.push(`\n(${d.bodyNote})`);
      return textResult(out.join('\n'));
    }
    const r = await browserAction<{ entries: NetEntry[]; matched: number; inflight: number; cursor: number; capturingSince: string; url: string }>(
      args.bubble_id, 'network', {
        since: args.since, urlPattern: args.url_pattern, method: args.method, onlyErrors: args.only_errors,
        onlyApi: args.only_api, limit: args.limit,
      }, args.tab_id);
    const head = `Red de ${r.url} — ${r.matched} request(s)${r.matched > r.entries.length ? `, se muestran los últimos ${r.entries.length}` : ''}, ${r.inflight} en curso. Captura desde ${r.capturingSince}. cursor ${r.cursor}`;
    if (r.entries.length === 0) return textResult(`${head}\n(sin requests)`);
    const lines = r.entries.map((e) => {
      const status = e.failed ? `FALLÓ ${e.errorText}` : (e.done || e.status ? String(e.status || '…') : '…');
      const dur = e.durationMs !== null ? `, ${e.durationMs} ms` : '';
      return `[${e.seq}] ${status} ${e.method} ${clip(e.url, 200)} (${e.type || '?'}${dur}${e.redirected ? ', redirect' : ''}${e.hasPostData ? ', con body' : ''}) id=${e.requestId}`;
    });
    return textResult(`${head}\n${lines.join('\n')}`);
  },
);

type TabsResult = { tabs: TabInfo[]; view?: ViewInfo };

const browserTabsTool = defineTool(
  'browser_tabs',
  'Lista las pestañas del navegador de la bubble (id, URL, título, cuál está activa) y dice qué vista se está manejando ' +
  '(siempre el navegador de la app de escritorio) y si algún cliente remoto la está mirando. Los ids sirven como tab_id en las demás tools.',
  z.object({ bubble_id: BubbleId }),
  async (args) => {
    const r = await browserAction<TabsResult>(args.bubble_id, 'tabs');
    return textResult([tabsBlock(r.tabs), viewLine(r.view)].filter(Boolean).join('\n'));
  },
);

const browserTabNewTool = defineTool(
  'browser_tab_new',
  'Abre una pestaña nueva en el navegador de la bubble (visible en la barra de pestañas de Eco y en el espejo de los clientes ' +
  'remotos), la deja activa y devuelve su tab_id. Con isolated usa una sesión limpia (sin cookies ni localStorage de las otras ' +
  'pestañas): sirve para entrar con otro usuario en paralelo. Cerrala con browser_tab_close cuando no haga falta.',
  z.object({
    bubble_id: BubbleId,
    url: z.string().url().max(4000).optional().describe('URL a abrir (http/https). Sin url queda en blanco.'),
    isolated: z.boolean().optional().describe('Sesión nueva y aislada (default: comparte la sesión de la bubble).'),
  }),
  async (args) => {
    const r = await browserAction<PageInfo & TabsResult & { tabId?: string }>(args.bubble_id, 'tab_new', { url: args.url, isolated: args.isolated });
    const id = r.tabId ?? r.tabs.find((t) => t.active)?.tabId ?? '?';
    return textResult([`Pestaña nueva ${id} abierta y activa.`, pageLine(r), tabsBlock(r.tabs), viewLine(r.view)].filter(Boolean).join('\n'));
  },
);

const browserTabSelectTool = defineTool(
  'browser_tab_select',
  'Cambia la pestaña activa del navegador de la bubble (la que se ve en Eco y sobre la que actúan las tools sin tab_id).',
  z.object({ bubble_id: BubbleId, tab_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).describe('Id de browser_tabs.') }),
  async (args) => {
    const r = await browserAction<PageInfo & TabsResult>(args.bubble_id, 'tab_select', {}, args.tab_id);
    return textResult([`Pestaña ${args.tab_id} activa.`, pageLine(r), tabsBlock(r.tabs), viewLine(r.view)].filter(Boolean).join('\n'));
  },
);

const browserTabCloseTool = defineTool(
  'browser_tab_close',
  'Cierra una pestaña del navegador de la bubble. Cerrá solo las que abriste vos con browser_tab_new.',
  z.object({ bubble_id: BubbleId, tab_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).describe('Id de browser_tabs.') }),
  async (args) => {
    const r = await browserAction<TabsResult>(args.bubble_id, 'tab_close', {}, args.tab_id);
    return textResult([`Pestaña ${args.tab_id} cerrada.`, tabsBlock(r.tabs)].join('\n'));
  },
);

export const BROWSER_TOOLS: ToolDef[] = [
  browserOpenTool,
  browserTabsTool,
  browserTabNewTool,
  browserTabSelectTool,
  browserTabCloseTool,
  browserNavigateTool,
  browserSnapshotTool,
  browserGetTextTool,
  browserClickTool,
  browserTypeTool,
  browserPressTool,
  browserSelectTool,
  browserWaitForTool,
  browserEvalTool,
  browserScreenshotTool,
  browserConsoleTool,
  browserNetworkTool,
];
