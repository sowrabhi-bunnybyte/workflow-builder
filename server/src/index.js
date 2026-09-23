require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const chatRoutes = require('./routes/chat');
const llmProvider = require('./llm/provider');

const app = express();
const PORT = process.env.PORT || 8787;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    llmProvider: llmProvider.PROVIDER,
    llmConfigured: llmProvider.isConfigured(),
  });
});

app.use('/api/chat', chatRoutes);

// In production, the client is built into client/dist and served here so
// the whole app is a single deployable service (see README "Hosting").
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n  Workflow Builder server listening on http://localhost:${PORT}`);
  console.log(`  LLM provider: ${llmProvider.PROVIDER} — configured: ${llmProvider.isConfigured()}`);
  if (!llmProvider.isConfigured()) {
    console.log('  No LLM API key found — running in offline/rule-based fallback mode.');
    console.log('  Add GROQ_API_KEY (or set LLM_PROVIDER=gemini + GEMINI_API_KEY) to server/.env for smarter conversations.\n');
  } else {
    console.log('');
  }
});
