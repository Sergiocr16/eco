// Pantalla "tal como se ve" de un PTY, reconstruida con el parser de xterm
// sin DOM. Las TUIs redibujan solo las celdas que cambian, así que leer el
// ring buffer con regex no sirve para saber qué hay en una fila concreta
// (la línea del prompt, la fila elegida en un picker).

// El paquete es CommonJS: sin named exports bajo ESM.
import xterm from '@xterm/headless';

const { Terminal } = xterm;

export async function renderScreen(raw: string, cols: number, rows: number): Promise<string[]> {
  const term = new Terminal({ cols: Math.max(20, cols), rows: Math.max(5, rows), scrollback: 0, allowProposedApi: true });
  try {
    await new Promise<void>((resolve) => term.write(raw, resolve));
    const buf = term.buffer.active;
    const out: string[] = [];
    for (let y = 0; y < buf.length; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '');
    return out;
  } finally {
    term.dispose();
  }
}

// Última fila que empieza con el cursor del prompt (`❯`), sin el símbolo.
export function promptRow(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^\s*❯\s?(.*)$/.exec(lines[i]!);
    if (m) return m[1]!.trim();
  }
  return null;
}
