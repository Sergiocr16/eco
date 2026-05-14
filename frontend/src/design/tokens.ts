export type ThemeMode =
  | 'dark' | 'light' | 'system' | 'amoled'
  | 'nord' | 'tokyo' | 'gruvbox' | 'solarized-dark' | 'solarized-light'
  | 'sepia' | 'slate' | 'dracula' | 'rose-pine'
  | 'catppuccin-mocha' | 'catppuccin-latte'
  | 'pink' | 'cyberpunk' | 'synthwave' | 'forest' | 'ocean' | 'coffee'
  | 'lavender' | 'monokai' | 'baby-pink'
  // Nuevos extravagantes
  | 'vaporwave' | 'aurora' | 'volcano' | 'galaxy' | 'matrix' | 'sunset'
  | 'bubblegum' | 'neon-night'
  // Más extravagantes (amarillos, rojos, otros)
  | 'acid-yellow' | 'blood-moon' | 'mustard' | 'cherry-bomb' | 'sakura'
  | 'emerald' | 'royal' | 'carbon';

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

// AMOLED: variante de dark con negro absoluto (true black) para pantallas OLED.
// Apaga píxeles → ahorra batería + contraste más fuerte.
const AMOLED_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#000000',
  bg1: '#000000',
  bg2: 'rgba(255,255,255,0.025)',
  bg3: 'rgba(255,255,255,0.045)',
  bg4: 'rgba(255,255,255,0.07)',
  glassBg: 'rgba(8, 8, 10, 0.7)',
  glassBorder: 'rgba(255,255,255,0.06)',
  glassBorderHi: 'rgba(255,255,255,0.11)',
  chromeBg: 'rgba(0, 0, 0, 0.85)',
  windowBg: '#000000',
  windowBorder: 'rgba(255,255,255,0.06)',
  desktopBg: '#000000',
};

// Nord — palette azulada fría, popular para code editors.
const NORD_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#2e3440',
  bg1: '#3b4252',
  bg2: 'rgba(255,255,255,0.04)',
  bg3: 'rgba(255,255,255,0.07)',
  bg4: 'rgba(255,255,255,0.10)',
  glassBg: 'rgba(46, 52, 64, 0.7)',
  glassBorder: 'rgba(216,222,233,0.08)',
  glassBorderHi: 'rgba(216,222,233,0.14)',
  text0: '#eceff4',
  text1: '#d8dee9',
  text2: '#a9b1c6',
  text3: '#6b7280',
  chromeBg: 'rgba(46, 52, 64, 0.78)',
  windowBg: '#2e3440',
  windowBorder: 'rgba(216,222,233,0.10)',
  desktopBg: '#262b34',
};

// Tokyo Night — fondo azul-violeta muy oscuro, popular en VS Code/Neovim.
const TOKYO_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#1a1b26',
  bg1: '#24283b',
  bg2: 'rgba(255,255,255,0.04)',
  bg3: 'rgba(255,255,255,0.07)',
  bg4: 'rgba(255,255,255,0.10)',
  glassBg: 'rgba(26, 27, 38, 0.7)',
  glassBorder: 'rgba(192,202,245,0.08)',
  glassBorderHi: 'rgba(192,202,245,0.14)',
  text0: '#c0caf5',
  text1: '#a9b1d6',
  text2: '#787c99',
  text3: '#565a76',
  chromeBg: 'rgba(26, 27, 38, 0.82)',
  windowBg: '#1a1b26',
  windowBorder: 'rgba(192,202,245,0.10)',
  desktopBg: '#16161e',
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

// Solarized Dark — fondo cian-verdoso, contraste suave.
const SOL_DARK_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#002b36',
  bg1: '#073642',
  bg2: 'rgba(238,232,213,0.04)',
  bg3: 'rgba(238,232,213,0.07)',
  bg4: 'rgba(238,232,213,0.10)',
  glassBg: 'rgba(0, 43, 54, 0.72)',
  glassBorder: 'rgba(238,232,213,0.10)',
  glassBorderHi: 'rgba(238,232,213,0.16)',
  text0: '#eee8d5',
  text1: '#93a1a1',
  text2: '#839496',
  text3: '#586e75',
  chromeBg: 'rgba(0, 43, 54, 0.82)',
  windowBg: '#002b36',
  windowBorder: 'rgba(238,232,213,0.10)',
  desktopBg: '#001f27',
};

