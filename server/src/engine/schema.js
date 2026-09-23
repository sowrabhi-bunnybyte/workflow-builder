/**
 * schema.js
 * ---------------------------------------------------------------------------
 * The single source of truth for what a "complete" workflow node looks like.
 *
 * This registry is the deterministic backbone of the engine (see
 * dialogueManager.js). The LLM is used to *populate* and *suggest* structure,
 * but whether a field is "mandatory" and whether the workflow is "ready" is
 * always decided here, in code — never by asking the LLM to self-report
 * completeness. This keeps the system's core promise (FR-06: never assume
 * missing information) true even if the LLM hallucinates or is unavailable.
 * ---------------------------------------------------------------------------
 */

const STATUS = Object.freeze({
  INITIAL: 'initial',
  UNDERSTANDING: 'understanding',
  CLARIFYING: 'clarifying',
  CONFIRMING_CONTRADICTION: 'confirming_contradiction',
  READY: 'ready',
  GENERATED: 'generated',
  ERROR: 'error',
});

const NODE_TYPE = Object.freeze({
  TRIGGER: 'trigger',
  CONDITION: 'condition',
  ACTION: 'action',
});

const ACTION_CATEGORY = Object.freeze({
  NOTIFY: 'notify',
  CREATE: 'create',
  UPDATE: 'update',
  OTHER: 'other',
});

/**
 * Field registry per node "kind". Each field has:
 *  - key: the field name stored on node.fields
 *  - prompt: fallback question template (used when the LLM is unavailable
 *            or fails) — always phrased as ONE specific, non-technical
 *            question (Clarification Strategy, Principle 2).
 *  - label: human label used in the "known information" table in the UI
 */
const FIELD_REGISTRY = Object.freeze({
  trigger: [
    { key: 'source', label: 'Trigger source', prompt: 'What app, platform, or event source should start this workflow? (e.g. Gmail, a webhook, a form submission, a schedule)' },
    { key: 'event', label: 'Trigger event', prompt: 'What exactly should happen on that source to start the workflow? (e.g. "a new email arrives", "a new row is added")' },
  ],
  condition: [
    { key: 'field', label: 'Condition field', prompt: 'What piece of data should this condition check?' },
    { key: 'operator', label: 'Comparison', prompt: 'How should that value be compared — for example equals, is greater than, contains, or something else?' },
    { key: 'value', label: 'Threshold / value', prompt: 'What exact value or threshold should it be compared against?' },
  ],
  action_notify: [
    { key: 'channel', label: 'Notification channel', prompt: 'How should the notification be delivered — email, Slack, SMS, or something else?' },
    { key: 'recipient', label: 'Recipient', prompt: 'Who or which channel/address should receive it? (e.g. #finance, a specific email address, a team)' },
  ],
  action_generic: [
    { key: 'target', label: 'Target system', prompt: 'Where should this action happen — which app, sheet, or system should be updated?' },
  ],
});

/** Optional, asked at most once, never blocks readiness on its own. */
const OPTIONAL_CLOSING_FIELD = {
  key: 'additional_preferences',
  label: 'Additional preferences',
  prompt: 'One last thing — any other preferences for this workflow? For example, how duplicates should be handled. (Say "no" to skip.)',
};

/** Vague qualifiers that make a condition ambiguous until pinned to a concrete rule. */
const AMBIGUOUS_QUALIFIERS = [
  'good', 'bad', 'high-value', 'high value', 'important', 'qualified',
  'relevant', 'valid', 'urgent', 'big', 'large', 'small', 'low-value',
  'low value', 'serious', 'genuine', 'real', 'legit', 'worth it',
];

/** Words that signal the user is explicitly correcting/overriding a prior answer. */
const CORRECTION_SIGNALS = [
  'actually', 'instead', 'no wait', 'change it to', 'not that', 'i meant',
  'sorry i meant', 'scratch that', 'correction', 'update it to', 'make it',
  'switch to', 'rather than', 'not ', 'no,', 'no -', 'wait,',
];

module.exports = {
  STATUS,
  NODE_TYPE,
  ACTION_CATEGORY,
  FIELD_REGISTRY,
  OPTIONAL_CLOSING_FIELD,
  AMBIGUOUS_QUALIFIERS,
  CORRECTION_SIGNALS,
};
