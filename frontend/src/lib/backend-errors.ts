// Traduce un código de error que viene del backend a un string localizado.
// Si el code no está en el diccionario i18n, cae al fallbackMessage que también
// viene del backend (en español). Mantiene a Eco usable incluso si el frontend
// se desfasa del backend.

import { translate, loadLang, type Lang } from './i18n';

type ErrorPayload = {
  error?: string;     // code (en formato 'namespace.thing') o legacy message
  message?: string;   // human-readable fallback en español
};

function looksLikeCode(s: string): boolean {
  // Códigos siguen el patrón 'ns.key' o 'ns.sub.key' sin espacios.
  return /^[a-z][a-z_]*\.[a-z][a-z0-9_.]*$/.test(s);
}

export function translateBackendError(
  payload: ErrorPayload | null | undefined,
  fallback = 'Error',
  lang: Lang = loadLang(),
): string {
  if (!payload) return fallback;
  const code = typeof payload.error === 'string' ? payload.error : '';
  const message = typeof payload.message === 'string' ? payload.message : '';

  // Si el `error` no parece un code (legacy: era texto), úsalo como mensaje.
  if (code && !looksLikeCode(code)) return code;

  if (code) {
    const key = `berr.${code}`;
    const localized = translate(key, lang);
    // translate() devuelve la key cuando no la encuentra; en ese caso preferimos
    // el mensaje humano del backend antes que mostrar la key cruda.
    if (localized !== key) return localized;
  }
  return message || fallback;
}