// Solarized Light — fondo crema cálido, contraste suave.
const SOL_LIGHT_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#fdf6e3',
  bg1: '#eee8d5',
  bg2: 'rgba(7,54,66,0.03)',
  bg3: 'rgba(7,54,66,0.06)',
  bg4: 'rgba(7,54,66,0.10)',
  glassBg: 'rgba(253, 246, 227, 0.78)',
  glassBorder: 'rgba(7,54,66,0.10)',
  glassBorderHi: 'rgba(7,54,66,0.16)',
  text0: '#073642',
  text1: '#586e75',
  text2: '#839496',
  text3: '#93a1a1',
  chromeBg: 'rgba(253, 246, 227, 0.85)',
  windowBg: '#fdf6e3',
  windowBorder: 'rgba(7,54,66,0.10)',
  desktopBg: '#f5edd6',
};

// Sepia — light warm tipo lectura de libro (pergamino).
const SEPIA_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#f6f0e1',
  bg1: '#efe6d2',
  bg2: 'rgba(80,52,28,0.04)',
  bg3: 'rgba(80,52,28,0.07)',
  bg4: 'rgba(80,52,28,0.10)',
  glassBg: 'rgba(246, 240, 225, 0.78)',
  glassBorder: 'rgba(80,52,28,0.10)',
  glassBorderHi: 'rgba(80,52,28,0.16)',
  text0: '#3b2f1f',
  text1: '#5f4a30',
  text2: '#8a755a',
  text3: '#a89b85',
  chromeBg: 'rgba(246, 240, 225, 0.85)',
  windowBg: '#f6f0e1',
  windowBorder: 'rgba(80,52,28,0.10)',
  desktopBg: '#e8dec5',
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

// Catppuccin Mocha — rosado/morado warm dark, muy popular en VS Code.
const CATPPUCCIN_MOCHA_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#1e1e2e',
  bg1: '#181825',
  bg2: 'rgba(245,224,220,0.04)',
  bg3: 'rgba(245,224,220,0.07)',
  bg4: 'rgba(245,224,220,0.10)',
  glassBg: 'rgba(30, 30, 46, 0.72)',
  glassBorder: 'rgba(245,224,220,0.10)',
  glassBorderHi: 'rgba(245,224,220,0.16)',
  text0: '#cdd6f4',
  text1: '#a6adc8',
  text2: '#9399b2',
  text3: '#6c7086',
  chromeBg: 'rgba(30, 30, 46, 0.82)',
  windowBg: '#1e1e2e',
  windowBorder: 'rgba(245,224,220,0.10)',
  desktopBg: '#11111b',
};

// Catppuccin Latte — light cremoso con tintes peach/rosado.
const CATPPUCCIN_LATTE_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#eff1f5',
  bg1: '#e6e9ef',
  bg2: 'rgba(76,79,105,0.03)',
  bg3: 'rgba(76,79,105,0.06)',
  bg4: 'rgba(76,79,105,0.10)',
  glassBg: 'rgba(239, 241, 245, 0.82)',
  glassBorder: 'rgba(76,79,105,0.10)',
  glassBorderHi: 'rgba(76,79,105,0.16)',
  text0: '#4c4f69',
  text1: '#5c5f77',
  text2: '#6c6f85',
  text3: '#8c8fa1',
  chromeBg: 'rgba(239, 241, 245, 0.88)',
  windowBg: '#eff1f5',
  windowBorder: 'rgba(76,79,105,0.10)',
  desktopBg: '#dce0e8',
};

// Pink — millennial pink dark. Rosado vibrante de fondo oscuro tipo Berry.
const PINK_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#2a1226',
  bg1: '#371a30',
  bg2: 'rgba(255,200,220,0.04)',
  bg3: 'rgba(255,200,220,0.07)',
  bg4: 'rgba(255,200,220,0.10)',
  glassBg: 'rgba(42, 18, 38, 0.72)',
  glassBorder: 'rgba(255,200,220,0.10)',
  glassBorderHi: 'rgba(255,200,220,0.16)',
  text0: '#ffe0ed',
  text1: '#e8b8d0',
  text2: '#b88aa0',
  text3: '#7a5a6e',
  chromeBg: 'rgba(42, 18, 38, 0.82)',
  windowBg: '#2a1226',
  windowBorder: 'rgba(255,200,220,0.10)',
  desktopBg: '#1f0d1c',
};

// Cyberpunk — neon rosa + cyan sobre negro profundo.
const CYBERPUNK_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0d0221',
  bg1: '#1a0633',
  bg2: 'rgba(255,107,237,0.05)',
  bg3: 'rgba(255,107,237,0.08)',
  bg4: 'rgba(255,107,237,0.12)',
  glassBg: 'rgba(13, 2, 33, 0.78)',
  glassBorder: 'rgba(255,107,237,0.14)',
  glassBorderHi: 'rgba(255,107,237,0.22)',
  text0: '#f5f5ff',
  text1: '#d8b4fe',
  text2: '#a78bfa',
  text3: '#7c3aed',
  chromeBg: 'rgba(13, 2, 33, 0.88)',
  windowBg: '#0d0221',
  windowBorder: 'rgba(255,107,237,0.14)',
  desktopBg: '#070114',
};

