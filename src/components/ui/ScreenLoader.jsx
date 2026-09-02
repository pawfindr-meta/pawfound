import React from 'react';
import { motion } from 'framer-motion';

export default function ScreenLoader({ message = 'Getting things ready…' }) {
  return (
    <div className="h-screen w-screen bg-canvas flex flex-col items-center justify-center gap-5">
      <motion.div
        className="w-12 h-12 rounded-2xl bg-copper"
        animate={{ scale: [1, 1.08, 1], rotate: [0, 6, -6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
