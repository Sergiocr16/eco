import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import type { DeviceSpec } from './types';

// Aire alrededor del dispositivo y alto de la leyenda con las medidas.
const PAD = 20;
const CAPTION = 22;
const BEZEL_COLOR = '#0b0c0f';
const BAR_FG = '#fff';
// Las barras van SOBRE la página (pantalla completa, como una app móvil).
// Blanco con `difference` invierte lo que hay debajo: oscuro sobre fondos
// claros, claro sobre oscuros, como los íconos del sistema.
const BAR_BLEND = 'difference' as const;

// Escala con la que el dispositivo entra entero en `el`. Nunca agranda (máx
// 1): la página sigue viendo su ancho real y solo se achica el dibujo.
function useFitScale(el: HTMLElement | null, frameW: number, frameH: number, enabled: boolean): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!el || !enabled) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      // Oculto con display:none mide 0: se conserva la última escala buena.
      if (w <= 0 || h <= 0) return;
      const next = Math.min(1, (w - PAD * 2) / frameW, (h - PAD * 2 - CAPTION) / frameH);
      setScale(Math.max(0.1, next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, frameW, frameH, enabled]);
  return enabled ? scale : 1;
}

// Envuelve la página en el marco del dispositivo y lo escala para que entre
// en el espacio disponible. Con `spec` null (escritorio) la página ocupa todo.
// La estructura del árbol es la MISMA en los dos casos: cambiar de dispositivo
// no debe desmontar el <webview> (recargaría la página).
export function DeviceFrame({ spec, visible, children }: {
  spec: DeviceSpec | null;
  visible: boolean;
  children: ReactNode;
}) {
  const t = useTokens();
  const [outer, setOuter] = useState<HTMLDivElement | null>(null);
  const frameW = spec ? spec.width + spec.bezel * 2 : 1;
  const frameH = spec ? spec.height + spec.bezel * 2 : 1;
  const scale = useFitScale(outer, frameW, frameH, !!spec);

  const outerStyle: CSSProperties = {
    position: 'absolute', inset: 0,
    display: visible ? 'flex' : 'none',
    flexDirection: 'column',
    alignItems: spec ? 'center' : 'stretch',
    justifyContent: spec ? 'center' : 'stretch',
    gap: spec ? 6 : 0,
    background: spec ? t.bg1 : 'transparent',
    overflow: 'hidden',
  };
  const sizerStyle: CSSProperties = spec
    ? { position: 'relative', flex: 'none', width: frameW * scale, height: frameH * scale }
    : { flex: 1, minHeight: 0, width: '100%' };
  const frameStyle: CSSProperties = spec
    ? {
      position: 'absolute', top: 0, left: 0,
      width: frameW, height: frameH, boxSizing: 'border-box',
      transform: `scale(${scale})`, transformOrigin: '0 0',
      // Canto de color por fuera y borde negro de la pantalla por dentro.
      border: spec.band > 0 ? `${spec.band}px solid ${spec.bandColor}` : 0,
      padding: spec.bezel - spec.band,
      background: BEZEL_COLOR,
      borderRadius: spec.radius + spec.bezel,
      boxShadow: spec.bezel > 0
        ? `0 0 0 1px rgba(255,255,255,0.14), inset 0 0 0 1px rgba(0,0,0,0.35), ${t.shadowLg}`
        : t.shadowLg,
    }
    : { width: '100%', height: '100%' };
  const screenStyle: CSSProperties = {
    position: 'relative',
    width: '100%', height: '100%',
    overflow: 'hidden',
    borderRadius: spec ? spec.radius : 0,
    background: spec ? BEZEL_COLOR : 'transparent',
  };

  return (
    <div ref={setOuter} style={outerStyle}>
      <div style={sizerStyle}>
        <div style={frameStyle}>
          <div style={screenStyle}>
            {/* Fondo blanco para páginas sin fondo propio. Va 1 px hacia adentro:
                a ras del borde redondeado asomaba como un filo blanco. */}
            <div style={{
              position: 'absolute', inset: spec ? 1 : 0, background: 'white',
              borderRadius: spec ? Math.max(0, spec.radius - 1) : 0,
            }}/>
            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
              {children}
            </div>
            {spec && spec.statusBar > 0 && <StatusBar spec={spec}/>}
            {spec && spec.navBar > 0 && <NavBar spec={spec}/>}
          </div>
          {/* El recorte redondeado deja asomar las capas blancas de la página
              como un filo claro. Este aro del color del marco va fuera del
              recorte y a caballo del borde de la pantalla, y lo tapa. */}
          {spec && spec.bezel > 0 && (
            <div style={{
              position: 'absolute', inset: spec.bezel - spec.band - 2, pointerEvents: 'none',
              border: `3px solid ${BEZEL_COLOR}`, borderRadius: spec.radius + 2,
            }}/>
          )}
        </div>
      </div>
      {spec && (
        <div style={{
          flex: 'none', height: CAPTION - 6, lineHeight: `${CAPTION - 6}px`,
          fontFamily: t.fontMono, fontSize: 10.5, color: t.text3,
        }}>
          {spec.name ? `${spec.name} · ` : ''}{spec.width}×{spec.height} · {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}

function StatusBar({ spec }: { spec: DeviceSpec }) {
  const ios = spec.chrome === 'ios';
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: spec.statusBar,
      pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: spec.tablet ? '0 22px' : ios ? '0 30px' : '0 18px',
      color: BAR_FG,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Roboto, sans-serif',
      fontSize: spec.tablet ? 12.5 : ios ? 15 : 12.5, fontWeight: 600, letterSpacing: -0.2,
      userSelect: 'none',
    }}>
      <span style={{ mixBlendMode: BAR_BLEND }}>9:41</span>
      {/* Isla dinámica (iPhone) o cámara perforada (Android). */}
      {spec.cutout && spec.cutout !== 'none' && (
        <span style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          background: '#000',
          ...(spec.cutout === 'island'
            ? { width: 108, height: 30, borderRadius: 15 }
            : { width: 11, height: 11, borderRadius: '50%' }),
        }}/>
      )}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: ios && !spec.tablet ? 12.5 : 11, mixBlendMode: BAR_BLEND }}>
        5G
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
          <rect x="0.5" y="0.5" width="20" height="11" rx="3" stroke="currentColor" opacity="0.5"/>
          <rect x="2" y="2" width="14" height="8" rx="1.5" fill="currentColor"/>
          <rect x="22" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.5"/>
        </svg>
      </span>
    </div>
  );
}

function NavBar({ spec }: { spec: DeviceSpec }) {
  const bar: CSSProperties = {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: spec.navBar,
    pointerEvents: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: BAR_FG, mixBlendMode: BAR_BLEND,
  };
  if (spec.chrome === 'android-buttons') {
    return (
      <div style={{ ...bar, justifyContent: 'space-around', padding: '0 14%' }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M11 1.5v11L2.5 7z" fill="currentColor"/></svg>
        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="currentColor"/></svg>
        <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="1" fill="currentColor"/></svg>
      </div>
    );
  }
  // Indicador de inicio (iPhone) o pastilla de gestos (Android).
  const ios = spec.chrome === 'ios';
  return (
    <div style={bar}>
      <span style={{
        width: spec.tablet ? 220 : ios ? 134 : 108, height: ios ? 5 : 4, borderRadius: 3,
        background: 'currentColor', opacity: 0.9,
      }}/>
    </div>
  );
}