// Synthwave — púrpura/rosado retro años 80.
const SYNTHWAVE_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#241734',
  bg1: '#2a1b4a',
  bg2: 'rgba(255,164,228,0.05)',
  bg3: 'rgba(255,164,228,0.08)',
  bg4: 'rgba(255,164,228,0.12)',
  glassBg: 'rgba(36, 23, 52, 0.75)',
  glassBorder: 'rgba(255,164,228,0.12)',
  glassBorderHi: 'rgba(255,164,228,0.20)',
  text0: '#ffe9f7',
  text1: '#d4a8ea',
  text2: '#a079bd',
  text3: '#6e4f8a',
  chromeBg: 'rgba(36, 23, 52, 0.85)',
  windowBg: '#241734',
  windowBorder: 'rgba(255,164,228,0.12)',
  desktopBg: '#1a0f28',
};

// Forest — verde profundo de bosque con tonos cálidos.
const FOREST_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#1a2421',
  bg1: '#243431',
  bg2: 'rgba(212,231,217,0.04)',
  bg3: 'rgba(212,231,217,0.07)',
  bg4: 'rgba(212,231,217,0.10)',
  glassBg: 'rgba(26, 36, 33, 0.72)',
  glassBorder: 'rgba(212,231,217,0.10)',
  glassBorderHi: 'rgba(212,231,217,0.16)',
  text0: '#d4e7d9',
  text1: '#a8c7af',
  text2: '#82a78a',
  text3: '#5d7c64',
  chromeBg: 'rgba(26, 36, 33, 0.82)',
  windowBg: '#1a2421',
  windowBorder: 'rgba(212,231,217,0.10)',
  desktopBg: '#121b18',
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

// Coffee — café warm cálido, vibe cafetería.
const COFFEE_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#2a1e15',
  bg1: '#352620',
  bg2: 'rgba(255,224,189,0.04)',
  bg3: 'rgba(255,224,189,0.07)',
  bg4: 'rgba(255,224,189,0.10)',
  glassBg: 'rgba(42, 30, 21, 0.74)',
  glassBorder: 'rgba(255,224,189,0.10)',
  glassBorderHi: 'rgba(255,224,189,0.16)',
  text0: '#ffe0bd',
  text1: '#d6b596',
  text2: '#a98a6c',
  text3: '#75614c',
  chromeBg: 'rgba(42, 30, 21, 0.84)',
  windowBg: '#2a1e15',
  windowBorder: 'rgba(255,224,189,0.10)',
  desktopBg: '#1e150e',
};

// Lavender — lila claro, vibe primaveral suave.
const LAVENDER_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#f4f0fa',
  bg1: '#ede4f7',
  bg2: 'rgba(120,80,180,0.04)',
  bg3: 'rgba(120,80,180,0.07)',
  bg4: 'rgba(120,80,180,0.10)',
  glassBg: 'rgba(244, 240, 250, 0.82)',
  glassBorder: 'rgba(120,80,180,0.10)',
  glassBorderHi: 'rgba(120,80,180,0.16)',
  text0: '#3b2459',
  text1: '#5e3f80',
  text2: '#856aa3',
  text3: '#ad94c4',
  chromeBg: 'rgba(244, 240, 250, 0.88)',
  windowBg: '#f4f0fa',
  windowBorder: 'rgba(120,80,180,0.10)',
  desktopBg: '#e6d8f5',
};

// Baby Pink — pastel suave rosa nube, light theme cute.
const BABY_PINK_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#fce4ec',
  bg1: '#fad4e2',
  bg2: 'rgba(180,60,110,0.04)',
  bg3: 'rgba(180,60,110,0.07)',
  bg4: 'rgba(180,60,110,0.10)',
  glassBg: 'rgba(252, 228, 236, 0.82)',
  glassBorder: 'rgba(180,60,110,0.10)',
  glassBorderHi: 'rgba(180,60,110,0.16)',
  text0: '#4a1d33',
  text1: '#723a55',
  text2: '#9f5d7d',
  text3: '#c98ba8',
  chromeBg: 'rgba(252, 228, 236, 0.88)',
  windowBg: '#fce4ec',
  windowBorder: 'rgba(180,60,110,0.10)',
  desktopBg: '#f8c8da',
};

// Monokai — clásico café/verde/rosa de Sublime Text.
const MONOKAI_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#272822',
  bg1: '#3e3d32',
  bg2: 'rgba(248,248,242,0.04)',
  bg3: 'rgba(248,248,242,0.07)',
  bg4: 'rgba(248,248,242,0.10)',
  glassBg: 'rgba(39, 40, 34, 0.74)',
  glassBorder: 'rgba(248,248,242,0.10)',
  glassBorderHi: 'rgba(248,248,242,0.16)',
  text0: '#f8f8f2',
  text1: '#cccccc',
  text2: '#75715e',
  text3: '#5a5751',
  chromeBg: 'rgba(39, 40, 34, 0.84)',
  windowBg: '#272822',
  windowBorder: 'rgba(248,248,242,0.10)',
  desktopBg: '#1e1f1a',
};

