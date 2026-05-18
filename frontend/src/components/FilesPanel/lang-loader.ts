// Carga de lang packs de CodeMirror 6. Los más usados en este repo (JS/TS,
// JSON, CSS, HTML, MD) se importan eager. El resto via language-data con
// dynamic import — Vite los pone en chunks separados y solo se descargan
// cuando el user abre un archivo de ese tipo.

import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { LanguageDescription, type Language } from '@codemirror/language';
import { languages as builtinLangs } from '@codemirror/language-data';
import type { Extension } from '@codemirror/state';

// Eager packs: extensión → factory. Para .ts/.tsx pasamos opts a javascript().
const EAGER: Record<string, () => Extension> = {
  '.ts': () => javascript({ jsx: false, typescript: true }),
  '.mts': () => javascript({ jsx: false, typescript: true }),
  '.cts': () => javascript({ jsx: false, typescript: true }),
  '.tsx': () => javascript({ jsx: true, typescript: true }),
  '.js': () => javascript({ jsx: false, typescript: false }),
  '.mjs': () => javascript({ jsx: false, typescript: false }),
  '.cjs': () => javascript({ jsx: false, typescript: false }),
  '.jsx': () => javascript({ jsx: true, typescript: false }),
  '.json': () => json(),
  '.css': () => css(),
  '.html': () => html(),
  '.htm': () => html(),
  '.md': () => markdown(),
  '.markdown': () => markdown(),
};

// Devuelve un Extension con la sintaxis para el path dado, o null si no hay
// soporte. Espera siempre porque los lazy packs son async.
export async function loadLang(filePath: string): Promise<Extension | null> {
  const lower = filePath.toLowerCase();
  // Caso especial: .tsx/.jsx llevan extensión compuesta (ya cubierto en EAGER).
  const lastDot = lower.lastIndexOf('.');
  const ext = lastDot >= 0 ? lower.slice(lastDot) : '';
  if (ext && EAGER[ext]) return EAGER[ext]();

  const desc = LanguageDescription.matchFilename(builtinLangs, filePath);
  if (!desc) return null;
  try {
    const support = await desc.load();
    return support;
  } catch {
    return null;
  }
}

// Para Quick Open / detección rápida sin cargar — devuelve true si conocemos
// algún parser para ese archivo (eager o lazy).
export function hasLangSupport(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  const lastDot = lower.lastIndexOf('.');
  const ext = lastDot >= 0 ? lower.slice(lastDot) : '';
  if (ext && EAGER[ext]) return true;
  return !!LanguageDescription.matchFilename(builtinLangs, filePath);
}

export type { Language };
