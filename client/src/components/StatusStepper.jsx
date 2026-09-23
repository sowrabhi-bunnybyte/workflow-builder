import React from 'react';

const STEPS = [
  { key: 'understanding', label: 'Understanding' },
  { key: 'clarifying', label: 'Clarifying' },
  { key: 'ready', label: 'Ready' },
  { key: 'generated', label: 'Generated' },
];

function stepIndexFor(status) {
  if (status === 'generated') return 3;
  if (status === 'ready') return 2;
  if (status === 'clarifying' || status === 'confirming_contradiction') return 1;
  return 0;
}

export default function StatusStepper({ status }) {
  const activeIndex = stepIndexFor(status);
  return (
    <div className="flex items-center gap-1.5 px-1">
      {STEPS.map((step, i) => (
        <React.Fragment key={step.key}>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i < activeIndex ? 'bg-signal' : i === activeIndex ? 'bg-signal animate-pulseDot' : 'bg-ink-500'
              }`}
            />
            <span className={`text-[11px] font-medium ${i <= activeIndex ? 'text-mist-200' : 'text-mist-400'}`}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && <span className={`h-px w-4 ${i < activeIndex ? 'bg-signal/50' : 'bg-ink-500'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}
