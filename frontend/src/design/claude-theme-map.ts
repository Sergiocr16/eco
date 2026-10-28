import type { EffectiveThemeMode } from './tokens';

// Tema de Claude Code (galería ccthemes, `/theme-gallery`) que mejor combina
// con cada apariencia de Eco. Al cambiar la apariencia, Eco escribe este tema
// en `~/.claude/settings.json` (ver hooks/useClaudeThemeSync.ts) y la
// terminal de Claude lo sigue. Si el tema no está instalado, el backend cae
// al `dark`/`light` built-in según el tono de la apariencia.
export const CLAUDE_THEME_FOR_ECO: Record<EffectiveThemeMode, string> = {
  // Oscuros
  'dark':       'graphite',       // Grafito: gris neutro
  'slate':      'campbell',       // Azul Rey: azul real
  'ocean':      'night-owl',      // Océano: azul profundo
  'emerald':    'patina',         // Esmeralda: verde oscuro
  'dracula':    'dracula',        // Violeta
  'indigo':     'nebula-drift',   // Índigo
  'rose-pine':  'rose-pine',      // Rosa
  'gruvbox':    'gruvbox',        // Ámbar
  'blood-moon': 'oxblood',        // Carmesí
  'aurora':     'horizon',        // Aurora: teal sobre azul
  'nebula':     'velvet-court',   // Nebulosa: magenta/púrpura
  'horizon':    'oxblood',        // Horizonte: naranja sobre marrón
  'lagoon':     'verdigris',      // Laguna: teal-verde
  'obsidian':   'oxocarbon',      // Obsidiana: casi negro, azul frío
  'honey':      'driftwood',      // Miel
  // Claros
  'light':      'github-light',   // Claro: blanco neutro
  'sky':        'frostbyte',      // Cielo: azul hielo
  'lavender':   'aubade',         // Lavanda
  'sand':       'letterpress',    // Arena: papel cálido
  'mint':       'matcha-zen',     // Menta
  'frost':      'frostbyte',      // Escarcha: azul hielo
  'prism':      'catppuccin-latte', // Prisma: pastel multicolor
  'peach':      'rose-pine-dawn', // Durazno: rosa cálido
};
