import { type ReactNode, Fragment } from 'react';
import { useTokens } from '@/design/theme';

// Mini-renderer de Markdown enfocado en comentarios de GitHub PR. Cubre
// los casos comunes sin pretender ser un parser CommonMark completo:
//  - Headings #/##/###/####
//  - Code blocks ```lang ... ``` (con label de lenguaje)
//  - Code inline `code`
//  - Bold **text** / Italic *text* / Strike ~~text~~
//  - Listas - / * / + y 1. 2. 3.
//  - Blockquotes >
//  - Links [text](url) (autolink http(s)://...)
//  - @user mention (sin link, solo highlight)
//  - #123 issue/PR ref (sin link)
//  - HR ---
//  - Imágenes ![alt](url) (renderizadas inline con max-width)
//
// Decisiones explícitas:
//  - Sin sanitización pesada: dependemos de React (escapa HTML por default).
//  - URLs de imagen: solo http(s) o data:image. Cualquier otra URL se
//    renderiza como link de texto en lugar.
//  - No soportamos tablas (raro en comentarios PR, mucho código por poco
//    valor). Tampoco HTML embebido (peligroso sin sanitizer).

// Pre-procesa el source antes de parsear. GitHub permite HTML embebido en
// comentarios (los links de Notion, integraciones tipo Linear, etc. lo usan
// mucho). Convertimos los tags comunes a markdown y strippeamos el resto.
// No usamos dangerouslySetInnerHTML — la sanitización es por allowlist.
function htmlToMd(input: string): string {
  let s = input;
  // <a href="URL">TEXT</a> → [TEXT](URL). target/rel/style ignorados.
  s = s.replace(/<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_m, url, text) => `[${(text || url).replace(/\s+/g, ' ').trim()}](${url})`);
  // <img src="URL" alt="TEXT"> → ![TEXT](URL)
  s = s.replace(/<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/gi, (m, url) => {
    const altMatch = /alt\s*=\s*["']([^"']*)["']/i.exec(m);
    return `![${altMatch ? altMatch[1] : ''}](${url})`;
  });
  // <br>, <br/>, <br /> → newline
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // <code>X</code> → `X`
  s = s.replace(/<code>([\s\S]*?)<\/code\s*>/gi, (_m, x) => '`' + String(x).replace(/`/g, '\\`') + '`');
  // <strong>X</strong> / <b>X</b> → **X**
  s = s.replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)\s*>/gi, '**$1**');
  // <em>X</em> / <i>X</i> → *X*
  s = s.replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)\s*>/gi, '*$1*');
  // <del>X</del> / <s>X</s> / <strike>X</strike> → ~~X~~
  s = s.replace(/<(?:del|s|strike)>([\s\S]*?)<\/(?:del|s|strike)\s*>/gi, '~~$1~~');
  // <details><summary>HEAD</summary>BODY</details> → heading + body
  s = s.replace(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details\s*>/gi,
    (_m, head, body) => `\n**${String(head).trim()}**\n\n${body}\n`);
  // Cualquier otro tag HTML → lo eliminamos preservando el contenido.
  // Esto cubre <p>, <div>, <span>, <ul>, <li>, etc. que GitHub a veces
  // mete por integraciones — el contenido sigue legible aunque pierda
  // semántica.
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  // Decode de entidades HTML básicas que GitHub puede escapar en el body.
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return s;
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; lang: string; body: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'para'; text: string }
  | { type: 'hr' };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Code block ``` ... ```
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        body.push(lines[i] ?? '');
        i++;
      }
      i++; // saltar cierre ```
      blocks.push({ type: 'code', lang, body: body.join('\n') });
      continue;
    }

    // Heading
    const h = /^(#{1,4})\s+(.+)$/.exec(line);
    if (h) {
      blocks.push({ type: 'heading', level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        body.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: body.join('\n') });
      continue;
    }

    // List
    const ulMatch = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const olMatch = /^(\s*)\d+\.\s+(.*)$/.exec(line);
    if (ulMatch || olMatch) {
      const ordered = !!olMatch;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? '';
        const m = ordered ? /^(\s*)\d+\.\s+(.*)$/.exec(l) : /^(\s*)[-*+]\s+(.*)$/.exec(l);
        if (!m) break;
        items.push(m[2]!);
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Empty
    if (!line.trim()) { i++; continue; }

    // Paragraph (acumula hasta línea vacía o block-starter)
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (!l.trim()) break;
      if (l.startsWith('```')) break;
      if (/^#{1,4}\s+/.test(l)) break;
      if (l.startsWith('>')) break;
      if (/^\s*[-*+]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) break;
      if (/^(?:---|\*\*\*|___)\s*$/.test(l)) break;
      para.push(l);
      i++;
    }
    blocks.push({ type: 'para', text: para.join('\n') });
  }
  return blocks;
}

// Renderiza texto inline con bold/italic/code/strike/links/mentions/refs.
// Estrategia: extraer primero los segmentos protegidos (code inline) para
// que no los modifique el resto de regex; luego aplicar las otras reglas
// sobre el resto. Cada match produce nodes en su lugar.
function renderInline(text: string, t: ReturnType<typeof useTokens>, keyBase = ''): ReactNode {
  const out: ReactNode[] = [];
  // Tokenizamos en orden de precedencia: code → image → link → bold → italic → strike → mention/ref.
  // Para mantener simple usamos un regex compuesto que captura el primer
  // patrón que aparezca y empuja segmentos de texto plano entre matches.
  const re =
    /(`+)([^`]+?)\1|!\[([^\]]*)\]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"']+)|\*\*([^*\n]+?)\*\*|\b__([^_\n]+?)__\b|\*([^*\n]+?)\*|_([^_\n]+?)_|~~([^~\n]+?)~~|(@[A-Za-z0-9_-]{1,39})|(#\d+)/g;

  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push(<Fragment key={`${keyBase}t${n++}`}>{text.slice(lastIndex, m.index)}</Fragment>);
    }
    if (m[1]) {
      // code inline
      out.push(
        <code key={`${keyBase}c${n++}`} style={{
          fontFamily: t.fontMono, fontSize: '0.92em',
          padding: '1px 5px', borderRadius: 4,
          background: t.bg3, color: t.text0,
        }}>{m[2]}</code>,
      );
    } else if (m[3] !== undefined) {
      // image ![alt](url)
      out.push(
        <img key={`${keyBase}img${n++}`}
          src={m[4]}
          alt={m[3] || ''}
          loading="lazy"
          style={{
            maxWidth: '100%', maxHeight: 360,
            borderRadius: 8, marginTop: 4, marginBottom: 4,
            display: 'block',
          }}/>,
      );
    } else if (m[5]) {
      // link [text](url)
      out.push(
        <a key={`${keyBase}a${n++}`} href={m[6]} target="_blank" rel="noopener noreferrer"
          style={{ color: t.accent, textDecoration: 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}>{m[5]}</a>,
      );
    } else if (m[7]) {
      // autolink http(s)://...
      const url = m[7];
      out.push(
        <a key={`${keyBase}al${n++}`} href={url} target="_blank" rel="noopener noreferrer"
          style={{ color: t.accent, textDecoration: 'none', wordBreak: 'break-all' }}>{url}</a>,
      );
    } else if (m[8] || m[9]) {
      // bold **text** o __text__
      out.push(<strong key={`${keyBase}b${n++}`} style={{ color: t.text0, fontWeight: 700 }}>{m[8] || m[9]}</strong>);
    } else if (m[10] || m[11]) {
      // italic *text* o _text_
      out.push(<em key={`${keyBase}i${n++}`}>{m[10] || m[11]}</em>);
    } else if (m[12]) {
      // strike ~~text~~
      out.push(<span key={`${keyBase}s${n++}`} style={{ textDecoration: 'line-through', color: t.text2 }}>{m[12]}</span>);
    } else if (m[13]) {
      // @mention
      out.push(
        <span key={`${keyBase}m${n++}`} style={{
          color: t.accent, fontWeight: 600,
        }}>{m[13]}</span>,
      );
    } else if (m[14]) {
      // #issue ref
      out.push(
        <span key={`${keyBase}r${n++}`} style={{
          color: t.accent, fontWeight: 600,
        }}>{m[14]}</span>,
      );
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push(<Fragment key={`${keyBase}tail`}>{text.slice(lastIndex)}</Fragment>);
  }
  return out;
}

