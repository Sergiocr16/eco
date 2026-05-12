import { useId } from 'react';

type Props = {
  size?: number;
  mono?: boolean;
};

// Logo "stacked" — mark arriba + texto "eco" debajo. Replica
// /assets/eco-logo-stacked.svg. Útil para el sidebar principal.
export function EcoMarkStacked({ size = 32, mono = false }: { size?: number; mono?: boolean }) {
  const id = useId().replace(/:/g, '');
  const color1 = mono ? 'currentColor' : 'oklch(82% 0.14 170)';
  const color2 = mono ? 'currentColor' : 'oklch(68% 0.13 158)';
  // viewBox del asset oficial: 56×100 (mark 56×56 + texto 22px abajo).
  // El tamaño que pasa el usuario refleja el ANCHO. La altura se calcula
  // manteniendo el aspect ratio del viewBox (100/56 ≈ 1.786).
  const width = size;
  const height = Math.round(size * (100 / 56));
  return (
    <svg width={width} height={height} viewBox="0 0 56 100" fill="none" role="img" aria-label="Eco">
      <defs>
        <linearGradient id={`eco-stacked-${id}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color1}/>
          <stop offset="100%" stopColor={color2}/>
        </linearGradient>
      </defs>
      <path
        d="M 8.95 39 A 22 22 0 1 1 17 47.05"
        stroke={`url(#eco-stacked-${id})`}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="15.5" cy="40.5" r="3.6" fill={`url(#eco-stacked-${id})`}/>
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
  const color1 = mono ? 'currentColor' : 'oklch(82% 0.14 170)';
  const color2 = mono ? 'currentColor' : 'oklch(68% 0.13 158)';
  // size aquí refleja la ALTURA. El ancho se calcula manteniendo aspect.
  const height = size;
  const width = Math.round(size * (200 / 56));
  return (
    <svg width={width} height={height} viewBox="0 0 200 56" fill="none" role="img" aria-label="Eco">
      <defs>
        <linearGradient id={`eco-horiz-${id}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color1}/>
          <stop offset="100%" stopColor={color2}/>
        </linearGradient>
      </defs>
      <path
        d="M 8.95 39 A 22 22 0 1 1 17 47.05"
        stroke={`url(#eco-horiz-${id})`}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="15.5" cy="40.5" r="3.6" fill={`url(#eco-horiz-${id})`}/>
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
// Gradiente OKLCH (verde-teal) + arco con r=22 + dot de 3.6.
export function EcoMark({ size = 56, mono = false }: Props) {
  const id = useId().replace(/:/g, '');
  const color1 = mono ? 'currentColor' : 'oklch(82% 0.14 170)';
  const color2 = mono ? 'currentColor' : 'oklch(68% 0.13 158)';
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" role="img" aria-label="Eco">
      <defs>
        <linearGradient id={`eco-arc-${id}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color1}/>
          <stop offset="100%" stopColor={color2}/>
        </linearGradient>
      </defs>
      <path
        d="M 8.95 39 A 22 22 0 1 1 17 47.05"
        stroke={`url(#eco-arc-${id})`}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="15.5" cy="40.5" r="3.6" fill={`url(#eco-arc-${id})`}/>
    </svg>
  );
}
