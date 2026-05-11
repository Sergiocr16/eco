import { useId } from 'react';

type Props = {
  size?: number;
  mono?: boolean;
};

export function EcoMark({ size = 56, mono = false }: Props) {
  const id = useId().replace(/:/g, '');
  // Colores oficiales del brand (ver frontend/public/brand/colors.txt)
  const color1 = mono ? 'currentColor' : '#48E0D4';
  const color2 = mono ? 'currentColor' : '#76F2A4';
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-label="Eco">
      <defs>
        <linearGradient id={`eco-arc-${id}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color1}/>
          <stop offset="100%" stopColor={color2}/>
        </linearGradient>
      </defs>
      <path
        d="M 8.95 39 A 22 22 0 1 1 17 47.05"
        stroke={`url(#eco-arc-${id})`}
        strokeWidth="3.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="15.5" cy="40.5" r="2.4" fill={`url(#eco-arc-${id})`}/>
    </svg>
  );
}
