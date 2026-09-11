import { useEffect, useState } from 'react';
import { cssZoom } from '@/lib/ui-zoom';

// El teclado táctil de iOS no achica el layout viewport: se dibuja ENCIMA. Con
// el shell en `position: fixed` y `body { overflow: hidden }` (index.css), eso
// deja el prompt del terminal tapado y sin nada que lo scrollee de vuelta. La
// única fuente de verdad sobre cuánto tapa es visualViewport.
//
// El umbral existe porque en iOS la barra de URL que se colapsa al scrollear
// también mueve el visualViewport unos 50-90px. Un teclado real nunca baja de
// ~250px, así que 120 separa las dos cosas sin falsos positivos.
const KEYBOARD_MIN = 120;

function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    if (!vv) return;
    const update = () => {
      // Referencia: `documentElement.clientHeight`, NO `window.innerHeight`.
      // En iOS Safari el innerHeight reporta la altura como si las barras del
      // navegador estuvieran colapsadas, así que innerHeight - vv.height daba
      // ~130px de barras y se interpretaba como un teclado abierto: el shell
      // se subía y quedaba una franja gris muerta al pie de la pantalla.
      // Se mide el rect de <html> (height: 100% en index.css) y no clientHeight:
      // bajo zoom CSS (web) clientHeight viene en px del documento escalado y
      // visualViewport en px visuales — restarlos inventaba un teclado.
      const layoutHeight = document.documentElement.getBoundingClientRect().height;
      const overlap = layoutHeight - vv.height - vv.offsetTop;
      // Segundo cinturón: sin un campo enfocado no hay teclado, por más que
      // las alturas digan otra cosa. El inset se devuelve en px CSS del shell.
      setInset(isEditing() && overlap > KEYBOARD_MIN ? Math.round(overlap / cssZoom()) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // El foco puede cambiar sin que el visual viewport se mueva (de un input a
    // otro, o al cerrar el teclado con "Listo").
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
    };
  }, []);

  return inset;
}
