import { useEffect } from 'react';
import { useTheme } from '@/design/theme';
import { isLightTheme, type EffectiveThemeMode } from '@/design/tokens';
import { CLAUDE_THEME_FOR_ECO } from '@/design/claude-theme-map';
import { CLAUDE_THEME_CATALOG } from '@/design/claude-theme-catalog';
import { apiFetch } from '@/lib/api';
import { getPrefs, subscribePrefs, updatePrefs } from '@/lib/prefs-sync';
import { getClaudeTheme } from '@/hooks/useClaudeTheme';

export const CLAUDE_THEME_SYNC_KEY = 'eco.claude.theme_sync';
export const CLAUDE_THEME_SYNC_EVENT = 'eco:claude_theme_sync_changed';

export function claudeThemeSyncEnabled(): boolean {
  try { return window.localStorage.getItem(CLAUDE_THEME_SYNC_KEY) !== '0'; } catch { return true; }
}

const KNOWN = new Set(CLAUDE_THEME_CATALOG.map((c) => c.id));

/** Tema de Claude que corresponde a una apariencia: el elegido por el usuario o el recomendado. */
export function claudeThemeFor(mode: EffectiveThemeMode): string {
  const chosen = getPrefs().claudeThemes?.[mode];
  if (chosen && KNOWN.has(chosen)) return chosen;
  return CLAUDE_THEME_FOR_ECO[mode];
}

/** Guarda la elección por usuario (prefs en Firestore). `null` vuelve al recomendado. */
export function setClaudeThemeFor(mode: EffectiveThemeMode, id: string | null): void {
  const next = { ...(getPrefs().claudeThemes ?? {}) };
  if (id && id !== CLAUDE_THEME_FOR_ECO[mode]) next[mode] = id; else delete next[mode];
  updatePrefs({ claudeThemes: next });
}

function pushClaudeTheme(mode: EffectiveThemeMode): void {
  if (!claudeThemeSyncEnabled()) return;
  const theme = claudeThemeFor(mode);
  if (!theme) return;
  const cur = getClaudeTheme().id;
  if (cur === `custom:${theme}` || cur.endsWith(`:${theme}`)) return;
  void apiFetch('/config/claude-theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme, fallback: isLightTheme(mode) ? 'light' : 'dark' }),
  }).then(async (r) => {
    if (!r.ok) console.warn('[claude-theme] sync rechazado', r.status, await r.text().catch(() => ''));
  }).catch((e) => { console.warn('[claude-theme] sync falló', e); });
}

// Al cambiar la apariencia de Eco (o el modo del sistema con "Sistema"), o la
// elección del usuario para esa apariencia, escribe el tema de Claude Code que
// corresponde. Montado una vez en el shell autenticado. El backend ignora el
// write si el tema ya es ese.
export function useClaudeThemeSync(): void {
  const { effectiveMode } = useTheme();
  useEffect(() => {
    const apply = () => pushClaudeTheme(effectiveMode);
    apply();
    window.addEventListener(CLAUDE_THEME_SYNC_EVENT, apply);
    const unsub = subscribePrefs(apply);
    return () => { window.removeEventListener(CLAUDE_THEME_SYNC_EVENT, apply); unsub(); };
  }, [effectiveMode]);
}
