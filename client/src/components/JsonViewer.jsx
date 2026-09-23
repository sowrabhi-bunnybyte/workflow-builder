import React, { useState } from 'react';

export default function JsonViewer({ data, filename = 'workflow.json' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore silently */
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-ink-500 bg-ink-800">
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-medium text-mist-300 hover:text-mist-100"
        >
          <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          Raw workflow JSON
        </button>
        <div className="flex items-center gap-2">
          <button onClick={copy} className="rounded-lg border border-ink-500 px-2.5 py-1 text-[11px] text-mist-300 hover:text-signal">
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={download} className="rounded-lg border border-ink-500 px-2.5 py-1 text-[11px] text-mist-300 hover:text-signal">
            Download
          </button>
        </div>
      </div>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-ink-600 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-mist-200">
          {text}
        </pre>
      )}
    </div>
  );
}
