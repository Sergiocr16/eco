// Set curado de temas — cada uno claramente distinto (fondo + acento de
// firma coordinado), cubriendo la rueda de color. Ver THEME_VARIANTS para el
// acento por defecto de cada uno. Los ids removidos de versiones anteriores
// se migran en theme.tsx (readStoredMode).
export type ThemeMode =
  | 'system'
  // Oscuros
  | 'dark' | 'slate' | 'ocean' | 'emerald' | 'dracula' | 'indigo' | 'rose-pine'
  | 'gruvbox' | 'blood-moon'
  // Claros
  | 'light' | 'sky' | 'lavender' | 'sand' | 'mint';

export type EffectiveThemeMode = Exclude<ThemeMode, 'system'>;

export type Tokens = {
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
  warn: string;
  err: string;
  busy: string;
  idle: string;
  chromeBg: string;
  windowBg: string;
  windowBorder: string;
  desktopBg: string;
  fontSans: string;
  fontMono: string;
  r1: number; r2: number; r3: number; r4: number; r5: number;
  shadowMd: string;
  shadowLg: string;
};

const DARK_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  bg0: '#000000',
  bg1: '#0a0a0c',
  bg2: 'rgba(255,255,255,0.03)',
  bg3: 'rgba(255,255,255,0.05)',
  bg4: 'rgba(255,255,255,0.08)',

  glassBg: 'rgba(20, 20, 24, 0.6)',
  glassBorder: 'rgba(255,255,255,0.07)',
  glassBorderHi: 'rgba(255,255,255,0.12)',
  glassInset: 'none',

  text0: '#f5f5f7',
  text1: '#a1a1a6',
  text2: '#6e6e73',
  text3: '#48484a',

  accentOn: '#04130c',

  ok:    'oklch(72% 0.11 155)',
  warn:  'oklch(76% 0.11 75)',
  err:   'oklch(68% 0.14 25)',
  busy:  'oklch(70% 0.10 280)',
  idle:  'oklch(70% 0.02 240)',

  chromeBg: 'rgba(10, 10, 12, 0.7)',
  windowBg: '#0a0a0c',
  windowBorder: 'rgba(255,255,255,0.08)',
  desktopBg: '#0b0c10',

  fontSans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Geist", system-ui, sans-serif',
  fontMono: '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, monospace',

  r1: 8, r2: 10, r3: 12, r4: 16, r5: 22,

  shadowMd: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.5)',
  shadowLg: '0 30px 80px -30px rgba(0,0,0,0.7), 0 8px 24px -12px rgba(0,0,0,0.5)',
};

const LIGHT_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  bg0: '#ffffff',
  bg1: '#fbfbfd',
  bg2: 'rgba(0,0,0,0.025)',
  bg3: 'rgba(0,0,0,0.05)',
  bg4: 'rgba(0,0,0,0.08)',

  glassBg: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(0,0,0,0.08)',
  glassBorderHi: 'rgba(0,0,0,0.14)',
  glassInset: 'none',

  text0: '#1d1d1f',
  text1: '#515154',
  text2: '#86868b',
  text3: '#aeaeb2',

  accentOn: '#ffffff',

  ok:    'oklch(58% 0.13 155)',
  warn:  'oklch(66% 0.13 65)',
  err:   'oklch(58% 0.18 25)',
  busy:  'oklch(58% 0.13 280)',
  idle:  'oklch(60% 0.02 240)',

  chromeBg: 'rgba(245, 245, 247, 0.78)',
  windowBg: '#fbfbfd',
  windowBorder: 'rgba(0,0,0,0.10)',
  desktopBg: '#e8e9ec',

  fontSans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Geist", system-ui, sans-serif',
  fontMono: '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, monospace',

  r1: 8, r2: 10, r3: 12, r4: 16, r5: 22,

  shadowMd: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
  shadowLg: '0 20px 60px -20px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.06)',
};

