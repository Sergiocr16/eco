// Baja la galería ccthemes (github.com/livlign/ccthemes, MIT) y regenera:
//   backend/src/claude-themes-data.ts   — definiciones completas (las instala
//                                          el backend en ~/.claude/themes/)
//   frontend/src/design/claude-theme-catalog.ts — id/nombre/tono para el
//                                          selector de Settings → Apariencia
// Uso: node scripts/sync-claude-themes.mjs
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API = 'https://api.github.com/repos/livlign/ccthemes/contents/plugins/theme-gallery/themes';
const RAW = 'https://raw.githubusercontent.com/livlign/ccthemes/main/plugins/theme-gallery/themes/';
const root = resolve(import.meta.dirname, '..');

const list = await (await fetch(API)).json();
if (!Array.isArray(list)) throw new Error('GitHub API: ' + JSON.stringify(list).slice(0, 200));
const ids = list.map((x) => x.name).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).sort();

const defs = {};
for (const id of ids) {
  const d = await (await fetch(RAW + id + '.json')).json();
  if (d.base !== 'dark' && d.base !== 'light') throw new Error(`${id}: base inválida`);
  const overrides = Object.fromEntries(Object.entries(d.overrides ?? {}).filter(([, v]) => typeof v === 'string'));
  defs[id] = { name: String(d.name ?? id), base: d.base, overrides };
}

const header = `// GENERADO por scripts/sync-claude-themes.mjs — no editar a mano.
// Fuente: github.com/livlign/ccthemes (MIT, (c) ccthemes contributors).
`;

let back = header + `
export type ClaudeThemeDef = { name: string; base: 'dark' | 'light'; overrides: Record<string, string> };

export const CLAUDE_THEMES: Record<string, ClaudeThemeDef> = {
`;
for (const id of ids) back += `  ${JSON.stringify(id)}: ${JSON.stringify(defs[id])},\n`;
back += '};\n';
writeFileSync(resolve(root, 'backend/src/claude-themes-data.ts'), back);

// Subconjunto de colores para la tarjeta de vista previa (como la galería):
// fondo, texto, píldora "claude", 6 muestras y las barras de diff.
const SW = ['green', 'red', 'yellow', 'cyan', 'purple', 'blue'];
function preview(d, base) {
  const o = d.overrides;
  const pick = (k, fb) => o[k] ?? fb;
  return {
    bg: pick('userMessageBackground', base === 'dark' ? '#1e1e24' : '#eef0f4'),
    text: pick('text', base === 'dark' ? '#e5e7eb' : '#1d1d1f'),
    muted: pick('inactive', base === 'dark' ? '#8b8f98' : '#6e6e73'),
    claude: pick('claude', '#d97757'),
    swatches: SW.map((c) => pick(`${c}_FOR_SUBAGENTS_ONLY`, pick('claude', '#d97757'))),
    added: pick('diffAdded', base === 'dark' ? '#1f3a24' : '#d4f5dc'),
    removed: pick('diffRemoved', base === 'dark' ? '#4a1e1e' : '#fbd9d9'),
    addedFg: pick('success', '#5fd38d'),
    removedFg: pick('error', '#ff6b6b'),
  };
}

let front = header + `
export type ClaudeThemePreview = {
  bg: string; text: string; muted: string; claude: string; swatches: string[];
  added: string; removed: string; addedFg: string; removedFg: string;
};
export type ClaudeThemeEntry = { id: string; name: string; base: 'dark' | 'light'; preview: ClaudeThemePreview };

export const CLAUDE_THEME_CATALOG: ClaudeThemeEntry[] = [
`;
for (const id of ids) front += `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(defs[id].name)}, base: ${JSON.stringify(defs[id].base)}, preview: ${JSON.stringify(preview(defs[id], defs[id].base))} },\n`;
front += '];\n';
writeFileSync(resolve(root, 'frontend/src/design/claude-theme-catalog.ts'), front);
console.log(`ok: ${ids.length} temas`);
