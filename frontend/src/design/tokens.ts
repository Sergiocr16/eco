// Dos temas: claro y oscuro (rediseño v2). Los valores son los del diseño
// `Eco Dashboard v2` y están espejados como variables CSS en eco.css — al
// cambiar uno, cambiar el otro (ver DESIGN.md).
export type ThemeMode = 'system' | 'light' | 'dark';
export type EffectiveThemeMode = Exclude<ThemeMode, 'system'>;

export type Tokens = {
  // Superficies, de atrás hacia adelante: bg (fondo de la ventana) → sheet
  // (la hoja de contenido) → card (tarjetas) → raised (lo que flota sobre una
  // tarjeta). hover es el relleno de interacción.
  bg: string;
  sheet: string;
  card: string;
  raised: string;
  hover: string;
  line: string;
  line2: string;
  info: string;
  accentSoft: string;
  accentLine: string;

  // Claves anteriores al rediseño, mapeadas a las superficies nuevas para el
  // código que aún las lee. En código nuevo usar las de arriba.
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  glassBg: string;
  glassBorder: string;
  glassBorderHi: string;
  glassInset: string;
  text0: string;
  text1: string;
  text2: string;
  text3: string;
  accent: string;
  accentDim: string;
  accentGlow: string;
  accentFaint: string;
  accentOn: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  err: string;
  busy: string;
  idle: string;
  chromeBg: string;
  windowBg: string;
  // Solo los tokens congelados del grafo (LegacyGraphTheme) los definen.
  legacy?: boolean;
  windowBgImage?: string;
  dialogBg?: string;
  scrimBg?: string;
  windowBorder: string;
  desktopBg: string;
  fontSans: string;
  fontMono: string;
  r1: number; r2: number; r3: number; r4: number; r5: number;
  shadowMd: string;
  shadowLg: string;
};

export const FONT_SANS = '"Hanken Grotesk Variable", "Hanken Grotesk", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
export const FONT_MONO = '"Geist Mono Variable", "Geist Mono", "SF Mono", ui-monospace, SFMono-Regular, monospace';

type Palette = {
  bg: string; sheet: string; card: string; raised: string; hover: string;
  line: string; line2: string;
  tx: string; tx2: string; tx3: string; tx4: string;
  ac: string; acTx: string; acSoft: string; acLine: string;
  ok: string; okSoft: string; warn: string; warnSoft: string; err: string; info: string;
  deep: string; scrim: string; shadowMd: string; shadowLg: string;
  // Luminosidad del acento cuando el usuario elige un tono propio.
  accentL: number;
};

const LIGHT: Palette = {
  bg: '#eeebe3', sheet: '#fbfaf7', card: '#f3f1ea', raised: '#ffffff', hover: '#e8e5db',
  line: '#e2ded2', line2: '#c9c4b5',
  tx: '#1f1e1c', tx2: '#55534c', tx3: '#716e65', tx4: '#a09c90',
  ac: '#b5532f', acTx: '#ffffff', acSoft: 'rgba(181,83,47,.09)', acLine: 'rgba(181,83,47,.28)',
  ok: '#2f7a45', okSoft: 'rgba(47,122,69,.12)', warn: '#8f5f0a', warnSoft: 'rgba(160,110,20,.14)',
  err: '#b23f3f', info: '#2f62a6',
  deep: '#ffffff', scrim: 'rgba(31,30,28,.32)',
  shadowMd: '0 1px 2px rgba(0,0,0,.05), 0 6px 18px -10px rgba(0,0,0,.18)',
  shadowLg: '0 10px 30px rgba(0,0,0,.16)',
  accentL: 52,
};

const DARK: Palette = {
  bg: '#151412', sheet: '#1e1d1b', card: '#272623', raised: '#32302d', hover: '#383633',
  line: '#35332f', line2: '#4d4a45',
  tx: '#f3f1ea', tx2: '#bdbab0', tx3: '#8f8c83', tx4: '#6a675f',
  ac: '#d98562', acTx: '#1c1b19', acSoft: 'rgba(217,133,98,.12)', acLine: 'rgba(217,133,98,.32)',
  ok: '#86bd92', okSoft: 'rgba(134,189,146,.14)', warn: '#e0b05c', warnSoft: 'rgba(224,176,92,.14)',
  err: '#e07f7a', info: '#86aee0',
  deep: '#151412', scrim: 'rgba(0,0,0,.5)',
  shadowMd: '0 1px 2px rgba(0,0,0,.3), 0 6px 18px -10px rgba(0,0,0,.5)',
  shadowLg: '0 10px 30px rgba(0,0,0,.4)',
  accentL: 72,
};

const PALETTES: Record<EffectiveThemeMode, Palette> = { light: LIGHT, dark: DARK };

