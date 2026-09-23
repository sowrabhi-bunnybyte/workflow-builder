import React from 'react';

const TYPE_STYLES = {
  trigger: { border: 'border-wire-blue/30', tint: 'bg-wire-blue/10', text: 'text-wire-blue', dot: 'bg-wire-blue' },
  condition: { border: 'border-wire-amber/30', tint: 'bg-wire-amber/10', text: 'text-wire-amber', dot: 'bg-wire-amber' },
  action: { border: 'border-signal/30', tint: 'bg-signal/10', text: 'text-signal', dot: 'bg-signal' },
  end: { border: 'border-mist-400/25', tint: 'bg-ink-700', text: 'text-mist-300', dot: 'bg-mist-400' },
};

function DiagramNode({ node }) {
  const style = TYPE_STYLES[node.type] || TYPE_STYLES.end;
  return (
    <div className={`w-full rounded-xl border ${style.border} ${style.tint} p-3.5 shadow-node`}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${style.text}`}>{node.type}</span>
      </div>
      <p className="text-[13px] font-medium leading-snug text-mist-100">{node.name}</p>
      {node.description && <p className="mt-1 text-[11.5px] leading-snug text-mist-400">{node.description}</p>}
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="h-4 w-px bg-ink-500" />
      {label && (
        <span
          className={`my-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            label === 'true'
              ? 'border-signal/30 bg-signal/10 text-signal'
              : 'border-wire-rose/30 bg-wire-rose/10 text-wire-rose'
          }`}
        >
          {label === 'true' ? 'if true' : label === 'false' ? 'if false' : label}
        </span>
      )}
      <div className="h-4 w-px bg-ink-500" />
    </div>
  );
}

export default function WorkflowDiagram({ workflow }) {
  const { nodes, connections } = workflow;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const trigger = nodes.find((n) => n.type === 'trigger');
  const conditions = nodes.filter((n) => n.type === 'condition');

  // Everything up to (and including) the last condition is a single chain.
  const chain = [trigger, ...conditions].filter(Boolean);
  const lastChainId = chain[chain.length - 1]?.id;

  const branches = connections.filter((c) => c.from === lastChainId && c.condition);
  const hasBranch = branches.length > 0;

  const sequentialActions = hasBranch
    ? []
    : nodes.filter((n) => n.type === 'action' || n.type === 'end').filter((n) => n.id !== lastChainId);

  return (
    <div className="flex flex-col items-stretch">
      {chain.map((node, i) => (
        <React.Fragment key={node.id}>
          <DiagramNode node={node} />
          {i < chain.length - 1 && <Arrow />}
        </React.Fragment>
      ))}

      {!hasBranch &&
        sequentialActions.map((node) => (
          <React.Fragment key={node.id}>
            <Arrow />
            <DiagramNode node={node} />
          </React.Fragment>
        ))}

      {hasBranch && (
        <>
          <div className="grid grid-cols-2 gap-3 pt-1">
            {['true', 'false'].map((cond) => {
              const targets = branches.filter((b) => b.condition === cond).map((b) => byId[b.to]);
              if (targets.length === 0) return <div key={cond} />;
              return (
                <div key={cond} className="flex flex-col items-stretch">
                  <div className="flex justify-center">
                    <Arrow label={cond} />
                  </div>
                  <div className="space-y-3">
                    {targets.map((t) => (
                      <DiagramNode key={t.id} node={t} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
