import React from 'react';

const STATUS_COPY = {
  initial: { label: 'Waiting for a request', dot: 'bg-mist-400' },
  understanding: { label: 'Understanding request', dot: 'bg-wire-blue' },
  clarifying: { label: 'Clarifying', dot: 'bg-wire-amber' },
  confirming_contradiction: { label: 'Confirming a change', dot: 'bg-wire-rose' },
  ready: { label: 'Ready to generate', dot: 'bg-signal' },
  generated: { label: 'Workflow generated', dot: 'bg-signal' },
};

export default function Header({ status, llmAvailable, onReset, mobileTab, onMobileTabChange, hasWorkflow }) {
  const statusInfo = STATUS_COPY[status] || STATUS_COPY.initial;

  return (
    <header className="flex flex-col gap-3 border-b border-ink-600 bg-ink-950/80 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-signal/15 text-signal">
            <NodeGlyph />
          </div>
          <div className="leading-tight">
            <h1 className="font-display text-[15px] font-semibold tracking-tight text-mist-100">Workflow Builder</h1>
            <p className="hidden text-xs text-mist-400 sm:block">Conversational automation planner</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <TabButton active={mobileTab === 'chat'} onClick={() => onMobileTabChange('chat')}>
            Chat
          </TabButton>
          <TabButton active={mobileTab === 'blueprint'} onClick={() => onMobileTabChange('blueprint')} pulse={hasWorkflow}>
            Blueprint
          </TabButton>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800/60 px-3 py-1.5 text-xs text-mist-300">
          <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot} ${status === 'clarifying' ? 'animate-pulseDot' : ''}`} />
          {statusInfo.label}
        </div>
        <div
          title={llmAvailable ? 'Connected to a live LLM for smarter extraction' : 'Running fully offline on the rule-based engine'}
          className="hidden items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800/60 px-3 py-1.5 text-xs text-mist-300 sm:flex"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${llmAvailable ? 'bg-wire-blue' : 'bg-mist-400'}`} />
          {llmAvailable ? 'AI-assisted' : 'Offline mode'}
        </div>
        <button
          onClick={onReset}
          className="rounded-full border border-ink-500 px-3 py-1.5 text-xs font-medium text-mist-300 transition-colors hover:border-signal/40 hover:text-signal"
        >
          Start over
        </button>
      </div>
    </header>
  );
}

function TabButton({ active, onClick, children, pulse }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-signal text-ink-950' : 'bg-ink-800 text-mist-300'
      }`}
    >
      {children}
      {pulse && !active && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-signal" />}
    </button>
  );
}

function NodeGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="19" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 7.5L10.5 16M17 7.5L13.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
