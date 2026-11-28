import { useEffect } from 'react';
import { useTheme } from '@/design/theme';
import { isLightTheme, type EffectiveThemeMode } from '@/design/tokens';
import { CLAUDE_THEME_FOR_ECO } from '@/design/claude-theme-map';
import { apiFetch } from '@/lib/api';
import { getClaudeTheme } from '@/hooks/useClaudeTheme';

/** Tema de Claude que corresponde a una apariencia. */
export function claudeThemeFor(mode: EffectiveThemeMode): string {
  return CLAUDE_THEME_FOR_ECO[mode];
}

function pushClaudeTheme(mode: EffectiveThemeMode): void {
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

// Al cambiar la apariencia de Eco (o el modo del sistema con "Sistema")
// escribe el tema de Claude Code que corresponde. Montado una vez en el shell autenticado. El backend ignora el
// write si el tema ya es ese.
export function useClaudeThemeSync(): void {
  const { effectiveMode } = useTheme();
  useEffect(() => {
    pushClaudeTheme(effectiveMode);
  }, [effectiveMode]);
}