export function Markdown({ source }: { source: string }) {
  const t = useTokens();
  if (!source || !source.trim()) return null;
  // Pre-procesa HTML embebido (links de Notion, integraciones, etc.) a MD.
  const blocks = parseBlocks(htmlToMd(source));
  return (
    <div style={{
      fontFamily: t.fontSans, fontSize: 13, color: t.text1,
      lineHeight: 1.6, wordBreak: 'break-word',
    }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const sizes = { 1: 18, 2: 16, 3: 14, 4: 13 } as Record<number, number>;
            const Tag = `h${Math.min(b.level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
            return (
              <Tag key={i} style={{
                margin: '14px 0 6px',
                fontSize: sizes[b.level] ?? 13, fontWeight: 700,
                color: t.text0, lineHeight: 1.3,
                borderBottom: b.level <= 2 ? `1px solid ${t.glassBorder}` : 'none',
                paddingBottom: b.level <= 2 ? 4 : 0,
              }}>{renderInline(b.text, t, `h${i}-`)}</Tag>
            );
          }
          case 'code':
            return (
              <div key={i} style={{
                margin: '8px 0',
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                borderRadius: 8, overflow: 'hidden',
              }}>
                {b.lang && (
                  <div style={{
                    padding: '4px 10px', borderBottom: `1px solid ${t.glassBorder}`,
                    fontSize: 10, fontFamily: t.fontMono, color: t.text3,
                    textTransform: 'lowercase', letterSpacing: 0.3,
                  }}>{b.lang}</div>
                )}
                <pre style={{
                  margin: 0, padding: '8px 12px',
                  fontFamily: t.fontMono, fontSize: 11.5, lineHeight: 1.5,
                  color: t.text1,
                  overflowX: 'auto', whiteSpace: 'pre',
                }}>{b.body}</pre>
              </div>
            );
          case 'quote':
            return (
              <blockquote key={i} style={{
                margin: '8px 0', padding: '4px 0 4px 12px',
                borderLeft: `3px solid ${t.glassBorder}`,
                color: t.text2, fontStyle: 'italic',
              }}>{renderInline(b.text, t, `q${i}-`)}</blockquote>
            );
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} style={{
                margin: '6px 0', paddingLeft: 22,
              }}>
                {b.items.map((it, k) => (
                  <li key={k} style={{ marginBottom: 2 }}>
                    {renderInline(it, t, `l${i}-${k}-`)}
                  </li>
                ))}
              </Tag>
            );
          }
          case 'hr':
            return <hr key={i} style={{ border: 0, borderTop: `1px solid ${t.glassBorder}`, margin: '12px 0' }}/>;
          case 'para':
            return (
              <p key={i} style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>
                {renderInline(b.text, t, `p${i}-`)}
              </p>
            );
        }
      })}
    </div>
  );
}
