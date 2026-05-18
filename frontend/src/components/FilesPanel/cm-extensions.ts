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
import { buildEcoCmExtension } from './cm-theme';
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
};

export function baseExtensions(opts: BaseExtensionsOpts): Extension[] {
  const { readOnly, tokens, isLight, onSave, onChange, onSelectionChange } = opts;
  return [
    lineNumbers(),
    foldGutter(),
    drawSelection(),
    highlightActiveLine(),
    history(),
    indentOnInput(),
    bracketMatching(),
    autocompletion(),
    search({ top: true }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    buildEcoCmExtension(tokens, isLight),
    EditorView.lineWrapping,
    EditorState.readOnly.of(readOnly),
    EditorView.contentAttributes.of({ 'aria-readonly': String(readOnly) }),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      indentWithTab,
      // Cmd+S / Ctrl+S → onSave. Devolvemos true para frenar el behavior
      // default del browser (Save As de la página).
      { key: 'Mod-s', preventDefault: true, run: () => { onSave(); return true; } },
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
