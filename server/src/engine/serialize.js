const { FIELD_REGISTRY, OPTIONAL_CLOSING_FIELD } = require('./schema');

function fieldLabel(kind, key) {
  if (key === OPTIONAL_CLOSING_FIELD.key) return OPTIONAL_CLOSING_FIELD.label;
  const def = (FIELD_REGISTRY[kind] || []).find((d) => d.key === key);
  return def ? def.label : key;
}

function nodeDisplayKind(kind) {
  if (kind === 'trigger') return 'Trigger';
  if (kind === 'condition') return 'Condition';
  if (kind === 'action_notify') return 'Action · Notify';
  return 'Action';
}

/** Public, UI-safe view of the engine state. Never leaks retry counters etc. */
function serializeState(state) {
  return {
    sessionId: state.sessionId,
    status: state.status,
    workflowName: state.workflowName,
    intentSummary: state.intentSummary,
    llmAvailable: state.llmAvailable,
    nodes: state.nodes.map((n) => ({
      id: n.id,
      kind: nodeDisplayKind(n.kind),
      fields: Object.entries(n.fields).map(([key, value]) => ({
        key,
        label: fieldLabel(n.kind, key),
        value,
      })),
      pendingFields: Object.keys(n.ambiguousFields || {}).map((key) => fieldLabel(n.kind, key)),
      resolved: Object.keys(n.ambiguousFields || {}).length === 0,
    })),
    optionalPreferences: state.optionalPreferencesAnswer || null,
    notices: state.notices.slice(-5),
    generatedWorkflow: state.generatedWorkflow,
    turnCount: state.turnCount,
  };
}

module.exports = { serializeState };
