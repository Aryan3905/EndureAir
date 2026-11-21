import React from 'react';

/**
 * Ultra-lightweight noise & vignette overlay.
 * Replaces heavy SVG feTurbulence filters to ensure 60+ FPS compositing on all screens.
 */
export const NoiseOverlay: React.FC = React.memo(() => {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-[80] opacity-[0.035]"
      style={{
        backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
    />
  );
});

