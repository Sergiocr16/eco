import { useEffect, useState } from 'react';

// El styling de Eco es inline styles (no hay CSS framework ni clases), así que
// las media queries no sirven: la única forma de ramificar el layout es un
// booleano en JS que se spreadea dentro de los objetos de estilo. Mismo patrón
// que design/theme.tsx usa para prefers-color-scheme.

// `pointer: coarse` es lo que mantiene el layout móvil en el iPhone HORIZONTAL
// (932px en un 16 Pro Max, muy por encima de cualquier breakpoint de ancho).
// El `max-width` es el complemento: permite probar todo achicando la ventana
// en el escritorio, sin necesidad del teléfono.
export const MOBILE_QUERY = '(pointer: coarse), (max-width: 820px)';

export function matches(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [query]);
  return on;
}

// Tablet = táctil con las DOS dimensiones grandes. El `min-height` es lo que
// la separa del teléfono en horizontal: un iPhone 16 Pro Max acostado mide
// 932×430, así que pasa el min-width pero no el min-height. Un iPad es
// 820×1180 en vertical y 1180×820 en horizontal — pasa siempre.
export const TABLET_QUERY = '(pointer: coarse) and (min-width: 768px) and (min-height: 700px)';

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

export function useIsTablet(): boolean {
  return useMediaQuery(TABLET_QUERY);
}

// Los dos ejes son independientes y conviene no confundirlos:
//
//   isMobile → TÁCTIL. Manda en el tamaño: targets de 44pt, inputs de 16px
//              (auto-zoom de iOS), barra de teclas del terminal, safe area.
//              Una tablet también lo es.
//   isPhone  → PANTALLA CHICA. Manda en el layout: rails que se esconden,
//              splits de un panel a la vez, tabs solo-icono, navegación
//              abajo. Una tablet NO lo es: tiene ancho para el layout de
//              escritorio, solo que con controles grandes.
export function useIsPhone(): boolean {
  const mobile = useMediaQuery(MOBILE_QUERY);
  const tablet = useMediaQuery(TABLET_QUERY);
  return mobile && !tablet;
}

// Getter síncrono para los helpers que NO son hooks (fieldStyle, glassEffect y
// demás funciones puras de design/primitives.tsx). No es reactivo por sí solo:
// depende de que algún ancestro haya llamado useIsMobile() para re-renderizar
// en el cambio de breakpoint. App.tsx:Shell lo hace, que cubre todo el árbol.
export function isMobileNow(): boolean {
  return matches(MOBILE_QUERY);
}

export function isTabletNow(): boolean {
  return matches(TABLET_QUERY);
}

export function isPhoneNow(): boolean {
  return matches(MOBILE_QUERY) && !matches(TABLET_QUERY);
}
