import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildTokens, type ThemeMode, type Tokens } from './tokens';

type ThemeContextValue = {
  mode: ThemeMode;
  effectiveMode: 'dark' | 'light' | 'amoled';
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

function resolveSystem(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored(STORAGE_MODE, 'dark') as ThemeMode);
  const [systemMode, setSystemMode] = useState<'dark' | 'light'>(resolveSystem);
  const [accentHue, setAccentHueState] = useState<number>(() => Number(readStored(STORAGE_HUE, '165')));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystemMode(mq.matches ? 'light' : 'dark');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const effectiveMode: 'dark' | 'light' | 'amoled' = mode === 'system' ? systemMode : mode;

  const t = useMemo(() => buildTokens(effectiveMode, accentHue), [effectiveMode, accentHue]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try { window.localStorage.setItem(STORAGE_MODE, m); } catch { /* noop */ }
  };
  const setAccentHue = (h: number) => {
    setAccentHueState(h);
    try { window.localStorage.setItem(STORAGE_HUE, String(h)); } catch { /* noop */ }
  };

  useEffect(() => {
    // CSS color-scheme solo acepta 'dark' o 'light'; mapeamos amoled → dark.
    const css = effectiveMode === 'light' ? 'light' : 'dark';
    document.documentElement.style.colorScheme = css;
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
