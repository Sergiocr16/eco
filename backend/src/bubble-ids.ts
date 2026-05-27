// Genera un bubbleId con el mismo formato que el frontend (useBubbles.ts):
// `b_<timestamp36>_<random5>`. Mantener ambos lados en sync evita que un id
// generado server-side tenga forma distinta a los locales y rompa keys de
// localStorage o invariantes de regex.
export function newBubbleId(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const BUBBLE_ID_RE = /^[A-Za-z0-9_-]{3,128}$/;
export function isValidBubbleId(id: unknown): id is string {
  return typeof id === 'string' && BUBBLE_ID_RE.test(id);
}
