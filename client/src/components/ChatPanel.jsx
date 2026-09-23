import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import Composer from './Composer.jsx';

export default function ChatPanel({ messages, onSend, sending, loading }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-mist-400">
            Connecting to the planning assistant…
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} isError={m.isError} />
            ))}
            {sending && <TypingIndicator />}
          </>
        )}
      </div>
      <Composer onSend={onSend} disabled={loading || sending} />
    </div>
  );
}
