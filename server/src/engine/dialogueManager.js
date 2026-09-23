/**
 * dialogueManager.js
 * ---------------------------------------------------------------------------
 * The heart of the system: a deterministic slot-filling state machine that
 * is *assisted* by an LLM but never *controlled* by one.
 *
 * Why this shape? The assignment's hard requirement is "never assume missing
 * information" and "determine when the workflow is ready" reliably. LLMs are
 * great at reading free text, mediocre at reliably self-reporting "am I
 * done yet?" — especially on a free-tier model. So responsibilities split as:
 *
 *   LLM  (or rule-based fallback) → "what did the user just say, structured?"
 *   This file (pure code)         → "what's missing, what's ambiguous, what
 *                                    contradicts, are we ready, what do we
 *                                    ask next?"
 *
 * That split is also why this file has zero network calls and can be unit
 * tested completely offline (NFR-02) — see server/test/dialogueManager.test.js.
 * ---------------------------------------------------------------------------
 */

const { randomUUID } = require('crypto');
const {
  STATUS,
  FIELD_REGISTRY,
  OPTIONAL_CLOSING_FIELD,
  CORRECTION_SIGNALS,
} = require('./schema');
const ruleBased = require('./ruleBasedExtractor');
const llmProvider = require('../llm/provider');
const prompts = require('../llm/prompts');
const { buildFinalWorkflow } = require('./workflowGenerator');

