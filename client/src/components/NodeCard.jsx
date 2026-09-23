import React from 'react';

const KIND_STYLES = {
  Trigger: { dot: 'bg-wire-blue', border: 'border-wire-blue/25', tint: 'bg-wire-blue/10', text: 'text-wire-blue' },
  Condition: { dot: 'bg-wire-amber', border: 'border-wire-amber/25', tint: 'bg-wire-amber/10', text: 'text-wire-amber' },
  'Action · Notify': { dot: 'bg-signal', border: 'border-signal/25', tint: 'bg-signal/10', text: 'text-signal' },
  Action: { dot: 'bg-signal', border: 'border-signal/25', tint: 'bg-signal/10', text: 'text-signal' },
};

export default function NodeCard({ node }) {
  const style = KIND_STYLES[node.kind] || KIND_STYLES.Action;
  return (
    <div className={`rounded-xl border ${style.border} bg-ink-800 p-3.5 shadow-node`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${style.text}`}>{node.kind}</span>
        </div>
        <span className="font-mono text-[10px] text-mist-400">{node.id}</span>
      </div>

      {node.fields.length === 0 && node.pendingFields.length === 0 && (
        <p className="text-xs text-mist-400">Waiting for details…</p>
      )}

      <dl className="space-y-1.5">
        {node.fields.map((f) => (
          <div key={f.key} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="shrink-0 text-mist-400">{f.label}</dt>
            <dd className="truncate text-right font-medium text-mist-100">{f.value}</dd>
          </div>
        ))}
        {node.pendingFields.map((label) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="shrink-0 text-mist-400">{label}</dt>
            <dd className="text-right italic text-mist-400/70">pending…</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
