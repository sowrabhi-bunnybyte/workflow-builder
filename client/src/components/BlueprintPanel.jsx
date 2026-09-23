import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StatusStepper from './StatusStepper.jsx';
import NodeCard from './NodeCard.jsx';
import WorkflowDiagram from './WorkflowDiagram.jsx';
import JsonViewer from './JsonViewer.jsx';

export default function BlueprintPanel({ engineState, loading }) {
  if (loading || !engineState) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-mist-400">Loading blueprint…</div>
    );
  }

  const { status, nodes, generatedWorkflow, intentSummary, notices, optionalPreferences } = engineState;
  const isGenerated = status === 'generated' && generatedWorkflow;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-ink-600 px-4 py-3.5 sm:px-5">
        <h2 className="font-display text-sm font-semibold text-mist-100">Workflow Blueprint</h2>
        <p className="mt-0.5 text-xs text-mist-400">Builds up live as the conversation fills in each detail.</p>
        <div className="mt-3">
          <StatusStepper status={status} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {nodes.length === 0 && (
          <EmptyState />
        )}

        {intentSummary && !isGenerated && (
          <p className="mb-4 rounded-lg border border-ink-500 bg-ink-800/60 px-3 py-2 text-xs italic text-mist-300">
            “{intentSummary}”
          </p>
        )}

        <AnimatePresence mode="wait">
          {isGenerated ? (
            <motion.div
              key="generated"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div className="rounded-xl border border-signal/25 bg-signal/5 px-3.5 py-3">
                <p className="font-display text-[13.5px] font-semibold text-mist-100">
                  {generatedWorkflow.workflow.name}
                </p>
                <p className="mt-0.5 text-xs text-mist-400">{generatedWorkflow.workflow.description}</p>
                {optionalPreferences && (
                  <p className="mt-1.5 text-[11px] text-mist-400">
                    Additional preference noted: <span className="text-mist-200">{optionalPreferences}</span>
                  </p>
                )}
              </div>

              <WorkflowDiagram workflow={generatedWorkflow.workflow} />

              <JsonViewer
                data={generatedWorkflow}
                filename={`${slugify(generatedWorkflow.workflow.name)}.json`}
              />

              <p className="pt-1 text-center text-[11px] text-mist-400">
                This is a plan, not an execution — nothing here has been run or connected to any real service.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="live"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              {nodes.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {notices?.length > 0 && (
          <div className="mt-5 space-y-1.5 border-t border-ink-600 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-mist-400">Transparency log</p>
            {notices.map((n, i) => (
              <p key={i} className="text-[11px] leading-snug text-mist-400">
                {n}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-dashed border-ink-500 text-mist-400">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="19" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="18" r="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 7L10.5 16M17 7L13.5 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="max-w-[220px] text-xs text-mist-400">
        Describe an automation in the chat and its trigger, conditions, and actions will appear here as they're confirmed.
      </p>
    </div>
  );
}

function slugify(s) {
  return String(s || 'workflow')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
