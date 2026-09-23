import React, { useRef, useState } from 'react';

export default function Composer({ onSend, disabled, placeholder }) {
  const [value, setValue] = useState('');
  const areaRef = useRef(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (areaRef.current) areaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoGrow = (e) => {
    setValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  return (
    <div className="border-t border-ink-600 bg-ink-950/90 p-3 sm:p-4">
      <div className="flex items-end gap-2 rounded-2xl border border-ink-500 bg-ink-800 px-3 py-2 focus-within:border-signal/50">
        <textarea
          ref={areaRef}
          rows={1}
          value={value}
          onChange={autoGrow}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || 'Describe your automation, or answer the question above…'}
          className="max-h-[140px] flex-1 resize-none bg-transparent py-1.5 text-[14.5px] text-mist-100 placeholder:text-mist-400 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-signal text-ink-950 transition-transform enabled:hover:scale-105 disabled:cursor-not-allowed disabled:bg-ink-500 disabled:text-mist-400"
        >
          <SendIcon />
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-mist-400">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M4 12L20 4L14 20L11 13L4 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