// ─── Temas extravagantes nuevos ───────────────────────────────────────────

// Vaporwave — pastel cyan/magenta/violeta, estética 80s synthwave dreamy.
const VAPORWAVE_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#1a0e2e',
  bg1: '#2d1b4e',
  bg2: 'rgba(255, 0, 200, 0.06)',
  bg3: 'rgba(0, 255, 240, 0.08)',
  bg4: 'rgba(255, 100, 220, 0.12)',
  glassBg: 'rgba(26, 14, 46, 0.78)',
  glassBorder: 'rgba(255, 100, 220, 0.18)',
  glassBorderHi: 'rgba(0, 255, 240, 0.35)',
  text0: '#ffe8ff',
  text1: '#d8b8ff',
  text2: '#9a7ec8',
  text3: '#6a5598',
  chromeBg: 'rgba(26, 14, 46, 0.88)',
  windowBg: '#1a0e2e',
  windowBorder: 'rgba(255, 100, 220, 0.20)',
  desktopBg: '#0e0620',
};

// Aurora — verdes/azules glaciares con violeta sutil, como auroras boreales.
const AURORA_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0a1822',
  bg1: '#142838',
  bg2: 'rgba(0, 255, 180, 0.06)',
  bg3: 'rgba(100, 200, 255, 0.08)',
  bg4: 'rgba(160, 100, 255, 0.10)',
  glassBg: 'rgba(10, 24, 34, 0.80)',
  glassBorder: 'rgba(100, 220, 255, 0.16)',
  glassBorderHi: 'rgba(150, 255, 200, 0.30)',
  text0: '#e0f8ff',
  text1: '#b8e0d8',
  text2: '#7a9aa0',
  text3: '#506872',
  chromeBg: 'rgba(10, 24, 34, 0.90)',
  windowBg: '#0a1822',
  windowBorder: 'rgba(100, 220, 255, 0.18)',
  desktopBg: '#040d14',
};

// Volcano — negro absoluto con lava naranja/rojo brillante.
const VOLCANO_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0a0202',
  bg1: '#1f0a04',
  bg2: 'rgba(255, 80, 0, 0.06)',
  bg3: 'rgba(255, 140, 50, 0.10)',
  bg4: 'rgba(255, 200, 100, 0.12)',
  glassBg: 'rgba(10, 2, 2, 0.85)',
  glassBorder: 'rgba(255, 100, 30, 0.22)',
  glassBorderHi: 'rgba(255, 200, 80, 0.40)',
  text0: '#fff5e8',
  text1: '#ffd0a0',
  text2: '#c89070',
  text3: '#8a5a44',
  chromeBg: 'rgba(10, 2, 2, 0.92)',
  windowBg: '#0a0202',
  windowBorder: 'rgba(255, 100, 30, 0.25)',
  desktopBg: '#050101',
};

// Galaxy — púrpura espacial profundo con vibe cosmos.
const GALAXY_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0a0418',
  bg1: '#1a0a38',
  bg2: 'rgba(180, 130, 255, 0.06)',
  bg3: 'rgba(120, 80, 255, 0.10)',
  bg4: 'rgba(220, 180, 255, 0.12)',
  glassBg: 'rgba(10, 4, 24, 0.85)',
  glassBorder: 'rgba(160, 110, 255, 0.20)',
  glassBorderHi: 'rgba(220, 180, 255, 0.36)',
  text0: '#f0e8ff',
  text1: '#c8b8ff',
  text2: '#8878c8',
  text3: '#584878',
  chromeBg: 'rgba(10, 4, 24, 0.92)',
  windowBg: '#0a0418',
  windowBorder: 'rgba(160, 110, 255, 0.22)',
  desktopBg: '#04020e',
};

// Matrix — negro puro + verde fosforescente estilo hacker.
const MATRIX_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#000000',
  bg1: '#001a08',
  bg2: 'rgba(0, 255, 80, 0.05)',
  bg3: 'rgba(0, 255, 120, 0.10)',
  bg4: 'rgba(80, 255, 100, 0.14)',
  glassBg: 'rgba(0, 0, 0, 0.90)',
  glassBorder: 'rgba(0, 255, 100, 0.20)',
  glassBorderHi: 'rgba(80, 255, 120, 0.45)',
  text0: '#d0ffd0',
  text1: '#80ff90',
  text2: '#40a060',
  text3: '#206040',
  chromeBg: 'rgba(0, 0, 0, 0.96)',
  windowBg: '#000000',
  windowBorder: 'rgba(0, 255, 100, 0.25)',
  desktopBg: '#000000',
};

