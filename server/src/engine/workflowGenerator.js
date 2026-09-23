/**
 * workflowGenerator.js
 * ---------------------------------------------------------------------------
 * Builds the final structured workflow JSON (FR-13, FR-14) from the fully
 * resolved dialogue state. The NODE/CONNECTION SHAPE IS ALWAYS BUILT IN
 * CODE — never by asking the LLM to produce the final JSON — so the output
 * schema is guaranteed valid and consistent (NFR-04) no matter what the LLM
 * does. The LLM is only ever used, optionally, to write a nicer display name
 * and one-sentence description per node; if that call fails or no key is
 * configured, template-based names are used instead and the output is
 * identical in structure.
 * ---------------------------------------------------------------------------
 */

const OPERATOR_SYMBOLS = {
  equals: '=',
  'is equal to': '=',
  'greater than': '>',
  'is greater than': '>',
  'less than': '<',
  'is less than': '<',
  contains: 'contains',
  'does not equal': '≠',
};

function operatorSymbol(op) {
  if (!op) return '=';
  const key = op.trim().toLowerCase();
  return OPERATOR_SYMBOLS[key] || op;
}

function templateNameAndDescription(node) {
  const f = node.fields;
  switch (node.kind) {
    case 'trigger':
      return {
        name: `New: ${f.event || 'Event'}`,
        description: `Starts the workflow when ${f.event || 'the trigger event'} happens on ${f.source || 'the configured source'}.`,
      };
    case 'condition':
      return {
        name: `Check: ${f.field || 'condition'} ${operatorSymbol(f.operator)} ${f.value || ''}`.trim(),
        description: `Branches the workflow based on whether ${f.field || 'the value'} ${f.operator || 'meets'} ${f.value || 'the configured value'}.`,
      };
    case 'action_notify':
      return {
        name: `Notify via ${f.channel || 'channel'}`,
        description: `Sends a notification to ${f.recipient || 'the recipient'} over ${f.channel || 'the configured channel'}.`,
      };
    case 'action_generic':
    default:
      return {
        name: `Update ${f.target || 'system'}`,
        description: `Performs an action on ${f.target || 'the configured system'}.`,
      };
  }
}

async function narrativeFor(node, { llmProvider, prompts }) {
  const fallback = templateNameAndDescription(node);
  if (!llmProvider.isConfigured()) return fallback;
  try {
    const messages = prompts.buildNarrativeMessages({
      node: { type: node.type, category: node.category, fields: node.fields },
    });
    const result = await llmProvider.chatJSON(messages, { temperature: 0.3 });
    return {
      name: result.name || fallback.name,
      description: result.description || fallback.description,
    };
  } catch {
    return fallback;
  }
}

function autoWorkflowName(state) {
  const trigger = state.nodes.find((n) => n.kind === 'trigger');
  const action = state.nodes.find((n) => n.kind.startsWith('action'));
  const triggerPart = trigger?.fields?.event || 'New Event';
  const actionPart =
    action?.kind === 'action_notify'
      ? `Notify via ${action.fields.channel || 'Channel'}`
      : `Update ${action?.fields?.target || 'System'}`;
  return `${capitalizeWords(triggerPart)} → ${actionPart}`;
}

function capitalizeWords(s) {
  return (s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function buildFinalWorkflow(state, { llmProvider, prompts }) {
  const trigger = state.nodes.find((n) => n.kind === 'trigger');
  const conditions = state.nodes.filter((n) => n.kind === 'condition');
  const actions = state.nodes.filter((n) => n.kind === 'action_notify' || n.kind === 'action_generic');

  const nodes = [];
  const connections = [];

  const triggerNarrative = await narrativeFor(trigger, { llmProvider, prompts });
  nodes.push({
    id: trigger.id,
    type: 'trigger',
    name: triggerNarrative.name,
    description: triggerNarrative.description,
    config: { ...trigger.fields },
  });

  let previousId = trigger.id;

  for (const condition of conditions) {
    const narrative = await narrativeFor(condition, { llmProvider, prompts });
    nodes.push({
      id: condition.id,
      type: 'condition',
      name: narrative.name,
      description: narrative.description,
      config: { ...condition.fields },
    });
    connections.push({ from: previousId, to: condition.id });
    previousId = condition.id;
  }

  const lastCondition = conditions[conditions.length - 1];

  if (lastCondition) {
    // Branching: all actions fire on the "true" branch; an explicit "end"
    // node documents the "false" branch so the diagram is unambiguous
    // about what happens when the condition is not met (spec section 10).
    for (const action of actions) {
      const narrative = await narrativeFor(action, { llmProvider, prompts });
      nodes.push({
        id: action.id,
        type: 'action',
        category: action.category,
        name: narrative.name,
        description: narrative.description,
        config: { ...action.fields },
      });
      connections.push({ from: lastCondition.id, to: action.id, condition: 'true' });
    }
    nodes.push({ id: 'end_1', type: 'end', name: 'End', description: 'Workflow ends without action.', config: {} });
    connections.push({ from: lastCondition.id, to: 'end_1', condition: 'false' });
  } else {
    // No branching: chain actions sequentially after the trigger.
    for (const action of actions) {
      const narrative = await narrativeFor(action, { llmProvider, prompts });
      nodes.push({
        id: action.id,
        type: 'action',
        category: action.category,
        name: narrative.name,
        description: narrative.description,
        config: { ...action.fields },
      });
      connections.push({ from: previousId, to: action.id });
      previousId = action.id;
    }
  }

  return {
    workflow: {
      name: state.workflowName || autoWorkflowName(state),
      description: state.intentSummary || 'Generated from a conversational workflow-building session.',
      createdAt: new Date().toISOString(),
      additionalPreferences: state.optionalPreferencesAnswer || null,
      nodes,
      connections,
    },
  };
}

module.exports = { buildFinalWorkflow, templateNameAndDescription, operatorSymbol };
