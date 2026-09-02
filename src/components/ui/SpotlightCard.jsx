import React, { useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(196, 92, 38, 0.15)', // Warm copper ambient glow
  borderColor = 'rgba(196, 92, 38, 0.45)',   // Crisp border catch
  size = 380,
  ...props
}) {
  const divRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-white/8 bg-night/85 backdrop-blur-2xl transition-all duration-300',
        className
      )}
      {...props}
    >
      {/* 1. Interactive Ambient Surface Glow */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-500 ease-out"
        style={{
          opacity,
          background: `radial-gradient(${size}px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />

      {/* 2. Interactive Border Edge Highlight */}
      <div
        className="pointer-events-none absolute -inset-px rounded-[inherit] transition-opacity duration-500 ease-out"
        style={{
          opacity,
          maskImage: 'linear-gradient(black, black) content-box, linear-gradient(black, black)',
          WebkitMaskImage: 'linear-gradient(black, black) content-box, linear-gradient(black, black)',
          maskComposite: 'exclude',
          WebkitMaskComposite: 'xor',
          padding: '1px',
          background: `radial-gradient(${size * 0.75}px circle at ${position.x}px ${position.y}px, ${borderColor}, transparent 70%)`,
        }}
      />

      {/* Content Container */}
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  );
}