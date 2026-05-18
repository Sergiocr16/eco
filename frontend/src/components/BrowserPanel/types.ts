// Tipos compartidos por los sub-componentes del BrowserPanel multi-tabs.

export type ViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom';

export type BrowserTab = {
  id: string;          // random — usado para partition suffix y como key
  url: string;         // current URL del tab (empty = home/blank)
  title: string;       // del did-navigate/page-title-updated; fallback al hostname
  partition: string;   // 'persist:eco-<bubbleId>' (tab default)
                       // 'persist:eco-<bubbleId>-tab-<id>' (sesión nueva)
                       // o el partition de otra tab si es sesión compartida
  isolated: boolean;   // true si la partition NO es la default de la bubble
  viewport: ViewportPreset;
  customViewport?: { width: number; height: number };
};

export type NewTabMode = 'shared' | 'isolated';

// Dimensiones físicas (CSS pixels) que el viewport wrapper aplica al
// webview cuando viewport !== 'desktop'.
export function viewportDims(
  preset: ViewportPreset,
  custom?: { width: number; height: number },
): { width: number; height: number } | null {
  switch (preset) {
    case 'desktop': return null;
    case 'tablet':  return { width: 768, height: 1024 };
    case 'mobile':  return { width: 390, height: 844 };
    case 'custom':  return custom ?? { width: 1200, height: 800 };
  }
}

export function genTabId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultPartition(bubbleId: string): string {
  return `persist:eco-${bubbleId}`;
}

export function isolatedPartition(bubbleId: string, tabId: string): string {
  return `persist:eco-${bubbleId}-tab-${tabId}`;
}
