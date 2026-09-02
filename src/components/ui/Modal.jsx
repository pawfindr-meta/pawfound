import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from '@phosphor-icons/react';

export default function Modal({ open, onClose, title, subtitle, children, wide = false }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-night/45 backdrop-blur-sm"
            onClick={onClose}
            aria-label="Close"
          />
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[88vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-surface border border-linen shadow-[0_30px_80px_rgba(28,23,18,0.22)] flex flex-col`}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-linen">
              <div>
                {title && <h2 className="text-lg font-display font-semibold text-ink">{title}</h2>}
                {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-linen text-ink hover:bg-copper-soft transition"
                  aria-label="Close dialog"
                >
                  <X size={16} weight="bold" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar p-5">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
