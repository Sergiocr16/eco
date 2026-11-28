import type { EffectiveThemeMode } from './tokens';

// Tema de Claude Code (galería ccthemes) que acompaña a cada apariencia de
// Eco. Al cambiar la apariencia, Eco lo escribe en `~/.claude/settings.json`
// (ver hooks/useClaudeThemeSync.ts) y la terminal de Claude lo sigue. Si el
// tema no está instalado, el backend cae al `dark`/`light` built-in.
export const CLAUDE_THEME_FOR_ECO: Record<EffectiveThemeMode, string> = {
  dark: 'graphite',
  light: 'github-light',
};
