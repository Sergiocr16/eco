// Limpieza de output de terminal para consumidores que leen texto (resumen de
// notas, tools MCP). Las TUIs de los agentes redibujan la pantalla entera, así
// que además de quitar escapes hay que colapsar el ruido resultante.

// ESC[ … letra (CSI) + ESC] … BEL/ST (OSC) + ESC + letra simple. Patrón de
// "ansi-regex" inline para no agregar dependencia.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z0-9*;]*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PRZcf-ntqry=><~]))/g;

// Las TUIs pintan los huecos entre palabras con "cursor adelante" (ESC[nC)
// en vez de espacios; sin esto el texto limpio sale con las palabras pegadas.
// eslint-disable-next-line no-control-regex
const CURSOR_FORWARD_RE = /\u001b\[(\d*)C/g;

export function stripAnsi(s: string): string {
  return s
    .replace(CURSOR_FORWARD_RE, (_m, n: string) => ' '.repeat(Math.min(200, Math.max(1, Number(n || '1')))))
    .replace(ANSI_RE, '');
}

// Cola legible del ring buffer de un PTY: sin escapes, saltos normalizados,
// sin más de una línea vacía seguida y sin espacios colgantes.
export function ptyTailToText(raw: string, maxLines: number): string {
  const clean = stripAnsi(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));
  const collapsed: string[] = [];
  for (const line of clean) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue;
    collapsed.push(line);
  }
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') collapsed.pop();
  return collapsed.slice(-Math.max(1, maxLines)).join('\n');
}
