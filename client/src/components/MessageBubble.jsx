import React from 'react';
import { motion } from 'framer-motion';
import { renderInlineBold } from '../lib/miniMarkdown.jsx';

export default function MessageBubble({ role, content, isError }) {
  const isUser = role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed sm:max-w-[75%] ${
          isUser
            ? 'rounded-br-sm bg-signal text-ink-950'
            : isError
            ? 'rounded-bl-sm border border-wire-rose/30 bg-wire-rose/10 text-mist-100'
            : 'rounded-bl-sm border border-ink-500 bg-ink-800 text-mist-100'
        }`}
      >
        {renderInlineBold(content)}
      </div>
    </motion.div>
  );
}