// Sunset — naranja/rosa/durazno cálido. Vibe atardecer tropical.
const SUNSET_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#2a0e18',
  bg1: '#4a1828',
  bg2: 'rgba(255, 140, 100, 0.08)',
  bg3: 'rgba(255, 180, 120, 0.12)',
  bg4: 'rgba(255, 200, 150, 0.16)',
  glassBg: 'rgba(42, 14, 24, 0.80)',
  glassBorder: 'rgba(255, 150, 120, 0.20)',
  glassBorderHi: 'rgba(255, 200, 150, 0.40)',
  text0: '#fff0e8',
  text1: '#ffc8b0',
  text2: '#d09078',
  text3: '#8a604c',
  chromeBg: 'rgba(42, 14, 24, 0.90)',
  windowBg: '#2a0e18',
  windowBorder: 'rgba(255, 150, 120, 0.22)',
  desktopBg: '#1a0810',
};

// Bubblegum — rosa chicle + cyan caramelo. Light theme dulce.
const BUBBLEGUM_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#fff0f8',
  bg1: '#ffe0f0',
  bg2: 'rgba(255, 100, 180, 0.08)',
  bg3: 'rgba(0, 200, 220, 0.10)',
  bg4: 'rgba(255, 150, 200, 0.14)',
  glassBg: 'rgba(255, 240, 248, 0.86)',
  glassBorder: 'rgba(255, 120, 180, 0.22)',
  glassBorderHi: 'rgba(0, 200, 220, 0.40)',
  text0: '#4a1840',
  text1: '#7a3060',
  text2: '#a85894',
  text3: '#c890b8',
  chromeBg: 'rgba(255, 240, 248, 0.94)',
  windowBg: '#fff0f8',
  windowBorder: 'rgba(255, 120, 180, 0.24)',
  desktopBg: '#ffe8f4',
};

// Acid Yellow — fondo oscuro con amarillo fluo eléctrico.
const ACID_YELLOW_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#161200',
  bg1: '#2a2008',
  bg2: 'rgba(255, 240, 0, 0.07)',
  bg3: 'rgba(255, 240, 0, 0.12)',
  bg4: 'rgba(255, 255, 100, 0.16)',
  glassBg: 'rgba(22, 18, 0, 0.85)',
  glassBorder: 'rgba(255, 240, 0, 0.22)',
  glassBorderHi: 'rgba(255, 255, 100, 0.45)',
  text0: '#fffce0',
  text1: '#e8d870',
  text2: '#a09040',
  text3: '#605820',
  chromeBg: 'rgba(22, 18, 0, 0.92)',
  windowBg: '#161200',
  windowBorder: 'rgba(255, 240, 0, 0.25)',
  desktopBg: '#0c0900',
};

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

// Mustard — warm dark yellow/olive. Vintage academic.
const MUSTARD_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#1a1408',
  bg1: '#2e2412',
  bg2: 'rgba(220, 180, 50, 0.06)',
  bg3: 'rgba(220, 180, 50, 0.10)',
  bg4: 'rgba(240, 200, 80, 0.14)',
  glassBg: 'rgba(26, 20, 8, 0.84)',
  glassBorder: 'rgba(220, 180, 50, 0.20)',
  glassBorderHi: 'rgba(240, 200, 80, 0.38)',
  text0: '#fff0c8',
  text1: '#e0c870',
  text2: '#a08838',
  text3: '#604820',
  chromeBg: 'rgba(26, 20, 8, 0.92)',
  windowBg: '#1a1408',
  windowBorder: 'rgba(220, 180, 50, 0.22)',
  desktopBg: '#100c04',
};

// Cherry Bomb — pink-red neón vibrante, fondo casi negro.
const CHERRY_BOMB_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#100208',
  bg1: '#2a0818',
  bg2: 'rgba(255, 30, 100, 0.08)',
  bg3: 'rgba(255, 80, 140, 0.12)',
  bg4: 'rgba(255, 150, 180, 0.16)',
  glassBg: 'rgba(16, 2, 8, 0.88)',
  glassBorder: 'rgba(255, 50, 110, 0.24)',
  glassBorderHi: 'rgba(255, 150, 180, 0.45)',
  text0: '#ffe0ec',
  text1: '#ffa8c4',
  text2: '#c06888',
  text3: '#783050',
  chromeBg: 'rgba(16, 2, 8, 0.94)',
  windowBg: '#100208',
  windowBorder: 'rgba(255, 50, 110, 0.28)',
  desktopBg: '#080104',
};

