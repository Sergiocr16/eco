import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildTokens, isLightTheme, type ThemeMode, type EffectiveThemeMode, type Tokens } from './tokens';
import { buildLegacyTokens, isLegacyLight, LEGACY_THEME_VARIANTS, type LegacyEffectiveMode } from './legacy-graph-tokens';
import { updatePrefs, subscribePrefs } from '@/lib/prefs-sync';
import { isPhoneNow } from '@/hooks/useMediaQuery';

type ThemeContextValue = {
  mode: ThemeMode;
  effectiveMode: EffectiveThemeMode;
  /** null = el acento propio del tema. */
  accentHue: number | null;
  setMode: (m: ThemeMode) => void;
  setAccentHue: (hue: number | null) => void;
  t: Tokens;
  /** true solo dentro de <LegacyGraphTheme>: las primitivas pintan el estilo anterior. */
  legacy?: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_MODE = 'eco.theme.mode';
const STORAGE_ACCENT = 'eco.theme.accent';
// Tema y acento que el usuario tenía antes del rediseño v2. Solo lo lee el
// grafo del Dashboard, que se conserva tal cual estaba.
const STORAGE_LEGACY = 'eco.graph.legacy';
const STORAGE_OLD_HUE = 'eco.theme.hue';

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* noop */ }
}

const LEGACY_IDS = new Map<string, 'dark' | 'light'>(LEGACY_THEME_VARIANTS.map((v) => [v.id, v.kind]));

// Los 23 temas anteriores se redujeron a dos: cualquier id viejo cae al claro
// u oscuro según su tono. Los ids desconocidos caen a oscuro.
function migrateMode(raw: string | null | undefined): ThemeMode {
  if (raw === 'system' || raw === 'light' || raw === 'dark') return raw;
  if (raw && LEGACY_IDS.get(raw) === 'light') return 'light';
  return 'dark';
}

type LegacySnapshot = { mode: LegacyEffectiveMode; hue: number };

function readLegacySnapshot(): LegacySnapshot | null {
  const raw = readStored(STORAGE_LEGACY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as LegacySnapshot;
    if (LEGACY_IDS.has(v.mode) && Number.isFinite(v.hue)) return v;
  } catch { /* noop */ }
  return null;
}

function rememberLegacy(mode: string | null | undefined, hue: unknown) {
  if (readStored(STORAGE_LEGACY) || !mode || !LEGACY_IDS.has(mode)) return;
  const h = Number(hue);
  writeStored(STORAGE_LEGACY, JSON.stringify({ mode, hue: Number.isFinite(h) && hue != null && hue !== '' ? h : 165 }));
}

