import { useId } from 'react';

type Props = {
  size?: number;
  mono?: boolean;
};

// Logo "stacked" — mark arriba + texto "eco" debajo. Replica
// /assets/eco-logo-stacked.svg. Útil para el sidebar principal.
export function EcoMarkStacked({ size = 32, mono = false }: { size?: number; mono?: boolean }) {
  const id = useId().replace(/:/g, '');
  const color1 = mono ? 'currentColor' : 'var(--brand, #d98562)';
  const color2 = mono ? 'currentColor' : 'var(--brand, #d98562)';
  // viewBox del asset oficial: 56×100 (mark 56×56 + texto 22px abajo).
  // El tamaño que pasa el usuario refleja el ANCHO. La altura se calcula
  // manteniendo el aspect ratio del viewBox (100/56 ≈ 1.786).
  const width = size;
  const height = Math.round(size * (100 / 56));
  return (
    <svg width={width} height={height} viewBox="0 0 56 100" fill="none" role="img" aria-label="Eco">
      <defs>
        <linearGradient id={`eco-stacked-${id}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: color1 }}/>
          <stop offset="100%" style={{ stopColor: color2 }}/>
        </linearGradient>
      </defs>
      <path
        d="M 6.33 31.82 A 22 22 0 1 1 20.66 48.74"
        stroke={`url(#eco-stacked-${id})`}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="15.6" cy="36.4" r="4" fill={`url(#eco-stacked-${id})`}/>
      <text
        x="28" y="92" textAnchor="middle"
        fontFamily='-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif'
        fontSize="22" fontWeight="300" letterSpacing="0.3"
        fill="currentColor"
      >eco</text>
    </svg>
  );
}

// Logo "horizontal" — mark a la izquierda + texto "eco" al lado. Replica
// /assets/eco-logo-horizontal.svg. ViewBox 200×56, aspect ratio ~3.57.
export function EcoMarkHorizontal({ size = 56, mono = false }: { size?: number; mono?: boolean }) {
  const id = useId().replace(/:/g, '');
  const color1 = mono ? 'currentColor' : 'var(--brand, #d98562)';
  const color2 = mono ? 'currentColor' : 'var(--brand, #d98562)';
  // size aquí refleja la ALTURA. El ancho se calcula manteniendo aspect.
  const height = size;
  const width = Math.round(size * (200 / 56));
  return (
    <svg width={width} height={height} viewBox="0 0 200 56" fill="none" role="img" aria-label="Eco">
      <defs>
        <linearGradient id={`eco-horiz-${id}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: color1 }}/>
          <stop offset="100%" style={{ stopColor: color2 }}/>
        </linearGradient>
      </defs>
      <path
        d="M 6.33 31.82 A 22 22 0 1 1 20.66 48.74"
        stroke={`url(#eco-horiz-${id})`}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="15.6" cy="36.4" r="4" fill={`url(#eco-horiz-${id})`}/>
      <text
        x="72" y="42"
        fontFamily='-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif'
        fontSize="44" fontWeight="300" letterSpacing="0.4"
        fill="currentColor"
      >eco</text>
    </svg>
  );
}

// Wordmark "eco" — solo las letras, sin el arco. Replica
// /assets/eco-wordmark.svg. Útil donde queremos texto puro (hub central
// del Bohr model, dock home, etc.) heredando el color del contexto.
export function EcoWordmark({ size = 28 }: { size?: number }) {
  // viewBox ajustado al extent visual de "eco" (~95px) para que el centro
  // del SVG coincida con el centro óptico del texto.
  const height = size;
  const width = Math.round(size * 2.4);
  return (
    <svg width={width} height={height} viewBox="0 0 96 40" fill="none" role="img" aria-label="eco">
      <text
        x="0" y="32"
        fontFamily='-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif'
        fontSize="40" fontWeight="300" letterSpacing="0.4"
        fill="currentColor"
      >eco</text>
    </svg>
  );
}

// Logo oficial de Eco — replica /assets/eco-mark.svg exactamente.
// Color de marca fijo (--brand) + misma geometría que EcoGlyph (arco r=22, punto separado).
export function EcoMark({ size = 56, mono = false }: Props) {
  const id = useId().replace(/:/g, '');
  const color1 = mono ? 'currentColor' : 'var(--brand, #d98562)';
  const color2 = mono ? 'currentColor' : 'var(--brand, #d98562)';
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" role="img" aria-label="Eco">
      <defs>
        <linearGradient id={`eco-arc-${id}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: color1 }}/>
          <stop offset="100%" style={{ stopColor: color2 }}/>
        </linearGradient>
      </defs>
      <path
        d="M 6.33 31.82 A 22 22 0 1 1 20.66 48.74"
        stroke={`url(#eco-arc-${id})`}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="15.6" cy="36.4" r="4" fill={`url(#eco-arc-${id})`}/>
    </svg>
  );
}

// Marca sola (anillo abierto + punto) en el color de acento del tema.
export function EcoGlyph({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" role="img" aria-label="Eco"
      style={{ flex: 'none', color: 'var(--brand, #d98562)' }}>
      <circle cx="15" cy="15" r="11" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        strokeDasharray="57.5 11.6" transform="rotate(170 15 15)"/>
      <circle cx="8.8" cy="19.2" r="2" fill="currentColor"/>
    </svg>
  );
}
