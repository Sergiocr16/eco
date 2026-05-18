// Renderer markdown minimalista para el preview de notas.
//
// Soporta: headings 1-6, ul/ol, **bold**, *italic*, `inline code`,
// ```code blocks```, > blockquote, [link](url), --- hr, párrafos.
//
// XSS-safe: TODO el texto se escapa con escapeHtml ANTES de aplicar
// reglas. El output del componente se inserta vía dangerouslySetInnerHTML
// porque las reglas generan tags, pero ningún input del usuario llega
// como HTML — solo como texto escapado.
//
// NO soporta tablas, footnotes, ni HTML raw (que es intencional —
// las notas son personales, no hay use-case de render HTML).

import { useMemo } from 'react';
import { useTokens } from '@/design/theme';

type Props = {
  source: string;
};

export function MarkdownPreview({ source }: Props) {
  const t = useTokens();
  const html = useMemo(() => renderMarkdown(source), [source]);
  return (
    <div
      className="eco-md-preview"
      style={{
        padding: '16px 20px', overflow: 'auto', flex: 1, minHeight: 0,
        fontFamily: t.fontSans, fontSize: 14, lineHeight: 1.6,
        color: t.text0, background: t.bg1,
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Convierte URL escapada en attribute href seguro (solo http/https/mailto).
function safeHref(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return escapeHtml(trimmed);
  return '#';
}

// Aplica inline rules sobre una línea YA escapada.
function inline(s: string): string {
  return s
    // inline code: `code`
    .replace(/`([^`\n]+)`/g, (_m, code) => `<code class="md-inline-code">${code}</code>`)
    // bold: **text**
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // italic: *text* (después de bold para no romperlo)
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    // link: [text](url)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => `<a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`);
}

function renderMarkdown(src: string): string {
  if (!src) return '';
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Code block: ```lang
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i++;
      }
      i++; // saltar el ```  de cierre
      const escaped = escapeHtml(buf.join('\n'));
      const langClass = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      out.push(`<pre class="md-codeblock"${langClass}><code>${escaped}</code></pre>`);
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = inline(escapeHtml(headingMatch[2]!));
      out.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
      out.push('<hr/>');
      i++;
      continue;
    }

    // Blockquote (multi-line). Junta consecutivas > líneas.
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) {
        buf.push(lines[i]!.replace(/^\s*>\s?/, ''));
        i++;
      }
      const content = inline(escapeHtml(buf.join(' ')));
      out.push(`<blockquote>${content}</blockquote>`);
      continue;
    }

    // Listas. Junta líneas consecutivas que matchean - * o N.
    const ulMatch = /^(\s*)([-*+])\s+(.+)$/.exec(line);
    const olMatch = /^(\s*)(\d+)\.\s+(.+)$/.exec(line);
    if (ulMatch || olMatch) {
      const ordered = !!olMatch;
      const buf: string[] = [];
      while (i < lines.length) {
        const cur = lines[i]!;
        const u = /^(\s*)([-*+])\s+(.+)$/.exec(cur);
        const o = /^(\s*)(\d+)\.\s+(.+)$/.exec(cur);
        if (ordered && o) buf.push(o[3]!);
        else if (!ordered && u) buf.push(u[3]!);
        else break;
        i++;
      }
      const items = buf.map((b) => `<li>${inline(escapeHtml(b))}</li>`).join('');
      out.push(ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`);
      continue;
    }

    // Línea vacía → fin de párrafo (lo manejamos juntando líneas en párrafo).
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Párrafo: junta líneas consecutivas no-vacías que no matchean otras rules.
    const paraBuf: string[] = [];
    while (i < lines.length) {
      const cur = lines[i]!;
      if (cur.trim() === '') break;
      if (/^```/.test(cur)) break;
      if (/^#{1,6}\s+/.test(cur)) break;
      if (/^\s*---+\s*$/.test(cur) || /^\s*\*\*\*+\s*$/.test(cur)) break;
      if (/^\s*>\s?/.test(cur)) break;
      if (/^(\s*)([-*+])\s+/.test(cur)) break;
      if (/^(\s*)(\d+)\.\s+/.test(cur)) break;
      paraBuf.push(cur);
      i++;
    }
    if (paraBuf.length > 0) {
      const text = inline(escapeHtml(paraBuf.join(' ')));
      out.push(`<p>${text}</p>`);
    }
  }

  return out.join('\n');
}
