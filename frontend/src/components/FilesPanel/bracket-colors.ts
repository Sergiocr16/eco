// Colorización de pares de brackets por nivel de anidamiento (rainbow brackets),
// estilo VSCode. Decora solo el viewport por performance. La profundidad inicial
// del viewport se siembra contando brackets desde el inicio del documento (con un
// tope para no escanear archivos enormes en cada scroll).
//
// Limitación conocida: cuenta brackets sin distinguir strings/comentarios, así
// que un `)` dentro de un string puede colorearse. Es el mismo trade-off "best
// effort" que tienen las implementaciones simples; suficiente para legibilidad.

import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const OPENERS = '([{';
const CLOSERS = ')]}';
const DEPTH_CLASSES = 6;
const SEED_SCAN_CAP = 150_000; // chars: arriba de esto arrancamos el viewport en depth 0

const markCache: Decoration[] = [];
function markForDepth(depth: number): Decoration {
  const d = ((depth % DEPTH_CLASSES) + DEPTH_CLASSES) % DEPTH_CLASSES;
  if (!markCache[d]) markCache[d] = Decoration.mark({ class: `eco-bracket-d${d}` });
  return markCache[d];
}

function netDepthBefore(view: EditorView, pos: number): number {
  if (pos === 0 || pos > SEED_SCAN_CAP) return 0;
  const text = view.state.doc.sliceString(0, pos);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch)) depth = Math.max(0, depth - 1);
  }
  return depth;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let depth = netDepthBefore(view, from);
    const text = view.state.doc.sliceString(from, to);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const at = from + i;
      if (OPENERS.includes(ch)) {
        builder.add(at, at + 1, markForDepth(depth));
        depth++;
      } else if (CLOSERS.includes(ch)) {
        depth = Math.max(0, depth - 1);
        builder.add(at, at + 1, markForDepth(depth));
      }
    }
  }
  return builder.finish();
}

export const bracketColorization = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