function readAccent(): number | null {
  const raw = readStored(STORAGE_ACCENT);
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveSystem(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// Variables CSS que leen las clases de eco.css. Fuente única: los tokens.
function applyCssVars(t: Tokens, mode: EffectiveThemeMode) {
  const s = document.documentElement.style;
  const vars: Record<string, string> = {
    '--bg': t.bg, '--sheet': t.sheet, '--card': t.card, '--raised': t.raised, '--hover': t.hover,
    '--line': t.line, '--line2': t.line2,
    '--tx': t.text0, '--tx2': t.text1, '--tx3': t.text2, '--tx4': t.text3,
    '--ac': t.accent, '--ac-tx': t.accentOn, '--ac-soft': t.accentSoft, '--ac-line': t.accentLine,
    '--ok': t.ok, '--ok-soft': t.okSoft, '--warn': t.warn, '--warn-soft': t.warnSoft,
    '--err': t.err, '--info': t.info, '--scrim': t.scrimBg ?? 'rgba(0,0,0,.45)',
    '--shadow-md': t.shadowMd, '--shadow-lg': t.shadowLg,
    '--font-sans': t.fontSans, '--font-mono': t.fontMono,
  };
  for (const [k, v] of Object.entries(vars)) s.setProperty(k, v);
  document.documentElement.dataset.theme = mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const raw = readStored(STORAGE_MODE);
    rememberLegacy(raw, readStored(STORAGE_OLD_HUE));
    return migrateMode(raw);
  });
  const [systemMode, setSystemMode] = useState<'dark' | 'light'>(resolveSystem);
  const [accentHue, setAccentHueState] = useState<number | null>(readAccent);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystemMode(mq.matches ? 'light' : 'dark');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // Sync entre ventanas (la principal y las ventanas "solo bubble" comparten
  // localStorage). `storage` solo se dispara en las OTRAS ventanas.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_MODE || e.key === null) setModeState(migrateMode(readStored(STORAGE_MODE)));
      if (e.key === STORAGE_ACCENT || e.key === null) setAccentHueState(readAccent());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const effectiveMode: EffectiveThemeMode = mode === 'system' ? systemMode : mode;

  const t = useMemo(() => buildTokens(effectiveMode, accentHue), [effectiveMode, accentHue]);

  const setAccentHue = (h: number | null) => {
    setAccentHueState(h);
    writeStored(STORAGE_ACCENT, h == null ? '' : String(h));
    updatePrefs({ accentOverride: h });
  };
  const setMode = (m: ThemeMode) => {
    setModeState(m);
    writeStored(STORAGE_MODE, m);
    updatePrefs({ themeMode: m });
    // Cada tema trae su acento; elegir tema descarta el acento propio.
    setAccentHue(null);
  };

  // Preferencias que llegan del servidor (login / otro dispositivo): se
  // aplican sin re-subirlas.
  useEffect(() => subscribePrefs((p) => {
    if (typeof p.themeMode === 'string') {
      rememberLegacy(p.themeMode, p.accentHue);
      const m = migrateMode(p.themeMode);
      setModeState(m);
      writeStored(STORAGE_MODE, m);
    }
    if (p.accentOverride === null || (typeof p.accentOverride === 'number' && Number.isFinite(p.accentOverride))) {
      setAccentHueState(p.accentOverride);
      writeStored(STORAGE_ACCENT, p.accentOverride == null ? '' : String(p.accentOverride));
    }
  }), []);

  useEffect(() => {
    document.documentElement.style.colorScheme = isLightTheme(effectiveMode) ? 'light' : 'dark';
    applyCssVars(t, effectiveMode);
    // En el teléfono la hoja ocupa toda la pantalla: el fondo del body y el
    // theme-color (que iOS usa para la barra de estado y la franja inferior
    // de la PWA instalada) deben ser el de la hoja, no el de la ventana.
    const outer = isPhoneNow() ? t.sheet : t.bg;
    document.body.style.background = outer;
    document.body.style.color = t.text0;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', outer);
  }, [effectiveMode, t]);

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

/**
 * Envuelve la vista grafo del Dashboard con los tokens anteriores al rediseño
 * v2, para que se vea exactamente como antes. No usar en ninguna otra parte.
 */
export function LegacyGraphTheme({ children }: { children: ReactNode }) {
  const ctx = useTheme();
  const value = useMemo<ThemeContextValue>(() => {
    const snap = readLegacySnapshot();
    const wantLight = ctx.effectiveMode === 'light';
    // El tema viejo del usuario solo aplica si es del mismo tono que el actual.
    const legacyMode: LegacyEffectiveMode = snap && isLegacyLight(snap.mode) === wantLight
      ? snap.mode
      : (wantLight ? 'light' : 'dark');
    const lt = buildLegacyTokens(legacyMode, snap?.hue ?? 165);
    const t: Tokens = {
      ...lt,
      bg: lt.windowBg, sheet: lt.bg1, card: lt.bg2, raised: lt.bg3, hover: lt.bg4,
      line: lt.glassBorder, line2: lt.glassBorderHi, info: lt.busy,
      accentSoft: lt.accentFaint, accentLine: lt.accentGlow,
      okSoft: `color-mix(in oklch, ${lt.ok} 14%, transparent)`,
      warnSoft: `color-mix(in oklch, ${lt.warn} 14%, transparent)`,
    };
    return { ...ctx, t: { ...t, legacy: true }, legacy: true };
  }, [ctx]);
  return (
    <ThemeContext.Provider value={value}>
      <div style={{
        flex: '0 0 auto', minWidth: 0, display: 'flex', flexDirection: 'column',
        position: 'relative', borderRadius: 22, overflow: 'hidden',
        background: value.t.windowBg, backgroundImage: value.t.windowBgImage,
        color: value.t.text0, fontFamily: value.t.fontSans,
      }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
