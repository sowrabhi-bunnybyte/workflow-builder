/**
 * ruleBasedExtractor.js
 * ---------------------------------------------------------------------------
 * A small, dependency-free keyword/regex extractor. It has two jobs:
 *
 *  1. OPENING PASS — read the user's very first free-form message and take a
 *     best-effort guess at which nodes exist (trigger / condition / action)
 *     and which of their fields are already answered, so we don't ask about
 *     things the user already told us (FR-10, AC-05).
 *
 *  2. SAFETY NET — if no LLM API key is configured, or the LLM call fails,
 *     the whole conversation can still be completed by this module alone.
 *     It never needs to fully "understand" a free-form answer: once the
 *     dialogue manager has asked a *specific* question about a *specific*
 *     field, the raw trimmed reply is accepted as that field's value. NLU is
 *     only needed to bootstrap node discovery from the opening message.
 * ---------------------------------------------------------------------------
 */

const { AMBIGUOUS_QUALIFIERS } = require('./schema');

const SOURCE_KEYWORDS = [
  'gmail', 'outlook', 'email', 'slack', 'webhook', 'form', 'typeform',
  'google sheet', 'sheet', 'shopify', 'stripe', 'salesforce', 'hubspot',
  'calendar', 'sms', 'whatsapp', 'zendesk', 'jira', 'trello', 'notion',
  'airtable', 'twitter', 'instagram', 'facebook', 'schedule', 'cron',
];

const CHANNEL_KEYWORDS = ['slack', 'email', 'sms', 'teams', 'whatsapp', 'discord', 'telegram', 'push notification'];

const NOTIFY_VERBS = ['notify', 'alert', 'message', 'ping', 'email', 'text', 'inform', 'let.*know', 'send.*notification'];
const CONDITION_SIGNALS = [
  'if ', ' if,', 'only if', 'only when', 'when the', 'whenever the value',
  'above', 'below', 'greater than', 'more than', 'less than', 'at least',
  'meets my criteria', 'qualif', 'exceeds', 'over $', 'over ₹', 'over £',
];

function lower(s) {
  return (s || '').toLowerCase();
}

function findKeyword(text, keywords) {
  const t = lower(text);
  for (const kw of keywords) {
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '.*' : `\\${m}`)), 'i');
    if (re.test(t)) return kw;
  }
  return null;
}

function hasAny(text, list) {
  const t = lower(text);
  return list.some((kw) => t.includes(kw));
}

/**
 * Extract a currency/number threshold like "$10,000", "10000", "above 500".
 */
function extractNumericValue(text) {
  const match = text.match(/([₹$€£]?\s?[\d][\d,]*\.?\d*)/);
  return match ? match[1].trim() : null;
}

/**
 * Best-effort structural read of the opening message.
 * Returns a partial node list compatible with WorkflowState.nodes.
 */
function extractOpeningMessage(text) {
  const nodes = [];
  const notes = [];

  // --- Action (computed first) --------------------------------------
  // Some source/channel words (Gmail, Slack, email...) can plausibly be
  // *either* the trigger source or the notification channel. We resolve
  // the channel first from whichever clause contains the notify verb, so
  // the trigger-source search below can deliberately avoid re-claiming
  // the same word — see the comment there for why.
  const isNotify = NOTIFY_VERBS.some((v) => new RegExp(v, 'i').test(text));
  const actionFields = {};
  let actionKind = 'action_generic';
  let channel = null;
  if (isNotify) {
    actionKind = 'action_notify';
    channel = findKeyword(text, CHANNEL_KEYWORDS);
    if (channel) actionFields.channel = capitalize(channel);
    const teamMatch = text.match(/(my\s+)?([a-z]+\s+team|team|#[a-z0-9_-]+)/i);
    if (teamMatch && !actionFields.recipient) actionFields.recipient = teamMatch[0].trim();
  }

  // --- Trigger -------------------------------------------------------
  // Deliberately skip a source keyword that's identical to the word we
  // already claimed as the notification channel. A single ambiguous word
  // (e.g. "Slack" in "notify me on Slack...") almost never plays both
  // roles in the same sentence, and per the "never assume" principle it
  // is safer to leave the source unset (and ask) than to silently guess.
  const rawSource = findKeyword(text, SOURCE_KEYWORDS);
  const source = rawSource && channel && rawSource === channel ? null : rawSource;
  const triggerFields = {};
  if (source) triggerFields.source = capitalize(source);

  // crude "event" guess: look for "new X" pattern, up to the next clause break
  const newMatch = text.match(/\bnew\s+[^,.;]+/i);
  if (newMatch) triggerFields.event = newMatch[0].trim().replace(/\s+/g, ' ');

  nodes.push({
    kind: 'trigger',
    seedFields: triggerFields,
  });

  // --- Condition -------------------------------------------------------
  // A condition is implied either by explicit comparison language ("if",
  // "above", "greater than"...) or by a qualitative adjective on the
  // trigger subject ("a good lead", "an important ticket") — the latter
  // is exactly the ambiguity example in the spec (section 5, Step 4).
  const hasQualifier = AMBIGUOUS_QUALIFIERS.some((q) => lower(text).includes(q));
  const hasConditionSignal = hasAny(text, CONDITION_SIGNALS) || hasQualifier;
  if (hasConditionSignal) {
    const conditionFields = {};
    const ambiguousTerm = AMBIGUOUS_QUALIFIERS.find((q) => lower(text).includes(q));
    const numericValue = extractNumericValue(text);
    if (numericValue && !ambiguousTerm) {
      conditionFields.value = numericValue;
    }
    nodes.push({
      kind: 'condition',
      seedFields: conditionFields,
      ambiguous: Boolean(ambiguousTerm) && !numericValue,
      ambiguousTerm,
    });
  }

  // --- Action ------------------------------------------------------------
  nodes.push({
    kind: actionKind,
    seedFields: actionFields,
  });

  return { nodes, notes };
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Detect correction language like "actually make it Slack instead". */
function containsCorrectionSignal(text) {
  const { CORRECTION_SIGNALS } = require('./schema');
  return hasAny(text, CORRECTION_SIGNALS);
}

module.exports = {
  extractOpeningMessage,
  containsCorrectionSignal,
  findKeyword,
  hasAny,
  extractNumericValue,
  CHANNEL_KEYWORDS,
  SOURCE_KEYWORDS,
};
