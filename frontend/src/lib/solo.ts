// Modo "solo bubble": cuando el renderer se carga con ?solo=<bubbleId> (lo
// hace una ventana aparte abierta desde Electron), App monta SOLO ese
// AgentDetail a pantalla completa, sin sidebar ni dashboard.

export function getSoloBubbleId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = new URLSearchParams(window.location.search).get('solo');
    if (!id) return null;
    const trimmed = id.trim();
    return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}
