import React from 'react';
import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-ink-500 bg-ink-800 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-mist-300"
            style={{ animation: `pulseDot 1s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </div>
    </motion.div>
  );
}