const UNCERTAIN_PATTERNS = [/^i don'?t know$/i, /^not sure$/i, /^idk$/i, /^no idea$/i, /^dunno$/i, /^unsure$/i];
const MAX_RETRIES_BEFORE_SUGGESTIONS = 2;

// ---------------------------------------------------------------------------
// Session bootstrap
// ---------------------------------------------------------------------------

function createSession() {
  return {
    sessionId: randomUUID(),
    status: STATUS.INITIAL,
    workflowName: null,
    intentSummary: null,
    nodes: [], // { id, kind, type, category, fields:{}, ambiguousFields:{}, retries:{} }
    pendingContradiction: null, // { nodeId, field, oldValue, newValue, label }
    pendingQuestion: null, // { nodeId, field, question, isOptionalClosing, isAmbiguity }
    askedOptionalClosing: false,
    history: [], // { role, content, ts }
    turnCount: 0,
    generatedWorkflow: null,
    notices: [], // transparency log surfaced to the UI (fallback used, retries, etc.)
    llmAvailable: llmProvider.isConfigured(),
  };
}

// ---------------------------------------------------------------------------
// Node helpers
// ---------------------------------------------------------------------------

function requiredFieldsFor(kind) {
  return FIELD_REGISTRY[kind] || [];
}

function nodeTypeFor(kind) {
  if (kind === 'trigger') return 'trigger';
  if (kind === 'condition') return 'condition';
  return 'action';
}

function categoryFor(kind) {
  if (kind === 'action_notify') return 'notify';
  if (kind === 'action_generic') return 'other';
  return null;
}

function createNode(kind) {
  return {
    id: null, // assigned lazily on first read / generation
    kind,
    type: nodeTypeFor(kind),
    category: categoryFor(kind),
    fields: {},
    ambiguousFields: {},
    retries: {},
  };
}

function isNodeFullyResolved(node) {
  return requiredFieldsFor(node.kind).every(
    (f) => node.fields[f] && !node.ambiguousFields[f]
  );
}

function getOrCreateTargetNode(state, kind, { allowNew } = {}) {
  const pool = state.nodes.filter((n) => n.kind === kind);
  if (pool.length === 0) {
    const n = createNode(kind);
    state.nodes.push(n);
    return n;
  }
  const candidate = pool.find((n) => !isNodeFullyResolved(n));
  if (candidate) return candidate;
  if (allowNew) {
    const n = createNode(kind);
    state.nodes.push(n);
    return n;
  }
  return pool[pool.length - 1];
}

function assignIds(state) {
  const counters = {};
  for (const node of state.nodes) {
    const key = node.type === 'trigger' ? 'trigger' : node.type === 'condition' ? 'condition' : 'action';
    counters[key] = (counters[key] || 0) + 1;
    node.id = `${key}_${counters[key]}`;
  }
}

// ---------------------------------------------------------------------------
// Merging extracted field updates into state (with contradiction detection)
// ---------------------------------------------------------------------------

function valuesDiffer(a, b) {
  return String(a).trim().toLowerCase() !== String(b).trim().toLowerCase();
}

function detectCorrectionSignal(rawText) {
  return ruleBased.containsCorrectionSignal(rawText || '');
}

/**
 * Applies { kind, fields } updates onto state.nodes. Returns true if a
 * contradiction was raised (in which case state.pendingContradiction is set
 * and the caller should stop merging further updates this turn).
 */
function applyNodeUpdate(state, update, rawText) {
  if (!update || !update.kind || !update.fields) return false;
  const kind = update.kind;
  if (!requiredFieldsFor(kind).length && kind !== 'action_generic') return false;

  const impliesNewAction = /\b(also|and then|as well|additionally)\b/i.test(rawText || '');
  const target = getOrCreateTargetNode(state, kind, {
    allowNew: kind.startsWith('action') && impliesNewAction,
  });

  const hasCorrection = detectCorrectionSignal(rawText);

  for (const [field, value] of Object.entries(update.fields)) {
    if (value === null || value === undefined || String(value).trim() === '') continue;
    const cleanValue = String(value).trim();

    if (target.fields[field] && valuesDiffer(target.fields[field], cleanValue)) {
      if (hasCorrection) {
        state.notices.push(`Updated ${field.replace(/_/g, ' ')} from "${target.fields[field]}" to "${cleanValue}".`);
        target.fields[field] = cleanValue;
        delete target.ambiguousFields[field];
        continue;
      }
      // Genuine contradiction — stop and ask for confirmation.
      state.pendingContradiction = {
        nodeId: target.id || `${target.kind}_pending`,
        kind: target.kind,
        field,
        oldValue: target.fields[field],
        newValue: cleanValue,
      };
      assignIds(state);
      return true;
    }
    target.fields[field] = cleanValue;
    delete target.ambiguousFields[field];
  }
  return false;
}

function applyAmbiguity(state, ambiguity) {
  if (!ambiguity || !ambiguity.kind || !ambiguity.field) return;
  const target = getOrCreateTargetNode(state, ambiguity.kind);
  // Don't overwrite an ambiguity flag with a lesser one, and never flag a
  // field that's already concretely resolved.
  if (target.fields[ambiguity.field]) return;
  target.ambiguousFields[ambiguity.field] = {
    reason: ambiguity.reason || 'This needs a concrete rule before the workflow can be built.',
    question: ambiguity.question || null,
  };
}

// ---------------------------------------------------------------------------
// Extraction (LLM-first, rule-based fallback, always safe)
// ---------------------------------------------------------------------------

function summarizeKnownState(state) {
  const summary = {};
  for (const node of state.nodes) {
    summary[node.kind] = summary[node.kind] || [];
    summary[node.kind].push(node.fields);
  }
  if (state.intentSummary) summary._intent = state.intentSummary;
  return summary;
}

async function extractWithLLM({ state, userMessage }) {
  const messages = prompts.buildAnalysisMessages({
    history: state.history,
    knownStateSummary: summarizeKnownState(state),
    latestUserMessage: userMessage,
    lastAskedQuestion: state.pendingQuestion?.question || null,
  });
  const result = await llmProvider.chatJSON(messages, { temperature: 0.1 });
  return {
    intentSummary: result.intent_summary || null,
    workflowNameSuggestion: result.workflow_name_suggestion || null,
    nodeUpdates: Array.isArray(result.node_updates) ? result.node_updates : [],
    ambiguities: Array.isArray(result.ambiguities) ? result.ambiguities : [],
    irrelevant: Boolean(result.irrelevant_response),
  };
}

function extractOpeningWithRules(userMessage) {
  const { nodes } = ruleBased.extractOpeningMessage(userMessage);
  const nodeUpdates = [];
  const ambiguities = [];
  for (const n of nodes) {
    if (n.seedFields && Object.keys(n.seedFields).length) {
      nodeUpdates.push({ kind: n.kind, fields: n.seedFields });
    } else {
      nodeUpdates.push({ kind: n.kind, fields: {} });
    }
    if (n.ambiguous) {
      ambiguities.push({
        kind: n.kind,
        field: 'value',
        reason: `"${n.ambiguousTerm}" doesn't define a concrete rule.`,
        question: `You mentioned "${n.ambiguousTerm}" — what specific rule or number defines that?`,
      });
    }
  }
  return { intentSummary: null, workflowNameSuggestion: null, nodeUpdates, ambiguities, irrelevant: false };
}

function isUncertainReply(text) {
  const t = (text || '').trim();
  return UNCERTAIN_PATTERNS.some((re) => re.test(t));
}

// ---------------------------------------------------------------------------
// Question phrasing (LLM-first, template fallback)
// ---------------------------------------------------------------------------

async function phraseQuestion({ fieldLabel, fallbackPrompt, state }) {
  if (!llmProvider.isConfigured()) return fallbackPrompt;
  try {
    const messages = prompts.buildQuestionMessages({
      fieldLabel,
      fallbackPrompt,
      knownStateSummary: summarizeKnownState(state),
      intentSummary: state.intentSummary,
    });
    const result = await llmProvider.chatJSON(messages, { temperature: 0.4 });
    return result.question || fallbackPrompt;
  } catch (err) {
    state.notices.push('AI phrasing unavailable for this question — used a built-in template instead.');
    return fallbackPrompt;
  }
}

// ---------------------------------------------------------------------------
// Readiness / next-action decision (fully deterministic)
// ---------------------------------------------------------------------------

const NODE_ORDER = ['trigger', 'condition', 'action_notify', 'action_generic'];

function findFirstAmbiguity(state) {
  for (const kind of NODE_ORDER) {
    for (const node of state.nodes.filter((n) => n.kind === kind)) {
      const fields = Object.keys(node.ambiguousFields);
      if (fields.length) {
        return { node, field: fields[0], info: node.ambiguousFields[fields[0]] };
      }
    }
  }
  return null;
}

function findFirstMissingField(state) {
  for (const kind of NODE_ORDER) {
    for (const node of state.nodes.filter((n) => n.kind === kind)) {
      for (const def of requiredFieldsFor(kind)) {
        if (!node.fields[def.key] && !node.ambiguousFields[def.key]) {
          return { node, def };
        }
      }
    }
  }
  return null;
}

function hasAnyActionNode(state) {
  return state.nodes.some((n) => n.kind === 'action_notify' || n.kind === 'action_generic');
}

function hasTriggerNode(state) {
  return state.nodes.some((n) => n.kind === 'trigger');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function processMessage(state, rawUserMessage) {
  const userMessage = (rawUserMessage || '').trim();
  state.turnCount += 1;

  if (!userMessage) {
    return respond(state, "I didn't receive any text — could you type your answer?", { skipHistory: true });
  }

  state.history.push({ role: 'user', content: userMessage, ts: Date.now() });

  // -----------------------------------------------------------------
  // 1. Resolving a pending contradiction takes absolute priority.
  // -----------------------------------------------------------------
  if (state.pendingContradiction) {
    resolveContradiction(state, userMessage);
    state.pendingContradiction = null;
  } else {
    // ---------------------------------------------------------------
    // 2. Extract structured info from this turn (LLM, then rules).
    // ---------------------------------------------------------------
    let extraction;
    const isOpening = state.turnCount === 1 && state.nodes.length === 0;
    try {
      if (llmProvider.isConfigured()) {
        extraction = await extractWithLLM({ state, userMessage });
      } else {
        throw new Error('no-llm-configured');
      }
    } catch (err) {
      if (llmProvider.isConfigured()) {
        state.notices.push('AI extraction failed for this turn — used the built-in rule-based parser instead.');
      }
      extraction = isOpening
        ? extractOpeningWithRules(userMessage)
        : { intentSummary: null, workflowNameSuggestion: null, nodeUpdates: [], ambiguities: [], irrelevant: false };
    }

    if (extraction.intentSummary) state.intentSummary = extraction.intentSummary;
    if (extraction.workflowNameSuggestion && !state.workflowName) {
      state.workflowName = extraction.workflowNameSuggestion;
    }

    // Ensure a trigger node always exists once the conversation has started.
    if (isOpening && !hasTriggerNode(state)) {
      state.nodes.push(createNode('trigger'));
    }

    let contradicted = false;
    for (const update of extraction.nodeUpdates) {
      if (applyNodeUpdate(state, update, userMessage)) {
        contradicted = true;
        break;
      }
    }
    for (const amb of extraction.ambiguities) applyAmbiguity(state, amb);

    // ---------------------------------------------------------------
    // 3. Deterministic guarantee: if we asked a specific field and
    //    nothing above touched it, the raw reply IS the answer.
    // ---------------------------------------------------------------
    if (!contradicted && state.pendingQuestion && !state.pendingQuestion.isOptionalClosing) {
      const { node, field } = resolvePendingTarget(state);
      const alreadyAnswered = node && field && node.fields[field];
      if (node && field && !alreadyAnswered) {
        if (extraction.irrelevant) {
          node.retries[field] = (node.retries[field] || 0) + 1;
        } else if (isUncertainReply(userMessage)) {
          node.retries[field] = (node.retries[field] || 0) + 1;
        } else {
          node.fields[field] = userMessage;
          delete node.ambiguousFields[field];
        }
      }
    } else if (!contradicted && state.pendingQuestion?.isOptionalClosing) {
      const noSkip = /^(no|none|nope|skip|n\/a|na)\.?$/i.test(userMessage.trim());
      if (!noSkip) state.optionalPreferencesAnswer = userMessage;
    }
  }

  if (state.pendingContradiction) {
    assignIds(state);
    return respond(state, buildContradictionQuestion(state.pendingContradiction), {
      status: STATUS.CONFIRMING_CONTRADICTION,
      isContradiction: true,
    });
  }

  assignIds(state);

  // -----------------------------------------------------------------
  // 4. Decide what happens next — fully deterministic.
  // -----------------------------------------------------------------
  const ambiguity = findFirstAmbiguity(state);
  if (ambiguity) {
    const question =
      ambiguity.info.question ||
      (await phraseQuestion({
        fieldLabel: ambiguity.field,
        fallbackPrompt: `Could you clarify what "${ambiguity.field}" should mean exactly?`,
        state,
      }));
    state.pendingQuestion = { nodeId: ambiguity.node.id, field: ambiguity.field, question, isAmbiguity: true };
    return respond(state, question, { status: STATUS.CLARIFYING });
  }

  const missing = findFirstMissingField(state);
  if (missing) {
    const { node, def } = missing;
    const retries = node.retries[def.key] || 0;
    let question;
    if (retries >= MAX_RETRIES_BEFORE_SUGGESTIONS) {
      question = buildSuggestionQuestion(node, def);
    } else if (retries > 0) {
      question = `Just to make sure I get this right — ${lowerFirst(def.prompt)}`;
    } else {
      question = await phraseQuestion({ fieldLabel: def.label, fallbackPrompt: def.prompt, state });
    }
    state.pendingQuestion = { nodeId: node.id, field: def.key, question };
    return respond(state, question, { status: STATUS.CLARIFYING });
  }

  if (!hasAnyActionNode(state) || !hasTriggerNode(state)) {
    // Should not normally happen (opening pass always seeds both), but keep
    // the system honest rather than ever silently generating an incomplete
    // workflow.
    state.pendingQuestion = { nodeId: null, field: 'action_generic.target', question: 'What should this workflow actually do once triggered?' };
    return respond(state, state.pendingQuestion.question, { status: STATUS.CLARIFYING });
  }

  if (!state.askedOptionalClosing) {
    state.askedOptionalClosing = true;
    state.pendingQuestion = { nodeId: null, field: OPTIONAL_CLOSING_FIELD.key, question: OPTIONAL_CLOSING_FIELD.prompt, isOptionalClosing: true };
    return respond(state, OPTIONAL_CLOSING_FIELD.prompt, { status: STATUS.CLARIFYING });
  }

  // -----------------------------------------------------------------
  // 5. Everything mandatory is resolved — generate the workflow.
  // -----------------------------------------------------------------
  state.pendingQuestion = null;
  state.status = STATUS.READY;
  const workflow = await buildFinalWorkflow(state, { llmProvider, prompts });
  state.generatedWorkflow = workflow;
  state.status = STATUS.GENERATED;

  const closingMessage = `All set! I've collected everything needed and generated your workflow: **${workflow.workflow.name}**. You can review the structured breakdown on the right, or download the JSON.`;
  return respond(state, closingMessage, { status: STATUS.GENERATED, workflow });
}

function resolvePendingTarget(state) {
  const pq = state.pendingQuestion;
  if (!pq || !pq.nodeId) return {};
  const node = state.nodes.find((n) => n.id === pq.nodeId);
  return { node, field: pq.field };
}

function resolveContradiction(state, userMessage) {
  const { nodeId, kind, field, oldValue, newValue } = state.pendingContradiction;
  const node = state.nodes.find((n) => n.id === nodeId) || state.nodes.filter((n) => n.kind === kind).slice(-1)[0];
  if (!node) return;
  const t = userMessage.trim().toLowerCase();
  let resolved;
  if (t.includes(String(oldValue).toLowerCase())) resolved = oldValue;
  else if (t.includes(String(newValue).toLowerCase()) || /^(yes|yeah|yep|correct|right|confirm)/i.test(t)) resolved = newValue;
  else resolved = userMessage.trim();
  node.fields[field] = resolved;
  delete node.ambiguousFields[field];
  state.notices.push(`Confirmed ${field.replace(/_/g, ' ')} as "${resolved}".`);
}

function buildContradictionQuestion({ field, oldValue, newValue }) {
  const label = field.replace(/_/g, ' ');
  return `Just to confirm — earlier I had the ${label} as "${oldValue}", but this sounds like "${newValue}". Which one should I use?`;
}

function buildSuggestionQuestion(node, def) {
  const suggestionBank = {
    channel: 'For example: email, Slack, SMS, or Microsoft Teams.',
    source: 'For example: Gmail, a webhook, a form, or a schedule.',
    operator: 'For example: equals, is greater than, is less than, or contains.',
  };
  const hint = suggestionBank[def.key] ? ` ${suggestionBank[def.key]}` : '';
  return `Let's try that differently — ${lowerFirst(def.prompt)}${hint}`;
}

function lowerFirst(s) {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function respond(state, message, meta = {}) {
  if (!meta.skipHistory) {
    state.history.push({ role: 'assistant', content: message, ts: Date.now() });
  }
  if (meta.status) state.status = meta.status;
  return {
    state,
    message,
    workflow: meta.workflow || null,
  };
}

module.exports = {
  createSession,
  processMessage,
  // exported for tests
  _internal: {
    applyNodeUpdate,
    applyAmbiguity,
    findFirstAmbiguity,
    findFirstMissingField,
    isNodeFullyResolved,
    createNode,
    assignIds,
  },
};