// Gruvbox — paleta retro warm con marrones y verdes oliva.
const GRUVBOX_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#282828',
  bg1: '#32302f',
  bg2: 'rgba(255,237,193,0.04)',
  bg3: 'rgba(255,237,193,0.07)',
  bg4: 'rgba(255,237,193,0.10)',
  glassBg: 'rgba(40, 40, 40, 0.72)',
  glassBorder: 'rgba(235,219,178,0.10)',
  glassBorderHi: 'rgba(235,219,178,0.16)',
  text0: '#ebdbb2',
  text1: '#d5c4a1',
  text2: '#a89984',
  text3: '#7c6f64',
  chromeBg: 'rgba(40, 40, 40, 0.82)',
  windowBg: '#282828',
  windowBorder: 'rgba(235,219,178,0.10)',
  desktopBg: '#1d2021',
};

// Slate — gris azulado oscuro intermedio entre dark puro y nord.
const SLATE_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0f172a',
  bg1: '#1e293b',
  bg2: 'rgba(255,255,255,0.04)',
  bg3: 'rgba(255,255,255,0.07)',
  bg4: 'rgba(255,255,255,0.10)',
  glassBg: 'rgba(15, 23, 42, 0.72)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassBorderHi: 'rgba(255,255,255,0.14)',
  text0: '#f1f5f9',
  text1: '#cbd5e1',
  text2: '#94a3b8',
  text3: '#64748b',
  chromeBg: 'rgba(15, 23, 42, 0.82)',
  windowBg: '#0f172a',
  windowBorder: 'rgba(255,255,255,0.10)',
  desktopBg: '#0a1020',
};

// Dracula — violeta oscuro icónico (idea.io / VS Code theme popular).
const DRACULA_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#282a36',
  bg1: '#343746',
  bg2: 'rgba(255,255,255,0.04)',
  bg3: 'rgba(255,255,255,0.07)',
  bg4: 'rgba(255,255,255,0.10)',
  glassBg: 'rgba(40, 42, 54, 0.72)',
  glassBorder: 'rgba(248,248,242,0.08)',
  glassBorderHi: 'rgba(248,248,242,0.14)',
  text0: '#f8f8f2',
  text1: '#bfbfbf',
  text2: '#6272a4',
  text3: '#44475a',
  chromeBg: 'rgba(40, 42, 54, 0.82)',
  windowBg: '#282a36',
  windowBorder: 'rgba(248,248,242,0.10)',
  desktopBg: '#1e1f29',
};

// Rosé Pine — fondo borgoña suave, popular para lecturas largas.
const ROSE_PINE_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#191724',
  bg1: '#1f1d2e',
  bg2: 'rgba(224,222,244,0.04)',
  bg3: 'rgba(224,222,244,0.07)',
  bg4: 'rgba(224,222,244,0.10)',
  glassBg: 'rgba(25, 23, 36, 0.72)',
  glassBorder: 'rgba(224,222,244,0.10)',
  glassBorderHi: 'rgba(224,222,244,0.16)',
  text0: '#e0def4',
  text1: '#908caa',
  text2: '#6e6a86',
  text3: '#403d52',
  chromeBg: 'rgba(25, 23, 36, 0.82)',
  windowBg: '#191724',
  windowBorder: 'rgba(224,222,244,0.10)',
  desktopBg: '#13111c',
};

// Ocean — azul marino profundo tipo abismo.
const OCEAN_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0a1a2e',
  bg1: '#16263d',
  bg2: 'rgba(173,216,230,0.04)',
  bg3: 'rgba(173,216,230,0.07)',
  bg4: 'rgba(173,216,230,0.10)',
  glassBg: 'rgba(10, 26, 46, 0.75)',
  glassBorder: 'rgba(173,216,230,0.10)',
  glassBorderHi: 'rgba(173,216,230,0.18)',
  text0: '#e0f0ff',
  text1: '#a8c8e8',
  text2: '#7896b8',
  text3: '#536e8c',
  chromeBg: 'rgba(10, 26, 46, 0.85)',
  windowBg: '#0a1a2e',
  windowBorder: 'rgba(173,216,230,0.10)',
  desktopBg: '#061322',
};

// ─── Temas extravagantes nuevos ───────────────────────────────────────────