// Sakura — light theme con pétalos rosa pastel. Delicado y limpio.
const SAKURA_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...LIGHT_BASE,
  bg0: '#fff5f8',
  bg1: '#ffe8ee',
  bg2: 'rgba(255, 120, 160, 0.06)',
  bg3: 'rgba(200, 100, 140, 0.08)',
  bg4: 'rgba(255, 150, 180, 0.12)',
  glassBg: 'rgba(255, 245, 248, 0.88)',
  glassBorder: 'rgba(255, 140, 170, 0.20)',
  glassBorderHi: 'rgba(200, 100, 140, 0.38)',
  text0: '#502838',
  text1: '#784858',
  text2: '#a87088',
  text3: '#c898a8',
  chromeBg: 'rgba(255, 245, 248, 0.94)',
  windowBg: '#fff5f8',
  windowBorder: 'rgba(255, 140, 170, 0.22)',
  desktopBg: '#ffeef2',
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

// Royal — púrpura real profundo con dorado sutil. Lujo.
const ROYAL_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0e0420',
  bg1: '#1c0a3a',
  bg2: 'rgba(200, 160, 60, 0.06)',
  bg3: 'rgba(140, 100, 220, 0.10)',
  bg4: 'rgba(240, 200, 100, 0.12)',
  glassBg: 'rgba(14, 4, 32, 0.86)',
  glassBorder: 'rgba(200, 160, 60, 0.22)',
  glassBorderHi: 'rgba(140, 100, 220, 0.40)',
  text0: '#f0e0ff',
  text1: '#d0b890',
  text2: '#988068',
  text3: '#605040',
  chromeBg: 'rgba(14, 4, 32, 0.94)',
  windowBg: '#0e0420',
  windowBorder: 'rgba(200, 160, 60, 0.25)',
  desktopBg: '#080214',
};

// Carbon — gris oscuro industrial, casi negro con sutiles tonos azules.
const CARBON_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#0e1014',
  bg1: '#1a1d23',
  bg2: 'rgba(160, 180, 200, 0.06)',
  bg3: 'rgba(160, 180, 200, 0.09)',
  bg4: 'rgba(200, 220, 240, 0.12)',
  glassBg: 'rgba(14, 16, 20, 0.86)',
  glassBorder: 'rgba(180, 200, 220, 0.14)',
  glassBorderHi: 'rgba(200, 220, 240, 0.30)',
  text0: '#e8eef4',
  text1: '#a8b8c8',
  text2: '#6878a0',
  text3: '#404858',
  chromeBg: 'rgba(14, 16, 20, 0.94)',
  windowBg: '#0e1014',
  windowBorder: 'rgba(180, 200, 220, 0.16)',
  desktopBg: '#07090c',
};

// Neon Night — púrpura oscuro con magenta/cyan neón brillante.
const NEON_NIGHT_BASE: Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'> = {
  ...DARK_BASE,
  bg0: '#06000c',
  bg1: '#150828',
  bg2: 'rgba(255, 0, 200, 0.08)',
  bg3: 'rgba(0, 240, 255, 0.10)',
  bg4: 'rgba(180, 0, 255, 0.14)',
  glassBg: 'rgba(6, 0, 12, 0.92)',
  glassBorder: 'rgba(255, 0, 200, 0.25)',
  glassBorderHi: 'rgba(0, 240, 255, 0.50)',
  text0: '#ffe8ff',
  text1: '#d8a0ff',
  text2: '#9866c8',
  text3: '#5a3878',
  chromeBg: 'rgba(6, 0, 12, 0.96)',
  windowBg: '#06000c',
  windowBorder: 'rgba(255, 0, 200, 0.30)',
  desktopBg: '#020006',
};

// Mapping de cada modo a su base. Mantenemos los tres originales por compat
// y agregamos las nuevas variantes.
const THEME_BASES: Record<EffectiveThemeMode, Omit<Tokens, 'accent' | 'accentDim' | 'accentGlow' | 'accentFaint'>> = {
  'dark': DARK_BASE,
  'light': LIGHT_BASE,
  'amoled': AMOLED_BASE,
  'nord': NORD_BASE,
  'tokyo': TOKYO_BASE,
  'gruvbox': GRUVBOX_BASE,
  'solarized-dark': SOL_DARK_BASE,
  'solarized-light': SOL_LIGHT_BASE,
  'sepia': SEPIA_BASE,
  'slate': SLATE_BASE,
  'dracula': DRACULA_BASE,
  'rose-pine': ROSE_PINE_BASE,
  'catppuccin-mocha': CATPPUCCIN_MOCHA_BASE,
  'catppuccin-latte': CATPPUCCIN_LATTE_BASE,
  'pink': PINK_BASE,
  'cyberpunk': CYBERPUNK_BASE,
  'synthwave': SYNTHWAVE_BASE,
  'forest': FOREST_BASE,
  'ocean': OCEAN_BASE,
  'coffee': COFFEE_BASE,
  'lavender': LAVENDER_BASE,
  'monokai': MONOKAI_BASE,
  'baby-pink': BABY_PINK_BASE,
  'vaporwave': VAPORWAVE_BASE,
  'aurora': AURORA_BASE,
  'volcano': VOLCANO_BASE,
  'galaxy': GALAXY_BASE,
  'matrix': MATRIX_BASE,
  'sunset': SUNSET_BASE,
  'bubblegum': BUBBLEGUM_BASE,
  'neon-night': NEON_NIGHT_BASE,
  'acid-yellow': ACID_YELLOW_BASE,
  'blood-moon': BLOOD_MOON_BASE,
  'mustard': MUSTARD_BASE,
  'cherry-bomb': CHERRY_BOMB_BASE,
  'sakura': SAKURA_BASE,
  'emerald': EMERALD_BASE,
  'royal': ROYAL_BASE,
  'carbon': CARBON_BASE,
};

