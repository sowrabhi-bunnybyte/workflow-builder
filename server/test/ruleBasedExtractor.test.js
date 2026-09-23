const test = require('node:test');
const assert = require('node:assert/strict');
const ruleBased = require('../src/engine/ruleBasedExtractor');
const dialogueManager = require('../src/engine/dialogueManager');

test('flags vague qualifiers as ambiguous instead of inventing a threshold', () => {
  const { nodes } = ruleBased.extractOpeningMessage('Notify me whenever a good lead comes in');
  const condition = nodes.find((n) => n.kind === 'condition');
  assert.ok(condition, 'a condition candidate should be detected from "whenever...good lead"');
  assert.equal(condition.ambiguous, true);
  assert.equal(condition.ambiguousTerm, 'good');
});

test('does not flag a condition when a concrete numeric value is given', () => {
  const { nodes } = ruleBased.extractOpeningMessage('Notify me if the order total is above $500');
  const condition = nodes.find((n) => n.kind === 'condition');
  assert.ok(condition);
  assert.equal(condition.ambiguous, false);
  assert.equal(condition.seedFields.value, '$500');
});

test('detects explicit correction language', () => {
  assert.equal(ruleBased.containsCorrectionSignal('Actually, make it Slack instead'), true);
  assert.equal(ruleBased.containsCorrectionSignal('Send it to the finance team'), false);
});

test('applyNodeUpdate raises a contradiction when a resolved field is overwritten without correction language', () => {
  const state = dialogueManager.createSession();
  const node = dialogueManager._internal.createNode('trigger');
  node.id = 'trigger_1';
  node.fields.source = 'Gmail';
  state.nodes.push(node);

  const contradicted = dialogueManager._internal.applyNodeUpdate(
    state,
    { kind: 'trigger', fields: { source: 'Outlook' } },
    'It should watch Outlook for new mail'
  );

  assert.equal(contradicted, true);
  assert.ok(state.pendingContradiction);
  assert.equal(state.pendingContradiction.oldValue, 'Gmail');
  assert.equal(state.pendingContradiction.newValue, 'Outlook');
  // must not silently overwrite (FR: no silent overwrite on contradiction)
  assert.equal(node.fields.source, 'Gmail');
});

test('applyNodeUpdate overwrites silently when correction language is present', () => {
  const state = dialogueManager.createSession();
  const node = dialogueManager._internal.createNode('action_notify');
  node.id = 'action_1';
  node.fields.channel = 'Email';
  state.nodes.push(node);

  const contradicted = dialogueManager._internal.applyNodeUpdate(
    state,
    { kind: 'action_notify', fields: { channel: 'Slack' } },
    'Actually, send it through Slack'
  );

  assert.equal(contradicted, false);
  assert.equal(node.fields.channel, 'Slack');
});
