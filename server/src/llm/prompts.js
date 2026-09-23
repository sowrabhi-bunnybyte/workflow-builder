/**
 * prompts.js
 * ---------------------------------------------------------------------------
 * All prompt construction lives here, separated from both the HTTP layer
 * and the deterministic engine (NFR-01: maintainability / separation of
 * concerns).
 *
 * IMPORTANT DESIGN NOTE: the LLM is never asked "is the workflow ready?" or
 * "what should happen next?". It is only ever asked to *extract structured
 * information* from the latest message. All control-flow decisions
 * (missing fields, ambiguity resolution order, readiness, contradictions)
 * are computed deterministically in engine/dialogueManager.js from the
 * fields the LLM (or the rule-based fallback) reports. This is what makes
 * the "never assume missing information" guarantee hold even when the
 * model is wrong, verbose, or unavailable.
 * ---------------------------------------------------------------------------
 */

const SYSTEM_PROMPT = `You are the extraction engine inside a conversational workflow-planning tool.
Your ONLY job: read the latest user message (with conversation context) and pull out
structured facts about an automation workflow being described. You do NOT decide what
happens next, you do NOT ask questions, and you must NEVER invent a value the user did
not state or clearly imply. If something is not mentioned, omit it — do not guess.

A workflow has up to three kinds of nodes:
- "trigger": what starts the workflow. Fields: source (app/platform/event source), event (what happens on it).
- "condition": a branching check. Fields: field (what data is checked), operator (equals/greater than/less than/contains/etc), value (the threshold or exact value).
- "action": what happens as a result. Fields depend on category:
    - category "notify": channel (email/slack/sms/etc), recipient (who/where)
    - category "create" | "update" | "other": target (system/place the action happens in), details (free text, optional)

Respond with STRICT JSON only, matching this shape exactly (omit fields you have no information for; use null rather than guessing):
{
  "intent_summary": "one short sentence describing the overall automation goal, or null if still unclear",
  "workflow_name_suggestion": "short title or null",
  "node_updates": [
    { "kind": "trigger" | "condition" | "action_notify" | "action_generic", "fields": { "<field>": "<value>" } }
  ],
  "ambiguities": [
    { "kind": "trigger" | "condition" | "action_notify" | "action_generic", "field": "<field>", "reason": "short reason this is ambiguous", "question": "a specific clarifying question" }
  ],
  "irrelevant_response": false
}

Rules:
- Only include a field in "fields" if the user's message actually states or clearly implies it.
- If the user uses a vague qualifier for a condition (e.g. "good lead", "high-value", "important") without a concrete rule, do NOT invent a threshold — instead add it to "ambiguities" with kind "condition" and field "value".
- If the current message does not answer anything and is off-topic or a question back to the assistant, set "irrelevant_response": true and leave node_updates empty.
- Never fabricate a recipient, channel, source, or numeric threshold that was not stated.
- Output valid JSON and nothing else — no markdown fences, no commentary.`;

function buildAnalysisMessages({ history, knownStateSummary, latestUserMessage, lastAskedQuestion }) {
  const contextBlock = `CURRENT KNOWN WORKFLOW STATE (already-confirmed information — do not re-extract these unless the user is clearly changing one of them):
${JSON.stringify(knownStateSummary, null, 2)}

${lastAskedQuestion ? `THE ASSISTANT JUST ASKED: "${lastAskedQuestion}"` : 'This is the opening message — no question has been asked yet.'}

LATEST USER MESSAGE:
"${latestUserMessage}"`;

  const historyText = history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `RECENT CONVERSATION:\n${historyText}\n\n${contextBlock}` },
  ];
}

const QUESTION_SYSTEM_PROMPT = `You phrase a single, friendly, non-technical clarification question for a
workflow-building chatbot. You are given the field that still needs a value and light context.
Respond with STRICT JSON only: { "question": "..." }
The question must:
- Ask about exactly ONE thing.
- Be understandable to a non-technical user (no jargon like "payload" or "schema").
- Be short (under 25 words).
- Not repeat information already known, and not re-ask anything already answered.`;

function buildQuestionMessages({ fieldLabel, fallbackPrompt, knownStateSummary, intentSummary }) {
  return [
    { role: 'system', content: QUESTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Workflow goal so far: ${intentSummary || 'not yet summarized'}
Already known: ${JSON.stringify(knownStateSummary)}
Field that needs a value: "${fieldLabel}"
A reasonable default question (improve on this, don't just repeat it verbatim): "${fallbackPrompt}"`,
    },
  ];
}

const NARRATIVE_SYSTEM_PROMPT = `You write short, clear, human-readable labels for a workflow diagram.
Given a fully-specified node (type, category, and its collected fields), respond with STRICT JSON only:
{ "name": "short node title (3-6 words)", "description": "one short plain-English sentence describing what this node does" }
Do not invent any information beyond what is given in the fields.`;

function buildNarrativeMessages({ node }) {
  return [
    { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(node) },
  ];
}

module.exports = {
  buildAnalysisMessages,
  buildQuestionMessages,
  buildNarrativeMessages,
};
