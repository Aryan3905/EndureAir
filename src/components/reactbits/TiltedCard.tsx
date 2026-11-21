import React, { useRef } from 'react';

interface TiltedCardProps {
  children: React.ReactNode;
  className?: string;
  maxAngle?: number;
}

export const TiltedCard: React.FC<TiltedCardProps> = React.memo(({
  children,
  className = '',
  maxAngle = 8,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  const updateRect = () => {
    if (cardRef.current) {
      const r = cardRef.current.getBoundingClientRect();
      rectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  };

  const handleMouseEnter = () => {
    updateRect();
    if (glareRef.current) glareRef.current.style.opacity = '0.15';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    if (!rectRef.current) updateRect();
    if (!rectRef.current) return;

    const x = e.clientX - rectRef.current.left;
    const y = e.clientY - rectRef.current.top;

    const percentX = (x / rectRef.current.width) * 100;
    const percentY = (y / rectRef.current.height) * 100;

    const rotateX = ((y - rectRef.current.height / 2) / (rectRef.current.height / 2)) * -maxAngle;
    const rotateY = ((x - rectRef.current.width / 2) / (rectRef.current.width / 2)) * maxAngle;

    // Pure GPU transform without React re-render
    cardRef.current.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.015, 1.015, 1.015)`;
    if (glareRef.current) {
      glareRef.current.style.background = `radial-gradient(circle at ${percentX.toFixed(1)}% ${percentY.toFixed(1)}%, rgba(255,255,255,0.35) 0%, transparent 60%)`;
    }
  };

  const handleMouseLeave = () => {
    if (cardRef.current) {
      cardRef.current.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    }
    if (glareRef.current) {
      glareRef.current.style.opacity = '0';
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transition: 'transform 0.18s cubic-bezier(0.2, 0, 0, 1)' }}
      className={`relative will-change-transform ${className}`}
    >
      {/* Holographic light glare overlay */}
      <div
        ref={glareRef}
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 rounded-[inherit] overflow-hidden will-change-[background,opacity]"
      />
      {children}
    </div>
  );
});
