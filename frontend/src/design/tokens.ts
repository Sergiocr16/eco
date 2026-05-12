export type ThemeMode =
  | 'dark' | 'light' | 'system' | 'amoled'
  | 'nord' | 'tokyo' | 'gruvbox' | 'solarized-dark' | 'solarized-light'
  | 'sepia' | 'slate' | 'dracula' | 'rose-pine'
  | 'catppuccin-mocha' | 'catppuccin-latte'
  | 'pink' | 'cyberpunk' | 'synthwave' | 'forest' | 'ocean' | 'coffee'
  | 'lavender' | 'monokai' | 'baby-pink';

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
};

// Metadata para mostrar al usuario en el picker de Apariencia.
export type ThemeKind = 'dark' | 'light';
export const THEME_VARIANTS: { id: EffectiveThemeMode; name: string; kind: ThemeKind; preview: string }[] = [
  { id: 'dark',            name: 'Oscuro',          kind: 'dark',  preview: '#0a0a0c' },
  { id: 'light',           name: 'Claro',           kind: 'light', preview: '#fbfbfd' },
  { id: 'amoled',          name: 'AMOLED',          kind: 'dark',  preview: '#000000' },
  { id: 'nord',            name: 'Nord',            kind: 'dark',  preview: '#2e3440' },
  { id: 'tokyo',           name: 'Tokyo Night',     kind: 'dark',  preview: '#1a1b26' },
  { id: 'gruvbox',         name: 'Gruvbox',         kind: 'dark',  preview: '#282828' },
  { id: 'solarized-dark',  name: 'Solarized Dark',  kind: 'dark',  preview: '#002b36' },
  { id: 'solarized-light', name: 'Solarized Light', kind: 'light', preview: '#fdf6e3' },
  { id: 'sepia',           name: 'Sepia',           kind: 'light', preview: '#f6f0e1' },
  { id: 'slate',           name: 'Slate',           kind: 'dark',  preview: '#0f172a' },
  { id: 'dracula',          name: 'Dracula',          kind: 'dark',  preview: '#282a36' },
  { id: 'rose-pine',        name: 'Rosé Pine',        kind: 'dark',  preview: '#191724' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', kind: 'dark',  preview: '#1e1e2e' },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', kind: 'light', preview: '#eff1f5' },
  { id: 'pink',             name: 'Pink',             kind: 'dark',  preview: '#2a1226' },
  { id: 'cyberpunk',        name: 'Cyberpunk',        kind: 'dark',  preview: '#0d0221' },
  { id: 'synthwave',        name: 'Synthwave',        kind: 'dark',  preview: '#241734' },
  { id: 'forest',           name: 'Forest',           kind: 'dark',  preview: '#1a2421' },
  { id: 'ocean',            name: 'Ocean',            kind: 'dark',  preview: '#0a1a2e' },
  { id: 'coffee',           name: 'Coffee',           kind: 'dark',  preview: '#2a1e15' },
  { id: 'lavender',         name: 'Lavender',         kind: 'light', preview: '#f4f0fa' },
  { id: 'monokai',          name: 'Monokai',          kind: 'dark',  preview: '#272822' },
  { id: 'baby-pink',        name: 'Baby Pink',        kind: 'light', preview: '#fce4ec' },
];

export function isLightTheme(mode: EffectiveThemeMode): boolean {
  return (
    mode === 'light' ||
    mode === 'solarized-light' ||
    mode === 'sepia' ||
    mode === 'catppuccin-latte' ||
    mode === 'lavender' ||
    mode === 'baby-pink'
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
export const ACCENT_HUES = [
  { hue: 165, name: 'Mint (Eco)' },
  // Rojos / cálidos
  { hue: 5,   name: 'Rojo' },
  { hue: 15,  name: 'Coral' },
  { hue: 25,  name: 'Salmón' },
  { hue: 40,  name: 'Naranja' },
  { hue: 55,  name: 'Mandarina' },
  { hue: 75,  name: 'Ámbar' },
  { hue: 90,  name: 'Amarillo' },
  // Verdes
  { hue: 105, name: 'Lima' },
  { hue: 125, name: 'Verde lima' },
  { hue: 145, name: 'Verde' },
  { hue: 155, name: 'Verde menta' },
  { hue: 180, name: 'Esmeralda' },
  // Cianes / azules
  { hue: 195, name: 'Turquesa' },
  { hue: 210, name: 'Cielo' },
  { hue: 220, name: 'Cian' },
  { hue: 235, name: 'Azur' },
  { hue: 240, name: 'Azul' },
  // Violetas / rosas
  { hue: 260, name: 'Índigo' },
  { hue: 275, name: 'Lavanda' },
  { hue: 285, name: 'Violeta' },
  { hue: 300, name: 'Púrpura' },
  { hue: 320, name: 'Magenta' },
  { hue: 340, name: 'Fucsia' },
  { hue: 350, name: 'Rosa' },
];