// Luminosidad del accent por tema — los oscuros usan accent claro (~76-82%),
// los claros uno más sat/oscuro (~58-62%) para que tenga contraste.
const ACCENT_LUMINOSITY: Record<EffectiveThemeMode, number> = {
  'dark': 78,
  'light': 60,
  'amoled': 82,
  'nord': 76,
  'tokyo': 78,
  'gruvbox': 74,
  'solarized-dark': 76,
  'solarized-light': 58,
  'sepia': 56,
  'slate': 78,
  'dracula': 78,
  'rose-pine': 76,
  'catppuccin-mocha': 76,
  'catppuccin-latte': 58,
  'pink': 80,
  'cyberpunk': 82,
  'synthwave': 80,
  'forest': 74,
  'ocean': 76,
  'coffee': 74,
  'lavender': 56,
  'monokai': 76,
  'baby-pink': 56,
  'vaporwave': 80,
  'aurora': 78,
  'volcano': 78,
  'galaxy': 80,
  'matrix': 78,
  'sunset': 80,
  'bubblegum': 56,
  'neon-night': 82,
  'acid-yellow': 84,
  'blood-moon': 76,
  'mustard': 74,
  'cherry-bomb': 80,
  'sakura': 58,
  'emerald': 78,
  'royal': 78,
  'carbon': 76,
};

