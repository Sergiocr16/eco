// Extensiones base reutilizables para los EditorView de la tab Archivos.
//
// El consumidor pasa callbacks (`onSave`, `onChange`, `onSelectionChange`)
// que se enganchan via updateListener — no las metemos en el state porque
// CodeMirror no las puede capturar al setState.

import { EditorView, keymap, highlightActiveLine, lineNumbers, drawSelection } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';
import { buildEcoCmExtension } from './cm-theme';
import { bracketColorization } from './bracket-colors';
import type { Tokens } from '@/design/tokens';

export type SelectionInfo = {
  empty: boolean;
  startLine: number;
  endLine: number;
  text: string;
  // Coordenadas en pixeles del cursor head — útil para posicionar el floating
  // button. Si CM no puede calcularlas (offscreen), viene null.
  coords: { left: number; top: number; bottom: number } | null;
};

export type BaseExtensionsOpts = {
  readOnly: boolean;
  tokens: Tokens;
  isLight: boolean;
  onSave: () => void;
  onChange: (doc: string) => void;
  onSelectionChange: (sel: SelectionInfo) => void;
  // "Find usages": palabra bajo el cursor → buscar dónde se usa (Cmd/Ctrl+click
  // o Shift+F12). Búsqueda textual word-boundary, no semántica.
  onFindUsages?: (word: string) => void;
};

// Toma la palabra bajo `pos` y dispara find-usages. Devuelve true si había una
// palabra válida (>=2 chars, para no buscar un solo caracter).
function triggerFindUsages(view: EditorView, pos: number, onFindUsages?: (word: string) => void): boolean {
  if (!onFindUsages) return false;
  const w = view.state.wordAt(pos);
  if (!w) return false;
  const word = view.state.sliceDoc(w.from, w.to);
  if (!word || word.length < 2) return false;
  onFindUsages(word);
  return true;
}

export function baseExtensions(opts: BaseExtensionsOpts): Extension[] {
  const { readOnly, tokens, isLight, onSave, onChange, onSelectionChange, onFindUsages } = opts;
  return [
    lineNumbers(),
    foldGutter(),
    drawSelection(),
    highlightActiveLine(),
    history(),
    indentOnInput(),
    bracketMatching(),
    bracketColorization,
    indentationMarkers({
      highlightActiveBlock: true,
      hideFirstIndent: true,
      colors: {
        light: 'color-mix(in oklch, #000 12%, transparent)',
        dark: 'color-mix(in oklch, #fff 14%, transparent)',
        activeLight: `color-mix(in oklch, ${tokens.accent} 55%, transparent)`,
        activeDark: `color-mix(in oklch, ${tokens.accent} 60%, transparent)`,
      },
    }),
    autocompletion(),
    search({ top: true }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    buildEcoCmExtension(tokens, isLight),
    EditorView.lineWrapping,
    EditorState.readOnly.of(readOnly),
    EditorView.contentAttributes.of({ 'aria-readonly': String(readOnly) }),
    // Cmd/Ctrl+click sobre un símbolo → find usages. preventDefault frena el
    // multi-cursor default de CodeMirror para el mod-click.
    EditorView.domEventHandlers({
      mousedown(e, view) {
        if (!onFindUsages || !(e.metaKey || e.ctrlKey) || e.button !== 0) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return false;
        if (triggerFindUsages(view, pos, onFindUsages)) { e.preventDefault(); return true; }
        return false;
      },
    }),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      indentWithTab,
      // Cmd+S / Ctrl+S → onSave. Devolvemos true para frenar el behavior
      // default del browser (Save As de la página).
      { key: 'Mod-s', preventDefault: true, run: () => { onSave(); return true; } },
      // Shift+F12 → find usages de la palabra bajo el cursor (estilo VSCode).
      { key: 'Shift-F12', preventDefault: true, run: (view) => triggerFindUsages(view, view.state.selection.main.head, onFindUsages) },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const sel = update.state.selection.main;
        const doc = update.state.doc;
        const start = doc.lineAt(sel.from);
        const end = doc.lineAt(sel.to);
        const text = update.state.sliceDoc(sel.from, sel.to);
        let coords = null;
        try {
          const c = update.view.coordsAtPos(sel.head);
          coords = c ? { left: c.left, top: c.top, bottom: c.bottom } : null;
        } catch { coords = null; }
        onSelectionChange({
          empty: sel.empty,
          startLine: start.number,
          endLine: end.number,
          text,
          coords,
        });
      }
    }),
  ];
}
