import React from 'react';

export default function EmptyState({ icon, title, body, action, inverted = false }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-3">
      {icon && (
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${inverted ? 'bg-white/8 text-copper' : 'bg-copper-soft text-copper'}`}>
          {icon}
        </div>
      )}
      <h3 className={`text-base font-display font-semibold ${inverted ? 'text-canvas' : 'text-ink'}`}>{title}</h3>
      {body && <p className={`text-sm max-w-sm leading-relaxed ${inverted ? 'text-canvas/55' : 'text-muted'}`}>{body}</p>}
      {action}
    </div>
  );
}