// Blood Moon — fondo casi negro con rojo sangre carmesí brillante.
const BLOOD_MOON_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0c0204',
  bg1: '#280608',
  bg2: 'rgba(255, 30, 50, 0.07)',
  bg3: 'rgba(255, 60, 80, 0.12)',
  bg4: 'rgba(255, 100, 120, 0.16)',
  glassBg: 'rgba(12, 2, 4, 0.88)',
  glassBorder: 'rgba(255, 40, 60, 0.22)',
  glassBorderHi: 'rgba(255, 100, 120, 0.45)',
  text0: '#ffe0e0',
  text1: '#ffa0a8',
  text2: '#c06868',
  text3: '#7a3030',
  chromeBg: 'rgba(12, 2, 4, 0.94)',
  windowBg: '#0c0204',
  windowBorder: 'rgba(255, 40, 60, 0.25)',
  desktopBg: '#060102',
};

// Emerald City — verde profundo esmeralda con vibe Wizard of Oz.
const EMERALD_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#041810',
  bg1: '#082c20',
  bg2: 'rgba(0, 220, 140, 0.06)',
  bg3: 'rgba(0, 220, 140, 0.10)',
  bg4: 'rgba(80, 255, 180, 0.14)',
  glassBg: 'rgba(4, 24, 16, 0.84)',
  glassBorder: 'rgba(0, 220, 140, 0.22)',
  glassBorderHi: 'rgba(80, 255, 180, 0.40)',
  text0: '#e0fff0',
  text1: '#a0d8c0',
  text2: '#609080',
  text3: '#385850',
  chromeBg: 'rgba(4, 24, 16, 0.92)',
  windowBg: '#041810',
  windowBorder: 'rgba(0, 220, 140, 0.25)',
  desktopBg: '#020e08',
};

// Mint — verde menta muy suave, fresco, fondo blanco con tinte verdoso.
const MINT_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#f1f8f4',
  bg1: '#e8f1ec',
  bg2: 'rgba(20,80,55,0.03)',
  bg3: 'rgba(20,80,55,0.06)',
  bg4: 'rgba(20,80,55,0.10)',
  glassBg: 'rgba(241, 248, 244, 0.82)',
  glassBorder: 'rgba(20,80,55,0.10)',
  glassBorderHi: 'rgba(20,80,55,0.16)',
  text0: '#1f3a2a',
  text1: '#3d5a48',
  text2: '#6a8576',
  text3: '#98ad9f',
  chromeBg: 'rgba(241, 248, 244, 0.88)',
  windowBg: '#f1f8f4',
  windowBorder: 'rgba(20,80,55,0.10)',
  desktopBg: '#dfeae3',
};

// Sky — azul cielo claro, fondo blanco con tinte celeste calmo.
const SKY_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#f0f6fc',
  bg1: '#e5eff8',
  bg2: 'rgba(20,60,110,0.03)',
  bg3: 'rgba(20,60,110,0.06)',
  bg4: 'rgba(20,60,110,0.10)',
  glassBg: 'rgba(240, 246, 252, 0.82)',
  glassBorder: 'rgba(20,60,110,0.10)',
  glassBorderHi: 'rgba(20,60,110,0.16)',
  text0: '#1a2c4a',
  text1: '#3b526f',
  text2: '#6c829e',
  text3: '#a0b1c4',
  chromeBg: 'rgba(240, 246, 252, 0.88)',
  windowBg: '#f0f6fc',
  windowBorder: 'rgba(20,60,110,0.10)',
  desktopBg: '#dde7f2',
};

// Sand — beige tostado cálido, evoca lectura al aire libre.
const SAND_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#f7f1e0',
  bg1: '#efe7cf',
  bg2: 'rgba(95,72,30,0.04)',
  bg3: 'rgba(95,72,30,0.08)',
  bg4: 'rgba(95,72,30,0.12)',
  glassBg: 'rgba(247, 241, 224, 0.82)',
  glassBorder: 'rgba(95,72,30,0.12)',
  glassBorderHi: 'rgba(95,72,30,0.18)',
  text0: '#3d2f17',
  text1: '#5f4a26',
  text2: '#8a7350',
  text3: '#a8957a',
  chromeBg: 'rgba(247, 241, 224, 0.88)',
  windowBg: '#f7f1e0',
  windowBorder: 'rgba(95,72,30,0.12)',
  desktopBg: '#eadfc1',
};

