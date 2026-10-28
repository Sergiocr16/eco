// Tema de xterm. Lo comparten la terminal real (RealTerminal) y el visor de
// logs del ServerPanel.
//
// Regla: manda el tema del CLI que vive en esa terminal, no el de Eco. Claude
// Code no pinta el fondo ni manda OSC 10/11: su tema `dark`/`light` asume que
// el host terminal ya es de ese tono, y sobre el tono contrario se vuelve
// ilegible. Así que la terminal de Claude toma el tono de SU tema (`/theme`,
// leído por el backend). Si coincide con el modo de Eco usa el bg0/text0 del
// tema de Eco; si no, un neutro del tono correcto. Codex, los shells planos y
// los logs del Server no tienen tema propio y siguen a Eco.

import type { ITheme } from '@xterm/xterm';
import type { Tokens } from '@/design/tokens';

const NEUTRAL_DARK = { bg: '#0c0e14', fg: '#e5e7eb' };
const NEUTRAL_LIGHT = { bg: '#f5f5f7', fg: '#1d1d1f' };

// Paletas ANSI fijas por tono. La de xterm por defecto está pensada para
// fondo negro: amarillo/cian claros sobre blanco son ilegibles.
const ANSI_DARK = {
  black: '#1f2328', red: '#ff6b6b', green: '#5fd38d', yellow: '#f5c451',
  blue: '#6ea8fe', magenta: '#d48cff', cyan: '#5fd7e0', white: '#d4d4d8',
  brightBlack: '#6b7280', brightRed: '#ff8a8a', brightGreen: '#7fe3a6',
  brightYellow: '#ffd76b', brightBlue: '#8fbcff', brightMagenta: '#e3a8ff',
  brightCyan: '#86e8ef', brightWhite: '#f4f4f5',
};

const ANSI_LIGHT = {
  black: '#1d1d1f', red: '#c62828', green: '#1b7f3b', yellow: '#9a6700',
  blue: '#1a56c4', magenta: '#8e24aa', cyan: '#0e7490', white: '#8e8e93',
  brightBlack: '#6e6e73', brightRed: '#d32f2f', brightGreen: '#2e9e4f',
  brightYellow: '#b57d00', brightBlue: '#2f6fe0', brightMagenta: '#a640c2',
  brightCyan: '#1596b0', brightWhite: '#3a3a3c',
};

export type TerminalTone = {
  // Tono que exige el programa de la terminal; null = seguir a Eco.
  base?: 'dark' | 'light' | null;
  // Fondo explícito del tema del programa (gana sobre todo lo demás).
  background?: string | null;
};

type Resolved = { bg: string; fg: string; light: boolean };

function resolve(t: Tokens, ecoIsLight: boolean, tone?: TerminalTone): Resolved {
  const light = tone?.base ? tone.base === 'light' : ecoIsLight;
  const matchesEco = light === ecoIsLight;
  // bg0 es siempre un color sólido (los glass solo hacen translúcido bg1+),
  // y xterm corre con allowTransparency:false.
  const neutral = light ? NEUTRAL_LIGHT : NEUTRAL_DARK;
  return {
    bg: tone?.background ?? (matchesEco ? t.bg0 : neutral.bg),
    fg: matchesEco ? t.text0 : neutral.fg,
    light,
  };
}

export function terminalBg(t: Tokens, ecoIsLight: boolean, tone?: TerminalTone): string {
  return resolve(t, ecoIsLight, tone).bg;
}

export function terminalFg(t: Tokens, ecoIsLight: boolean, tone?: TerminalTone): string {
  return resolve(t, ecoIsLight, tone).fg;
}

export function buildXtermTheme(t: Tokens, ecoIsLight: boolean, accent = t.accent, tone?: TerminalTone): ITheme {
  const r = resolve(t, ecoIsLight, tone);
  return {
    background: r.bg,
    foreground: r.fg,
    cursor: accent,
    cursorAccent: r.bg,
    selectionBackground: `${accent}55`,
    ...(r.light ? ANSI_LIGHT : ANSI_DARK),
  };
}
