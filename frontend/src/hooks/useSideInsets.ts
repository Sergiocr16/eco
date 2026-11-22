import { useEffect, useState } from 'react';

// Safe area lateral del teléfono acostado. iOS reporta el mismo inset (~59px)
// en los DOS lados, pero la Dynamic Island está en uno solo: reservar ambos
// regala ancho. Del lado de la isla va el inset entero; del otro alcanza con
// librar la esquina redondeada.
//
// window.orientation: 90 = girado en sentido antihorario → la parte de arriba
// del teléfono (la isla) queda a la IZQUIERDA; -90 → a la derecha. Si no se
// puede saber, se respetan los dos lados.
type Side = 'left' | 'right' | 'unknown';

function islandSide(): Side {
  if (typeof window === 'undefined') return 'unknown';
  const legacy = (window as Window & { orientation?: number }).orientation;
  if (legacy === 90) return 'left';
  if (legacy === -90) return 'right';
  const angle = window.screen?.orientation?.angle;
  if (angle === 90) return 'left';
  if (angle === 270) return 'right';
  return 'unknown';
}

const FULL = (side: 'left' | 'right') => `calc(env(safe-area-inset-${side}, 0px) / var(--eco-zoom, 1))`;
const CORNER = (side: 'left' | 'right') => `calc(min(env(safe-area-inset-${side}, 0px), 10px) / var(--eco-zoom, 1))`;

export function useSideInsets(): { left: string; right: string } {
  const [side, setSide] = useState<Side>(islandSide);
  useEffect(() => {
    const update = () => setSide(islandSide());
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    window.screen?.orientation?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
      window.screen?.orientation?.removeEventListener?.('change', update);
    };
  }, []);
  return {
    left: side === 'right' ? CORNER('left') : FULL('left'),
    right: side === 'left' ? CORNER('right') : FULL('right'),
  };
}