// Índigo — azul-violeta profundo tipo Tailwind/Radix Indigo.
const INDIGO_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#14122e',
  bg1: '#201d44',
  bg2: 'rgba(180,170,255,0.04)',
  bg3: 'rgba(180,170,255,0.07)',
  bg4: 'rgba(180,170,255,0.10)',
  glassBg: 'rgba(20, 18, 46, 0.75)',
  glassBorder: 'rgba(180,170,255,0.10)',
  glassBorderHi: 'rgba(180,170,255,0.18)',
  text0: '#e6e3ff',
  text1: '#b3aee0',
  text2: '#827cb0',
  text3: '#565082',
  chromeBg: 'rgba(20, 18, 46, 0.85)',
  windowBg: '#14122e',
  windowBorder: 'rgba(180,170,255,0.10)',
  desktopBg: '#0e0c22',
};

// Lavanda — claro lila suave; el único tema claro de familia morada.
const LAVENDER_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#f6f4fc',
  bg1: '#eeeafa',
  bg2: 'rgba(90,60,160,0.03)',
  bg3: 'rgba(90,60,160,0.06)',
  bg4: 'rgba(90,60,160,0.10)',
  glassBg: 'rgba(246, 244, 252, 0.82)',
  glassBorder: 'rgba(90,60,160,0.10)',
  glassBorderHi: 'rgba(90,60,160,0.16)',
  text0: '#2e2348',
  text1: '#4d3f6b',
  text2: '#7a6c98',
  text3: '#a99fc0',
  chromeBg: 'rgba(246, 244, 252, 0.88)',
  windowBg: '#f6f4fc',
  windowBorder: 'rgba(90,60,160,0.10)',
  desktopBg: '#e6e0f4',
};

// Mapping de cada modo a su base.
const THEME_BASES: Record<EffectiveThemeMode, Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'>> = {
  'dark': DARK_BASE,
  'slate': SLATE_BASE,
  'ocean': OCEAN_BASE,
  'emerald': EMERALD_BASE,
  'dracula': DRACULA_BASE,
  'indigo': INDIGO_BASE,
  'rose-pine': ROSE_PINE_BASE,
  'gruvbox': GRUVBOX_BASE,
  'blood-moon': BLOOD_MOON_BASE,
  'light': LIGHT_BASE,
  'sky': SKY_BASE,
  'lavender': LAVENDER_BASE,
  'sand': SAND_BASE,
  'mint': MINT_BASE,
};

// Luminosidad del accent por tema — los oscuros usan accent claro (~74-78%),
// los claros uno más sat/oscuro (~56-58%) para que tenga contraste.
const ACCENT_LUMINOSITY: Record<EffectiveThemeMode, number> = {
  'dark': 78,
  'slate': 70,
  'ocean': 76,
  'emerald': 78,
  'dracula': 78,
  'indigo': 74,
  'rose-pine': 76,
  'gruvbox': 74,
  'blood-moon': 64,
  // Light themes: accent ~56-58% L para que contraste contra fondos claros.
  'light': 58,
  'sky': 56,
  'lavender': 56,
  'sand': 58,
  'mint': 56,
};

