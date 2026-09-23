const express = require('express');
const dialogueManager = require('../engine/dialogueManager');
const sessionStore = require('../engine/sessionStore');
const { serializeState } = require('../engine/serialize');

const router = express.Router();

const GREETING =
  "Hi! I'm your workflow-planning assistant. Describe the automation you want in plain English — " +
  '(for example: "When a new invoice email arrives, notify my finance team on Slack if it\'s over ₹10,000") ' +
  "and I'll ask whatever I need to build a complete, structured workflow. I won't guess at missing details — I'll always ask.";

router.post('/session', (req, res) => {
  const state = dialogueManager.createSession();
  state.history.push({ role: 'assistant', content: GREETING, ts: Date.now() });
  sessionStore.put(state.sessionId, state);
  res.json({ sessionId: state.sessionId, greeting: GREETING, state: serializeState(state) });
});

router.get('/session/:id', (req, res) => {
  const state = sessionStore.get(req.params.id);
  if (!state) return res.status(404).json({ error: 'Session not found. Start a new one.' });
  res.json({
    state: serializeState(state),
    history: state.history,
  });
});

router.post('/session/:id/message', async (req, res) => {
  const { id } = req.params;
  const { message } = req.body || {};
  const state = sessionStore.get(id);
  if (!state) return res.status(404).json({ error: 'Session not found. Start a new one.' });
  if (typeof message !== 'string') {
    return res.status(400).json({ error: 'Field "message" (string) is required.' });
  }

  try {
    const result = await dialogueManager.processMessage(state, message);
    sessionStore.put(id, result.state);
    res.json({
      reply: result.message,
      state: serializeState(result.state),
      workflow: result.workflow,
    });
  } catch (err) {
    // Last-resort safety net: even an unexpected engine error must not
    // silently fabricate a workflow or crash the session (FR-16, NFR-03).
    console.error('[chat] processMessage failed:', err);
    state.notices.push('Something went wrong processing that message — please try rephrasing.');
    sessionStore.put(id, state);
    res.status(200).json({
      reply: "Sorry, something went wrong on my end processing that. Could you rephrase or try again?",
      state: serializeState(state),
      workflow: null,
    });
  }
});

router.post('/session/:id/reset', (req, res) => {
  sessionStore.remove(req.params.id);
  const state = dialogueManager.createSession();
  state.history.push({ role: 'assistant', content: GREETING, ts: Date.now() });
  sessionStore.put(state.sessionId, state);
  res.json({ sessionId: state.sessionId, greeting: GREETING, state: serializeState(state) });
});

module.exports = router;
