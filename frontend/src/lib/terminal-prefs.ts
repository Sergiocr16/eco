// Preferencias del terminal: tamaño y tipografía. Globales (no por burbuja) a
// propósito: así no entran en la limpieza de claves de useBubbles.removeBubble.
// Las consumen RealTerminal (todas las pestañas), la barra A−/A+ del teléfono
// y Settings → Apariencia, y cualquier cambio se aplica en vivo a todas.

import { useEffect, useState } from 'react';
import { isMobileNow } from '@/hooks/useMediaQuery';

const FONT_SIZE_KEY = 'eco.term.fontsize';
const FONT_FAMILY_KEY = 'eco.term.fontfamily';

export const TERM_FONT_MIN = 8;
export const TERM_FONT_MAX = 24;
// 326px de ancho útil con fuente 12.5 dan ~40 columnas, y los TUI de Claude y
// Codex asumen 80. Con 10 se llega a ~54, que sigue siendo poco pero hace la
// diferencia entre leerlo y no leerlo. En horizontal el default ya alcanza.
const FONT_DEFAULT_MOBILE = 10;
const FONT_DEFAULT_DESKTOP = 12.5;

export type TermFontFamily = {
  id: string;
  // null = la monoespaciada del sistema (el rótulo lo pone i18n).
  family: string | null;
  stack: string;
};

const SYSTEM_STACK = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// Solo familias monoespaciadas. Los stacks incluyen la variante Nerd Font
// porque es la que suele tener instalada quien usa terminales con iconos.
export const TERM_FONT_FAMILIES: readonly TermFontFamily[] = [
  { id: 'system', family: null, stack: SYSTEM_STACK },
  { id: 'sf-mono', family: 'SF Mono', stack: '"SF Mono", SFMono-Regular, monospace' },
  { id: 'menlo', family: 'Menlo', stack: 'Menlo, monospace' },
  { id: 'monaco', family: 'Monaco', stack: 'Monaco, monospace' },
  { id: 'jetbrains-mono', family: 'JetBrains Mono', stack: '"JetBrains Mono", "JetBrainsMono Nerd Font", monospace' },
  { id: 'fira-code', family: 'Fira Code', stack: '"Fira Code", "FiraCode Nerd Font", monospace' },
  { id: 'cascadia-code', family: 'Cascadia Code', stack: '"Cascadia Code", "Cascadia Mono", monospace' },
  { id: 'source-code-pro', family: 'Source Code Pro', stack: '"Source Code Pro", monospace' },
  { id: 'ibm-plex-mono', family: 'IBM Plex Mono', stack: '"IBM Plex Mono", monospace' },
  { id: 'hack', family: 'Hack', stack: 'Hack, "Hack Nerd Font", monospace' },
  { id: 'consolas', family: 'Consolas', stack: 'Consolas, monospace' },
  { id: 'courier-new', family: 'Courier New', stack: '"Courier New", Courier, monospace' },
];

export type TermPrefs = {
  // Tamaño efectivo (guardado o default del dispositivo).
  fontSize: number;
  // Lo que eligió el user; null = default del dispositivo.
  fontSizeStored: number | null;
  fontFamilyId: string;
};

function readFontSizeStored(): number | null {
  try {
    const raw = window.localStorage.getItem(FONT_SIZE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= TERM_FONT_MIN && n <= TERM_FONT_MAX) return n;
  } catch { /* noop */ }
  return null;
}

function readFontFamilyId(): string {
  try {
    const raw = window.localStorage.getItem(FONT_FAMILY_KEY);
    if (raw && TERM_FONT_FAMILIES.some((f) => f.id === raw)) return raw;
  } catch { /* noop */ }
  return 'system';
}

let fontSizeStored: number | null = typeof window !== 'undefined' ? readFontSizeStored() : null;
let fontFamilyId: string = typeof window !== 'undefined' ? readFontFamilyId() : 'system';
const subs = new Set<(p: TermPrefs) => void>();

function snapshot(): TermPrefs {
  // El default se resuelve en cada lectura, no al cargar el módulo: la ventana
  // puede cruzar el breakpoint después.
  const fallback = isMobileNow() ? FONT_DEFAULT_MOBILE : FONT_DEFAULT_DESKTOP;
  return { fontSize: fontSizeStored ?? fallback, fontSizeStored, fontFamilyId };
}

function notify(): void {
  const p = snapshot();
  subs.forEach((fn) => fn(p));
}

export function getTermPrefs(): TermPrefs {
  return snapshot();
}

export function termFontStack(id: string = fontFamilyId): string {
  return TERM_FONT_FAMILIES.find((f) => f.id === id)?.stack ?? SYSTEM_STACK;
}

// null = volver al default del dispositivo.
export function setTermFontSize(next: number | null): void {
  fontSizeStored = next == null ? null : Math.min(TERM_FONT_MAX, Math.max(TERM_FONT_MIN, Math.round(next)));
  try {
    if (fontSizeStored == null) window.localStorage.removeItem(FONT_SIZE_KEY);
    else window.localStorage.setItem(FONT_SIZE_KEY, String(fontSizeStored));
  } catch { /* noop */ }
  notify();
}

export function setTermFontFamily(id: string): void {
  if (!TERM_FONT_FAMILIES.some((f) => f.id === id)) return;
  fontFamilyId = id;
  try { window.localStorage.setItem(FONT_FAMILY_KEY, id); } catch { /* noop */ }
  notify();
}

// Otra ventana de Electron (o pestaña) cambió la preferencia: el evento
// `storage` solo llega a las demás, así que la que escribió ya se enteró.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== FONT_SIZE_KEY && e.key !== FONT_FAMILY_KEY) return;
    fontSizeStored = readFontSizeStored();
    fontFamilyId = readFontFamilyId();
    notify();
  });
}

export function subscribeTermPrefs(fn: (p: TermPrefs) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function useTermPrefs(): TermPrefs {
  const [p, setP] = useState<TermPrefs>(snapshot);
  useEffect(() => subscribeTermPrefs(setP), []);
  return p;
}

// Detección por métrica: si "X, monospace" mide igual que "monospace" a solas
// (y lo mismo contra serif), X no está instalada y el navegador cayó al
// fallback. document.fonts.check() no sirve para esto: devuelve true para
// cualquier familia que no tenga un @font-face pendiente.
const installedCache = new Map<string, boolean>();
export function isFontInstalled(family: string): boolean {
  const hit = installedCache.get(family);
  if (hit !== undefined) return hit;
  let result = true;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      const sample = 'mmmmmmmmmmlli0O1|WWW';
      const width = (font: string) => { ctx.font = `32px ${font}`; return ctx.measureText(sample).width; };
      result = width(`"${family}", monospace`) !== width('monospace')
        || width(`"${family}", serif`) !== width('serif');
    }
  } catch { /* noop */ }
  installedCache.set(family, result);
  return result;
}
