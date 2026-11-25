// One easing curve and three durations for the whole UI.
export const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
export const EASE_ARRAY: [number, number, number, number] = [0.2, 0, 0, 1];

export const DUR = { fast: 140, base: 200, enter: 260 } as const;

// Named properties instead of `all`: layout properties never animate.
export const T_UI = ['background-color', 'border-color', 'color', 'box-shadow', 'opacity', 'transform']
  .map((p) => `${p} ${DUR.fast}ms ${EASE}`)
  .join(', ');

// framer-motion transition with the same curve (no springs, no overshoot).
export const TWEEN = { type: 'tween' as const, duration: DUR.base / 1000, ease: EASE_ARRAY };
export const tween = (delay = 0) => ({ ...TWEEN, delay });
