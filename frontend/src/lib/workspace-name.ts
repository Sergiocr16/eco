/** Nombre corto del workspace = último segmento de la ruta absoluta.
 *  `/Users/sergio/Documents/GitHub/aditum-jh` → `aditum-jh`. */
export function workspaceName(path: string): string {
  return path.split('/').filter(Boolean).slice(-1)[0] || path;
}
