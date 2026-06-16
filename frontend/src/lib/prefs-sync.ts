// Sync cross-device de las preferencias personales: tema (modo + acento) e
// idioma. El estado del tema vive en el ThemeProvider (contexto React) y el
// idioma en i18n; este módulo es el puente con el doc `prefs` del servidor:
// hidrata al loguear, aplica push de otros dispositivos, y sube los cambios.

import { saveDoc, shouldApplyRemote, markSeen } from './user-sync';
import { on as ecoOn } from './eco-bus';

const DOC_KEY = 'prefs';

// photo: data-URL JPEG chiquito (128px, <8KB) de la foto de perfil. Va en prefs
// para sincronizar cross-device como el resto. null = sin foto (limpiada).
export type Prefs = { themeMode?: string; accentHue?: number; lang?: string; photo?: string | null };

let current: Prefs = {};
const subs = new Set<(p: Prefs) => void>();

export function getPrefs(): Prefs { return current; }

export function subscribePrefs(fn: (p: Prefs) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

function emit() { for (const fn of subs) { try { fn(current); } catch { /* noop */ } } }

function applyFromServer(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const v = value as Prefs;
  current = {
    themeMode: typeof v.themeMode === 'string' ? v.themeMode : current.themeMode,
    accentHue: typeof v.accentHue === 'number' ? v.accentHue : current.accentHue,
    lang: typeof v.lang === 'string' ? v.lang : current.lang,
    photo: typeof v.photo === 'string' ? v.photo : (v.photo === null ? null : current.photo),
  };
  emit();
}

/** Hidratación al loguear (App pasa el doc `prefs` del servidor). */
export function hydratePrefs(value: unknown, updatedAt: number): void {
  markSeen(DOC_KEY, updatedAt);
  applyFromServer(value);
}

/** Cambio local (tema/acento/idioma) → merge + subir al server. */
export function updatePrefs(patch: Prefs): void {
  current = { ...current, ...patch };
  saveDoc(DOC_KEY, current);
}

// Push en vivo desde otros dispositivos del usuario.
ecoOn('eco:doc_updated', ({ key, value, updatedAt }) => {
  if (key !== DOC_KEY) return;
  if (!shouldApplyRemote(key, updatedAt)) return;
  applyFromServer(value);
});