// Metadata para mostrar al usuario en el picker de Apariencia.
export type ThemeKind = 'dark' | 'light';
export type ThemeVariant = {
  id: EffectiveThemeMode;
  name: string;          // fallback; el label real sale de i18n (ver Settings)
  kind: ThemeKind;
  preview: string;       // color de fondo para el swatch
  defaultHue: number;    // acento de firma coordinado con el tema
  defaultChroma?: number; // override de chroma (default 0.13) — algunos hues
                          // necesitan más saturación para leerse "del color".
};
// Set curado: ~12 temas claramente distintos cubriendo la rueda de color.
// Cada uno trae su acento coordinado (defaultHue) — al elegir el tema se
// aplica ese acento (ver theme.tsx). Basados en sistemas reconocidos
// (Tailwind, editores clásicos).
export const THEME_VARIANTS: ThemeVariant[] = [
  // Oscuros — un color de firma cada uno, repartidos por la rueda.
  { id: 'dark',       name: 'Grafito',   kind: 'dark',  preview: '#0a0a0c', defaultHue: 165 },
  { id: 'slate',      name: 'Azul Rey',  kind: 'dark',  preview: '#0f172a', defaultHue: 230, defaultChroma: 0.15 },
  { id: 'ocean',      name: 'Océano',    kind: 'dark',  preview: '#0a1a2e', defaultHue: 190 },
  { id: 'emerald',    name: 'Esmeralda', kind: 'dark',  preview: '#041810', defaultHue: 150 },
  { id: 'dracula',    name: 'Violeta',   kind: 'dark',  preview: '#282a36', defaultHue: 285 },
  { id: 'indigo',     name: 'Índigo',    kind: 'dark',  preview: '#14122e', defaultHue: 260, defaultChroma: 0.15 },
  { id: 'rose-pine',  name: 'Rosa',      kind: 'dark',  preview: '#191724', defaultHue: 350 },
  { id: 'gruvbox',    name: 'Ámbar',     kind: 'dark',  preview: '#282828', defaultHue: 70, defaultChroma: 0.14 },
  { id: 'blood-moon', name: 'Carmesí',   kind: 'dark',  preview: '#0c0204', defaultHue: 20, defaultChroma: 0.16 },
  // Claros.
  { id: 'light',      name: 'Claro',     kind: 'light', preview: '#fbfbfd', defaultHue: 165 },
  { id: 'sky',        name: 'Cielo',     kind: 'light', preview: '#f0f6fc', defaultHue: 210 },
  { id: 'lavender',   name: 'Lavanda',   kind: 'light', preview: '#f6f4fc', defaultHue: 285 },
  { id: 'sand',       name: 'Arena',     kind: 'light', preview: '#f7f1e0', defaultHue: 45, defaultChroma: 0.12 },
  { id: 'mint',       name: 'Menta',     kind: 'light', preview: '#f1f8f4', defaultHue: 150 },
];

// Lookups derivados — fuente única de verdad para light/dark y para el acento
// por tema. Declarados después de THEME_VARIANTS (las funciones de abajo los
// usan en runtime, no en module-eval).
const LIGHT_IDS = new Set<EffectiveThemeMode>(
  THEME_VARIANTS.filter((v) => v.kind === 'light').map((v) => v.id),
);
const THEME_META = new Map<EffectiveThemeMode, ThemeVariant>(
  THEME_VARIANTS.map((v) => [v.id, v]),
);

// Acento de firma de cada tema — usado por theme.tsx al cambiar de tema.
export function defaultHueForTheme(mode: EffectiveThemeMode): number {
  return THEME_META.get(mode)?.defaultHue ?? 165;
}

export function isLightTheme(mode: EffectiveThemeMode): boolean {
  return LIGHT_IDS.has(mode);
}

export function buildTokens(mode: EffectiveThemeMode, accentHue: number): Tokens {
  const base = THEME_BASES[mode] ?? DARK_BASE;
  const L = ACCENT_LUMINOSITY[mode] ?? 78;
  // Chroma por TEMA (no por hue): un override de hue hereda la intensidad del
  // tema. Sin defaultChroma cae a 0.13/0.11 — idéntico al comportamiento viejo.
  const c = THEME_META.get(mode)?.defaultChroma ?? 0.13;
  const cDim = Math.max(0, c - 0.02);
  return {
    ...base,
    accent: `oklch(${L}% ${c} ${accentHue})`,
    accentDim: `oklch(${L - 14}% ${cDim} ${accentHue})`,
    accentGlow: `oklch(${L}% ${c} ${accentHue} / 0.22)`,
    accentFaint: `oklch(${L}% ${c} ${accentHue} / 0.10)`,
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

// 24 acentos ordenados por hue (rueda de color completa).
// Marcamos «Mint (Eco)» (165) como el accent oficial del producto.
// Lista curada de acentos para el override — 10 colores bien distintos,
// repartidos por la rueda con saltos ≥25° para que ninguno se confunda con su
// vecino. (Antes eran 26 y muchos se veían iguales.)
export const ACCENT_HUES = [
  { hue: 165, name: 'Mint (Eco)' },   // el oficial
  { hue: 190, name: 'Turquesa' },
  { hue: 230, name: 'Azul Rey' },
  { hue: 260, name: 'Índigo' },
  { hue: 290, name: 'Púrpura' },
  { hue: 325, name: 'Magenta' },
  { hue: 350, name: 'Rosa' },
  { hue: 20,  name: 'Rojo' },
  { hue: 45,  name: 'Ámbar' },
  { hue: 90,  name: 'Lima' },
];
