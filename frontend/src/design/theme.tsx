import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildTokens, isLightTheme, defaultHueForTheme, THEME_VARIANTS, type ThemeMode, type EffectiveThemeMode, type Tokens } from './tokens';

type ThemeContextValue = {
  mode: ThemeMode;
  effectiveMode: EffectiveThemeMode;
  accentHue: number;
  setMode: (m: ThemeMode) => void;
  setAccentHue: (hue: number) => void;
  t: Tokens;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_MODE = 'eco.theme.mode';
const STORAGE_HUE = 'eco.theme.hue';

function readStored<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return (v as T) || fallback;
  } catch { return fallback; }
}

// El set de temas se curó (de ~38 a 12). Un `eco.theme.mode` viejo —o uno
// restaurado por backup.ts, que repone todas las eco.*— puede tener un id que
// ya no existe. Este guard es la fuente autoritativa de validación: si el id
// guardado no es válido, lo mapeamos al tema sobreviviente más cercano (o
// 'dark'). NO reescribe localStorage en el load; solo resuelve en runtime.
const VALID_MODES = new Set<string>(['system', ...THEME_VARIANTS.map((v) => v.id)]);
const MODE_MIGRATION: Record<string, ThemeMode> = {
  amoled: 'dark', monokai: 'dark', carbon: 'dark',
  nord: 'slate', tokyo: 'slate',
  'solarized-dark': 'ocean', aurora: 'ocean',
  forest: 'emerald', matrix: 'emerald',
  coffee: 'gruvbox', mustard: 'gruvbox', 'acid-yellow': 'gruvbox',
  cyberpunk: 'dracula', synthwave: 'dracula', galaxy: 'dracula',
  vaporwave: 'dracula', 'neon-night': 'dracula', royal: 'dracula',
  'catppuccin-mocha': 'rose-pine', pink: 'rose-pine',
  volcano: 'blood-moon', 'cherry-bomb': 'blood-moon', sunset: 'blood-moon',
  // Claros
  'solarized-light': 'sand', sepia: 'sand', linen: 'sand', peach: 'sand',
  'catppuccin-latte': 'light',
  'baby-pink': 'mint', bubblegum: 'mint', sakura: 'mint',
};

function readStoredMode(): ThemeMode {
  const raw = readStored(STORAGE_MODE, 'dark');
  if (VALID_MODES.has(raw)) return raw as ThemeMode;
  return MODE_MIGRATION[raw] ?? 'dark';
}

function resolveSystem(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [systemMode, setSystemMode] = useState<'dark' | 'light'>(resolveSystem);
  const [accentHue, setAccentHueState] = useState<number>(() => Number(readStored(STORAGE_HUE, '165')));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystemMode(mq.matches ? 'light' : 'dark');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const effectiveMode: EffectiveThemeMode = mode === 'system' ? systemMode : mode;

  const t = useMemo(() => buildTokens(effectiveMode, accentHue), [effectiveMode, accentHue]);

  const setAccentHue = (h: number) => {
    setAccentHueState(h);
    try { window.localStorage.setItem(STORAGE_HUE, String(h)); } catch { /* noop */ }
  };
  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try { window.localStorage.setItem(STORAGE_MODE, m); } catch { /* noop */ }
    // Coupling: al elegir un tema se aplica su acento de firma coordinado, así
    // el tema "se ve" de su color. El usuario lo puede sobrescribir después y
    // queda hasta el próximo cambio de tema. 'system' resuelve por systemMode.
    const resolved = m === 'system' ? systemMode : m;
    setAccentHue(defaultHueForTheme(resolved));
  };

  useEffect(() => {
    // CSS color-scheme solo acepta 'dark' o 'light'; consultamos al tema.
    document.documentElement.style.colorScheme = isLightTheme(effectiveMode) ? 'light' : 'dark';
    document.body.style.background = t.desktopBg;
    document.body.style.color = t.text0;
  }, [effectiveMode, t.desktopBg, t.text0]);

  const value: ThemeContextValue = { mode, effectiveMode, accentHue, setMode, setAccentHue, t };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function useTokens(): Tokens {
  return useTheme().t;
}
