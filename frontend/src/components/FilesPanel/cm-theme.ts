// Theme propio para CodeMirror 6 usando los tokens de Eco. Reemplaza a
// @uiw/codemirror-theme-vscode para mantener branding consistente y evitar
// ~50KB extra en el bundle.

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import type { Tokens } from '@/design/tokens';

// Construye un theme + highlighting basado en los tokens de Eco. Se llama
// cada vez que cambia el theme global para que el editor se mantenga en sync.
//
// El FONDO del editor es neutro (negro puro / blanco puro) por decisión
// explícita — no se tiñe con el accent del theme activo. Los highlights
// (cursor, selección, active line, gutter active) sí usan el accent para
// mantener identidad. Esto evita que un theme como vaporwave/sunset/galaxy
// pinte el código de fondo coloreado y reduzca legibilidad.
export function buildEcoCmExtension(tokens: Tokens, isLight: boolean): Extension {
  const isDark = !isLight;
  const accent = tokens.accent;
  const bg = isDark ? '#000000' : '#ffffff';
  const fg = isDark ? '#f5f5f7' : '#1d1d1f';
  const fgMuted = isDark ? '#6e6e73' : '#86868b';
  const gutterFg = isDark ? '#48484a' : '#aeaeb2';
  const selectionBg = `color-mix(in oklch, ${accent} 28%, transparent)`;
  const cursor = accent;
  const gutterBg = bg;
  const activeLineBg = `color-mix(in oklch, ${accent} 7%, transparent)`;

  const theme = EditorView.theme({
    '&': {
      color: fg,
      backgroundColor: bg,
      height: '100%',
      fontFamily: tokens.fontMono,
      fontSize: '13px',
    },
    '.cm-content': {
      caretColor: cursor,
      fontFamily: tokens.fontMono,
      padding: '12px 0',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: cursor },
    '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: selectionBg },
    '.cm-selectionBackground': { backgroundColor: selectionBg },
    '.cm-gutters': {
      backgroundColor: gutterBg,
      color: gutterFg,
      border: 'none',
      borderRight: `1px solid ${tokens.glassBorder}`,
    },
    '.cm-activeLine': { backgroundColor: activeLineBg },
    '.cm-activeLineGutter': { backgroundColor: activeLineBg, color: tokens.text1 },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: `color-mix(in oklch, ${accent} 22%, transparent)`,
      outline: `1px solid ${accent}`,
    },
    '.cm-tooltip': {
      backgroundColor: tokens.glassBg,
      color: fg,
      border: `1px solid ${tokens.glassBorder}`,
      borderRadius: `${tokens.r2}px`,
      fontFamily: tokens.fontSans,
    },
    '.cm-panels': {
      backgroundColor: tokens.glassBg,
      color: fg,
      borderTop: `1px solid ${tokens.glassBorder}`,
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: `1px solid ${tokens.glassBorder}`,
    },
    // Panel de búsqueda (Cmd+F) — estilizado para matchear el resto de Eco.
    // CM default es muy plano y desprolijo; lo ajustamos a nuestros tokens.
    '.cm-panel.cm-search': {
      padding: '8px 12px',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      fontFamily: tokens.fontSans,
      fontSize: '12px',
      background: tokens.glassBg,
    },
    '.cm-panel.cm-search label': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: fgMuted,
      fontSize: '11px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    '.cm-panel.cm-search input[type="checkbox"]': {
      accentColor: accent,
      margin: 0,
      cursor: 'pointer',
    },
    '.cm-panel.cm-search input.cm-textfield, .cm-textfield': {
      background: bg,
      color: fg,
      border: `1px solid ${tokens.glassBorder}`,
      borderRadius: `${tokens.r2}px`,
      padding: '5px 8px',
      fontSize: '12px',
      fontFamily: tokens.fontMono,
      outline: 'none',
      minWidth: '180px',
      transition: 'border-color 120ms, box-shadow 120ms',
    },
    '.cm-panel.cm-search input.cm-textfield:focus, .cm-textfield:focus': {
      borderColor: accent,
      boxShadow: `0 0 0 2px color-mix(in oklch, ${accent} 25%, transparent)`,
    },
    '.cm-panel.cm-search button, .cm-button': {
      background: 'transparent',
      color: fg,
      border: `1px solid ${tokens.glassBorder}`,
      borderRadius: `${tokens.r2}px`,
      padding: '4px 10px',
      fontSize: '11px',
      fontFamily: tokens.fontSans,
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'background 120ms, border-color 120ms, color 120ms',
      backgroundImage: 'none',
      textTransform: 'none',
    },
    '.cm-panel.cm-search button:hover, .cm-button:hover': {
      background: `color-mix(in oklch, ${accent} 12%, transparent)`,
      borderColor: `color-mix(in oklch, ${accent} 45%, ${tokens.glassBorder})`,
      color: fg,
    },
    '.cm-panel.cm-search button:active, .cm-button:active': {
      background: `color-mix(in oklch, ${accent} 22%, transparent)`,
    },
    '.cm-panel.cm-search button[name="close"]': {
      border: 0,
      padding: '2px 6px',
      fontSize: '16px',
      lineHeight: 1,
      color: fgMuted,
      marginLeft: 'auto',
    },
    '.cm-panel.cm-search button[name="close"]:hover': {
      background: 'transparent',
      color: tokens.err,
    },
    '.cm-panel.cm-search br': { display: 'none' },
    '.cm-searchMatch': {
      backgroundColor: `color-mix(in oklch, ${tokens.warn} 35%, transparent)`,
      outline: `1px solid ${tokens.warn}`,
      borderRadius: '2px',
    },
    '.cm-searchMatch-selected': {
      backgroundColor: `color-mix(in oklch, ${accent} 55%, transparent)`,
      outline: `1px solid ${accent}`,
    },
  }, { dark: isDark });

  // Highlighting style — paleta derivada de tokens para mantener coherencia
  // con el resto de la app. Usamos color-mix con accent para varios grupos
  // de tokens; los strings y comments tienen colores fijos suaves.
  const highlight = HighlightStyle.define([
    { tag: t.keyword, color: accent, fontWeight: '600' },
    { tag: [t.controlKeyword, t.moduleKeyword], color: accent, fontWeight: '600' },
    { tag: [t.operator, t.operatorKeyword], color: tokens.text0 },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: `color-mix(in oklch, ${accent} 70%, ${tokens.warn})` },
    { tag: t.number, color: tokens.warn },
    { tag: t.string, color: tokens.ok },
    { tag: [t.special(t.string), t.regexp], color: tokens.ok },
    { tag: t.escape, color: tokens.warn },
    { tag: t.comment, color: fgMuted, fontStyle: 'italic' },
    { tag: t.lineComment, color: fgMuted, fontStyle: 'italic' },
    { tag: t.blockComment, color: fgMuted, fontStyle: 'italic' },
    { tag: t.docComment, color: fgMuted, fontStyle: 'italic' },
    { tag: [t.typeName, t.className], color: `color-mix(in oklch, ${accent} 60%, ${tokens.text0})` },
    { tag: [t.propertyName, t.variableName], color: tokens.text0 },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: `color-mix(in oklch, ${accent} 75%, ${tokens.warn})` },
    { tag: t.invalid, color: tokens.err, textDecoration: 'underline' },
    { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: accent, fontWeight: '700' },
    { tag: t.link, color: accent, textDecoration: 'underline' },
    { tag: t.url, color: accent, textDecoration: 'underline' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.tagName, color: accent },
    { tag: t.attributeName, color: `color-mix(in oklch, ${accent} 60%, ${tokens.warn})` },
    { tag: t.attributeValue, color: tokens.ok },
  ]);

  return [theme, syntaxHighlighting(highlight)];
}

