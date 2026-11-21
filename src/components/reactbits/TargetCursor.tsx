import React, { useEffect, useRef } from 'react';

export const TargetCursor: React.FC = React.memo(() => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const bracketsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only enable on desktop pointer devices
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const cursor = cursorRef.current;
    if (!cursor) return;

    let targetX = -100;
    let targetY = -100;
    let currentX = -100;
    let currentY = -100;
    let isHovering = false;
    let animationFrame: number;
    let isVisible = false;

    const onMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!isVisible) {
        isVisible = true;
        cursor.style.opacity = '1';
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const interactive = Boolean(
        target.closest('button') ||
        target.closest('a') ||
        target.closest('input') ||
        target.closest('[role="button"]') ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.tagName === 'INPUT'
      );

      if (interactive !== isHovering) {
        isHovering = interactive;
        if (bracketsRef.current && dotRef.current) {
          bracketsRef.current.style.transform = isHovering ? 'scale(1.35)' : 'scale(1)';
          bracketsRef.current.style.borderColor = isHovering ? '#f3e5ab' : 'rgba(212, 175, 55, 0.7)';
          dotRef.current.style.transform = isHovering ? 'scale(1.5)' : 'scale(1)';
          dotRef.current.style.backgroundColor = isHovering ? '#fffdf5' : '#d4af37';
        }
      }
    };

    const onMouseLeave = () => {
      isVisible = false;
      cursor.style.opacity = '0';
    };

    const lerp = (a: number, b: number, n: number) => (1 - n) * a + n * b;

    const render = () => {
      currentX = lerp(currentX, targetX, 0.32);
      currentY = lerp(currentY, targetY, 0.32);
      cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;
      animationFrame = requestAnimationFrame(render);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);
    animationFrame = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none z-[9999] opacity-0 will-change-transform"
      style={{ transition: 'opacity 0.25s ease' }}
    >
      {/* Center crosshair dot */}
      <div
        ref={dotRef}
        className="w-1.5 h-1.5 rounded-full bg-[#d4af37] mx-auto transition-transform duration-150"
      />

      {/* Target HUD Reticle Brackets */}
      <div
        ref={bracketsRef}
        className="absolute inset-[-11px] pointer-events-none transition-all duration-150 ease-out"
      >
        <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#d4af37]/60" />
        <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#d4af37]/60" />
        <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#d4af37]/60" />
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[#d4af37]/60" />
      </div>
    </div>
  );
});
