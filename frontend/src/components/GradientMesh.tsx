export function GradientMesh() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Base wash to anchor color */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, oklch(0.18 0.04 280 / 0.8), transparent 60%), radial-gradient(80% 60% at 0% 100%, oklch(0.16 0.06 220 / 0.6), transparent 70%)',
        }}
      />
      {/* Drifting blobs */}
      <div
        className="absolute rounded-full"
        style={{
          width: '55vw',
          height: '55vw',
          top: '-15%',
          left: '-10%',
          background:
            'radial-gradient(circle, oklch(0.52 0.22 280 / 0.55), transparent 65%)',
          filter: 'blur(80px)',
          animation: 'drift-1 28s ease-in-out infinite',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '45vw',
          height: '45vw',
          top: '10%',
          right: '-15%',
          background:
            'radial-gradient(circle, oklch(0.6 0.18 220 / 0.5), transparent 65%)',
          filter: 'blur(90px)',
          animation: 'drift-2 36s ease-in-out infinite',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '50vw',
          height: '50vw',
          bottom: '-20%',
          left: '15%',
          background:
            'radial-gradient(circle, oklch(0.62 0.16 80 / 0.4), transparent 70%)',
          filter: 'blur(100px)',
          animation: 'drift-3 42s ease-in-out infinite',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '38vw',
          height: '38vw',
          top: '40%',
          left: '35%',
          background:
            'radial-gradient(circle, oklch(0.48 0.2 320 / 0.35), transparent 65%)',
          filter: 'blur(110px)',
          animation: 'drift-4 32s ease-in-out infinite',
          mixBlendMode: 'screen',
        }}
      />
      {/* Vignette to push focus inward */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 50%, transparent 40%, oklch(0.06 0.01 280 / 0.85) 100%)',
        }}
      />
    </div>
  );
}