// Metadata para mostrar al usuario en el picker de Apariencia.
export type ThemeKind = 'dark' | 'light';
// Set curado de temas — quitamos los demasiado similares entre sí (slate≈tokyo,
// catppuccin-latte≈light, lavender≈baby-pink, pink≈synthwave). Cada uno tiene
// personalidad distintiva.
export const THEME_VARIANTS: { id: EffectiveThemeMode; name: string; kind: ThemeKind; preview: string }[] = [
  // Esenciales
  { id: 'dark',            name: 'Oscuro',          kind: 'dark',  preview: '#0a0a0c' },
  { id: 'light',           name: 'Claro',           kind: 'light', preview: '#fbfbfd' },
  { id: 'amoled',          name: 'AMOLED',          kind: 'dark',  preview: '#000000' },
  // Clásicos editor
  { id: 'nord',            name: 'Nord',            kind: 'dark',  preview: '#2e3440' },
  { id: 'tokyo',           name: 'Tokyo Night',     kind: 'dark',  preview: '#1a1b26' },
  { id: 'gruvbox',         name: 'Gruvbox',         kind: 'dark',  preview: '#282828' },
  { id: 'dracula',         name: 'Dracula',         kind: 'dark',  preview: '#282a36' },
  { id: 'monokai',         name: 'Monokai',         kind: 'dark',  preview: '#272822' },
  // Cálidos / vintage
  { id: 'solarized-dark',  name: 'Solarized Dark',  kind: 'dark',  preview: '#002b36' },
  { id: 'solarized-light', name: 'Solarized Light', kind: 'light', preview: '#fdf6e3' },
  { id: 'sepia',           name: 'Sepia',           kind: 'light', preview: '#f6f0e1' },
  { id: 'coffee',           name: 'Coffee',          kind: 'dark',  preview: '#2a1e15' },
  // Naturaleza / atmosféricos
  { id: 'forest',           name: 'Forest',          kind: 'dark',  preview: '#1a2421' },
  { id: 'ocean',            name: 'Ocean',           kind: 'dark',  preview: '#0a1a2e' },
  // Boutique / con personalidad
  { id: 'rose-pine',        name: 'Rosé Pine',       kind: 'dark',  preview: '#191724' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha',kind: 'dark',  preview: '#1e1e2e' },
  { id: 'synthwave',        name: 'Synthwave',       kind: 'dark',  preview: '#241734' },
  { id: 'cyberpunk',        name: 'Cyberpunk',       kind: 'dark',  preview: '#0d0221' },
  { id: 'baby-pink',        name: 'Baby Pink',       kind: 'light', preview: '#fce4ec' },
  // Extravagantes / experimentales
  { id: 'vaporwave',        name: 'Vaporwave',       kind: 'dark',  preview: '#1a0e2e' },
  { id: 'aurora',           name: 'Aurora Boreal',   kind: 'dark',  preview: '#0a1822' },
  { id: 'volcano',          name: 'Volcán',          kind: 'dark',  preview: '#0a0202' },
  { id: 'galaxy',           name: 'Galaxia',         kind: 'dark',  preview: '#0a0418' },
  { id: 'matrix',           name: 'Matrix',          kind: 'dark',  preview: '#000000' },
  { id: 'sunset',           name: 'Atardecer',       kind: 'dark',  preview: '#2a0e18' },
  { id: 'bubblegum',        name: 'Bubblegum',       kind: 'light', preview: '#fff0f8' },
  { id: 'neon-night',       name: 'Neon Night',      kind: 'dark',  preview: '#06000c' },
  // Amarillos, rojos y otros sin miedo
  { id: 'acid-yellow',      name: 'Acid Yellow',     kind: 'dark',  preview: '#161200' },
  { id: 'blood-moon',       name: 'Blood Moon',      kind: 'dark',  preview: '#0c0204' },
  { id: 'mustard',          name: 'Mostaza',         kind: 'dark',  preview: '#1a1408' },
  { id: 'cherry-bomb',      name: 'Cherry Bomb',     kind: 'dark',  preview: '#100208' },
  { id: 'sakura',           name: 'Sakura',          kind: 'light', preview: '#fff5f8' },
  { id: 'emerald',          name: 'Esmeralda',       kind: 'dark',  preview: '#041810' },
  { id: 'royal',            name: 'Real',            kind: 'dark',  preview: '#0e0420' },
  { id: 'carbon',           name: 'Carbón',          kind: 'dark',  preview: '#0e1014' },
];

export function isLightTheme(mode: EffectiveThemeMode): boolean {
  return (
    mode === 'light' ||
    mode === 'solarized-light' ||
    mode === 'sepia' ||
    mode === 'baby-pink' ||
    mode === 'bubblegum' ||
    mode === 'sakura'
  );
}

export function buildTokens(mode: EffectiveThemeMode, accentHue: number): Tokens {
  const base = THEME_BASES[mode] ?? DARK_BASE;
  const L = ACCENT_LUMINOSITY[mode] ?? 78;
  return {
    ...base,
    accent: `oklch(${L}% 0.13 ${accentHue})`,
    accentDim: `oklch(${L - 14}% 0.11 ${accentHue})`,
    accentGlow: `oklch(${L}% 0.13 ${accentHue} / 0.22)`,
    accentFaint: `oklch(${L}% 0.13 ${accentHue} / 0.10)`,
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

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'executing' | 'speaking';

// 24 acentos ordenados por hue (rueda de color completa).
// Marcamos «Mint (Eco)» (165) como el accent oficial del producto.
// Lista curada de acentos — 14 colores bien distintivos, distribuidos por el
// círculo cromático con saltos mínimos de ~20° para que ninguno se confunda
// con el vecino. Foco en colores vibrantes y "cool".
export const ACCENT_HUES = [
  { hue: 165, name: 'Mint (Eco)' },   // el oficial
  { hue: 5,   name: 'Rojo sangre' },
  { hue: 10,  name: 'Rojo cereza' },
  { hue: 20,  name: 'Ladrillo' },
  { hue: 30,  name: 'Coral' },
  { hue: 45,  name: 'Ámbar' },
  { hue: 55,  name: 'Naranja' },
  { hue: 70,  name: 'Amarillo' },
  { hue: 85,  name: 'Dorado' },
  { hue: 100, name: 'Mostaza' },
  { hue: 125, name: 'Verde lima' },
  { hue: 145, name: 'Esmeralda' },
  { hue: 150, name: 'Verde' },
  { hue: 175, name: 'Verde agua' },
  { hue: 185, name: 'Turquesa' },
  { hue: 195, name: 'Cian eléctrico' },
  { hue: 210, name: 'Cielo' },
  { hue: 230, name: 'Azul real' },
  { hue: 245, name: 'Azul' },
  { hue: 260, name: 'Índigo' },
  { hue: 275, name: 'Lavanda' },
  { hue: 285, name: 'Púrpura' },
  { hue: 295, name: 'Violeta' },
  { hue: 315, name: 'Fucsia' },
  { hue: 325, name: 'Magenta' },
  { hue: 350, name: 'Rosa' },
];
