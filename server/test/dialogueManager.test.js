const test = require('node:test');
const assert = require('node:assert/strict');
const dialogueManager = require('../src/engine/dialogueManager');
const { STATUS } = require('../src/engine/schema');

// These tests intentionally run with NO LLM_PROVIDER / API key set, proving
// the deterministic rule-based path alone can complete a full conversation
// (NFR-02: testable independently of the UI and of any external AI service).

test('full conversation reaches a valid generated workflow (rule-based mode)', async () => {
  let state = dialogueManager.createSession();
  assert.equal(state.llmAvailable, false);

  let result = await dialogueManager.processMessage(
    state,
    "Whenever a new invoice email arrives, notify my finance team only if it's over ₹10,000"
  );
  state = result.state;

  // condition field + operator are not stated -> must be asked, never assumed
  let guard = 0;
  while (state.status !== STATUS.GENERATED && guard < 10) {
    assert.notEqual(state.status, STATUS.ERROR);
    assert.ok(result.message && result.message.length > 0, 'must always ask something concrete, never stay silent');
    let answer = 'yes';
    if (/piece of data/i.test(result.message)) answer = 'the invoice amount';
    else if (/compared/i.test(result.message)) answer = 'greater than';
    else if (/additional preferences/i.test(result.message)) answer = 'no';
    else answer = 'ok';
    result = await dialogueManager.processMessage(state, answer);
    state = result.state;
    guard += 1;
  }

  assert.equal(state.status, STATUS.GENERATED, 'workflow should eventually be generated');
  assert.ok(result.workflow, 'a workflow payload must be returned on generation');
  const wf = result.workflow.workflow;
  assert.equal(typeof wf.name, 'string');
  assert.ok(wf.nodes.length >= 3, 'expects at least trigger + condition + action nodes');
  assert.ok(wf.nodes.some((n) => n.type === 'trigger'));
  assert.ok(wf.nodes.some((n) => n.type === 'condition'));
  assert.ok(wf.nodes.some((n) => n.type === 'action'));
  assert.ok(wf.connections.length >= wf.nodes.length - 1);

  // FR-15 / AC-08: the system must never claim to have executed anything.
  const serialized = JSON.stringify(wf).toLowerCase();
  assert.ok(!serialized.includes('"executed"'));
});

test('never generates a workflow while mandatory info (trigger source) is missing', async () => {
  let state = dialogueManager.createSession();
  const result = await dialogueManager.processMessage(state, 'Notify me when something important happens');
  assert.notEqual(result.state.status, STATUS.GENERATED);
  assert.equal(result.state.status, STATUS.CLARIFYING);
  assert.ok(result.message.length > 0);
});

test('empty input is rejected without crashing or advancing turn count assumptions', async () => {
  const state = dialogueManager.createSession();
  const result = await dialogueManager.processMessage(state, '   ');
  assert.match(result.message, /didn't receive any text/i);
  assert.notEqual(result.state.status, STATUS.GENERATED);
});

test('uncertain replies ("I don\'t know") do not get recorded as a value', async () => {
  let state = dialogueManager.createSession();
  let result = await dialogueManager.processMessage(state, 'Send a Slack message when a form is submitted');
  state = result.state;
  // Whatever field is asked next, answer "I don't know" and confirm it's not stored.
  const askedAbout = result.message;
  result = await dialogueManager.processMessage(state, "I don't know");
  state = result.state;
  const allValues = state.nodes.flatMap((n) => Object.values(n.fields));
  assert.ok(!allValues.includes("I don't know"));
});
