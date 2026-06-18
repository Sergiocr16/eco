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
  const bracketColors = isDark ? BRACKET_COLORS_DARK : BRACKET_COLORS_LIGHT;

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
    // Colorización de pares de brackets por nivel de anidamiento.
    '.eco-bracket-d0': { color: bracketColors[0] },
    '.eco-bracket-d1': { color: bracketColors[1] },
    '.eco-bracket-d2': { color: bracketColors[2] },
    '.eco-bracket-d3': { color: bracketColors[3] },
    '.eco-bracket-d4': { color: bracketColors[4] },
    '.eco-bracket-d5': { color: bracketColors[5] },
  }, { dark: isDark });

  // Highlighting style — paleta MULTI-COLOR FIJA tipo IDE (VSCode Dark+/Light+),
  // independiente del accent del theme. Distintos hues por tipo de token para
  // que el código se LEA como en un IDE real, no monocromático. El accent solo
  // tiñe el "chrome" del editor (cursor, selección, active line, brackets).
  const c = isDark ? PALETTE_DARK : PALETTE_LIGHT;
  const highlight = HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: c.keyword, fontWeight: '600' },
    { tag: [t.operator, t.operatorKeyword, t.derefOperator], color: c.operator },
    { tag: [t.atom, t.bool, t.null, t.special(t.variableName)], color: c.constant },
    { tag: [t.number, t.integer, t.float], color: c.number },
    { tag: [t.string, t.special(t.string), t.docString], color: c.string },
    { tag: [t.regexp], color: c.regexp },
    { tag: [t.escape, t.character], color: c.escape },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: c.comment, fontStyle: 'italic' },
    { tag: [t.typeName, t.className, t.namespace], color: c.type },
    { tag: [t.propertyName], color: c.property },
    { tag: [t.variableName, t.labelName], color: c.variable },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: c.function },
    { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: c.variable },
    { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: c.constant },
    { tag: t.invalid, color: tokens.err, textDecoration: 'underline' },
    { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4], color: c.keyword, fontWeight: '700' },
    { tag: [t.link, t.url], color: c.function, textDecoration: 'underline' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strong, fontWeight: '700' },
    { tag: [t.tagName, t.angleBracket], color: c.tag },
    { tag: t.attributeName, color: c.attribute },
    { tag: t.attributeValue, color: c.string },
    { tag: [t.punctuation, t.separator, t.bracket], color: c.punctuation },
    { tag: t.meta, color: c.comment },
  ]);

  return [theme, syntaxHighlighting(highlight)];
}

// Paletas fijas estilo VSCode Dark+ / Light+. No dependen del accent: la idea
// es que el código se vea como en un IDE clásico (keyword violeta-azul, string
// verde, número naranja, función amarilla, tipo teal, etc.).
type SyntaxPalette = {
  keyword: string; operator: string; constant: string; number: string;
  string: string; regexp: string; escape: string; comment: string;
  type: string; property: string; variable: string; function: string;
  tag: string; attribute: string; punctuation: string;
};
const PALETTE_DARK: SyntaxPalette = {
  keyword: '#c586c0',    // violeta (control/keywords)
  operator: '#d4d4d4',
  constant: '#569cd6',   // azul (bool/null/const)
  number: '#b5cea8',     // verde-oliva (números en VSCode)
  string: '#ce9178',     // naranja-salmón
  regexp: '#d16969',
  escape: '#d7ba7d',
  comment: '#6a9955',    // verde comentario
  type: '#4ec9b0',       // teal (tipos/clases)
  property: '#9cdcfe',   // azul claro (propiedades)
  variable: '#9cdcfe',
  function: '#dcdcaa',   // amarillo (funciones)
  tag: '#569cd6',
  attribute: '#9cdcfe',
  punctuation: '#808080',
};
const PALETTE_LIGHT: SyntaxPalette = {
  keyword: '#af00db',
  operator: '#000000',
  constant: '#0000ff',
  number: '#098658',
  string: '#a31515',
  regexp: '#811f3f',
  escape: '#ee0000',
  comment: '#008000',
  type: '#267f99',
  property: '#001080',
  variable: '#001080',
  function: '#795e26',
  tag: '#800000',
  attribute: '#e50000',
  punctuation: '#383838',
};

// Colores para la colorización de pares de brackets (ciclan por profundidad).
export const BRACKET_COLORS_DARK = ['#ffd700', '#da70d6', '#179fff', '#ffd700', '#da70d6', '#179fff'];
export const BRACKET_COLORS_LIGHT = ['#0431fa', '#319331', '#7b3814', '#0431fa', '#319331', '#7b3814'];