export type ThemeVariant = { id: EffectiveThemeMode; kind: 'dark' | 'light'; preview: { bg: string; ink: string; mute: string } };
export const THEME_VARIANTS: ThemeVariant[] = [
  { id: 'light', kind: 'light', preview: { bg: '#f7f5ef', ink: '#2b2a27', mute: '#c9c5ba' } },
  { id: 'dark',  kind: 'dark',  preview: { bg: '#1f1e1c', ink: '#ecebe6', mute: '#5b5953' } },
];

export function isLightTheme(mode: EffectiveThemeMode): boolean {
  return mode === 'light';
}

/** `accentHue` null = el acento propio del tema (terracota). */
export function buildTokens(mode: EffectiveThemeMode, accentHue: number | null): Tokens {
  const p = PALETTES[mode] ?? DARK;
  const custom = accentHue != null && Number.isFinite(accentHue);
  const L = p.accentL;
  const ac = custom ? `oklch(${L}% 0.13 ${accentHue})` : p.ac;
  const acSoft = custom ? `oklch(${L}% 0.13 ${accentHue} / 0.11)` : p.acSoft;
  const acLine = custom ? `oklch(${L}% 0.13 ${accentHue} / 0.30)` : p.acLine;
  return {
    bg: p.bg, sheet: p.sheet, card: p.card, raised: p.raised, hover: p.hover,
    line: p.line, line2: p.line2, info: p.info,
    accentSoft: acSoft, accentLine: acLine,

    bg0: p.deep, bg1: p.sheet, bg2: p.card, bg3: p.hover, bg4: p.line2,
    glassBg: p.card, glassBorder: p.line, glassBorderHi: p.line2, glassInset: 'none',
    text0: p.tx, text1: p.tx2, text2: p.tx3, text3: p.tx4,
    accent: ac,
    accentDim: `color-mix(in oklab, ${ac} 86%, ${mode === 'light' ? '#000' : '#fff'})`,
    accentGlow: acLine, accentFaint: acSoft, accentOn: p.acTx,
    ok: p.ok, okSoft: p.okSoft, warn: p.warn, warnSoft: p.warnSoft, err: p.err,
    busy: p.info, idle: p.tx3,
    chromeBg: p.sheet, windowBg: p.sheet, scrimBg: p.scrim,
    windowBorder: p.line, desktopBg: p.bg,
    fontSans: FONT_SANS, fontMono: FONT_MONO,
    r1: 8, r2: 11, r3: 14, r4: 18, r5: 22,
    shadowMd: p.shadowMd, shadowLg: p.shadowLg,
  };
}

export type AgentType = 'arquitecto' | 'frontend' | 'backend' | 'qa' | 'devops' | 'docs' | 'general' | 'terminal';

export const AGENT_TYPES: Record<AgentType, { label: string; glyph: string }> = {
  arquitecto: { label: 'Arquitecto', glyph: 'A' },
  frontend:   { label: 'Frontend', glyph: 'F' },
  backend:    { label: 'Backend', glyph: 'B' },
  qa:         { label: 'QA', glyph: 'Q' },
  devops:     { label: 'DevOps', glyph: 'D' },
  docs:       { label: 'Documentación', glyph: 'Dc' },
  general:    { label: 'General', glyph: 'G' },
  terminal:   { label: 'Terminal', glyph: 'T' },
};

export type AgentState = 'idle' | 'pending' | 'running' | 'waiting' | 'paused' | 'done' | 'error' | 'thinking' | 'executing';

export const STATE_LABELS: Record<AgentState, string> = {
  idle: 'Inactivo',
  pending: 'Pendiente',
  running: 'Ejecutando',
  waiting: 'Esperando input',
  paused: 'En pausa',
  done: 'Finalizado',
  error: 'Error',
  thinking: 'Pensando',
  executing: 'Ejecutando',
};

export function stateColor(state: AgentState, t: Tokens): string {
  switch (state) {
    case 'running': return t.accent;
    case 'executing': return t.accent;
    case 'thinking': return t.busy;
    case 'waiting': case 'pending': return t.warn;
    case 'done': return t.ok;
    case 'error': return t.err;
    case 'paused': return t.text2;
    default: return t.idle;
  }
}

// Acentos opcionales para sobrescribir el del tema (Settings → Apariencia).
export const ACCENT_HUES = [
  { hue: 160, name: 'Mint' },
  { hue: 185, name: 'Turquesa' },
  { hue: 235, name: 'Azul Rey' },
  { hue: 265, name: 'Índigo' },
  { hue: 295, name: 'Púrpura' },
  { hue: 325, name: 'Magenta' },
  { hue: 350, name: 'Rosa' },
  { hue: 20,  name: 'Rojo' },
  { hue: 45,  name: 'Ámbar' },
  { hue: 70,  name: 'Dorado' },
  { hue: 95,  name: 'Lima' },
  { hue: 115, name: 'Oliva' },
  { hue: 145, name: 'Verde' },
  { hue: 210, name: 'Cian' },
];
