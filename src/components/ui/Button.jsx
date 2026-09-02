import React from 'react';

const VARIANTS = {
  primary: 'bg-copper text-white hover:bg-copper-dark shadow-[0_8px_20px_rgba(196,92,38,0.28)]',
  secondary: 'bg-linen text-ink hover:bg-copper-soft',
  ghost: 'bg-transparent text-ink hover:bg-linen',
  night: 'bg-night text-canvas hover:bg-night-2',
  danger: 'bg-danger text-white hover:brightness-110',
  meadow: 'bg-meadow text-white hover:brightness-110',
  outline: 'border border-linen bg-surface text-ink hover:border-copper/40 hover:bg-copper-soft',
};

export default function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
